/**
 * 话题写作 mid-pre：按类别 + 写作风格快速检索创作素材，再经「写作选题」text 业务提炼可写话题池。
 * 与行业日报热点提炼完全分离（查询词、维度、条数、textKey、输出格式均不同）。
 * 检索原则：
 * 1) 类别定域（谈话/短剧/财经… + 近热时间窗 week）
 * 2) 风格 search_angles 定「这类节目需要什么题材类型」
 * 3) topic_hints / 节目名 / 风格显示名只进提炼合同，禁止硬丢进 web query
 */
import type { SearchDepth, SearchDimension, SearchResultItem } from '../../core/search/types';
import {
  getCatalogVoice,
  getSearchAngles,
  getTopicHints,
  getVoiceCategory,
  pickI18n,
  resolveVoiceForModelAsync,
  type VoiceCraft,
} from '../writing-style-presets/writing-voice-presets';

/** 送模的精简文风块（不含 UI 人名） */
export type VoiceStyleTopicBrief = {
  voice_id: string;
  voice_label: string;
  blurb: string;
  topic_hints: string[];
  craft?: VoiceCraft;
};

/** 并行查询上限（速度优先） */
export const VOICE_STYLE_QUERY_MAX = 3;
/** 检索命中上限（送模前再截） */
export const VOICE_STYLE_SEARCH_MAX = 24;
/** 送模候选上限 */
export const VOICE_STYLE_INPUT_MAX = 16;

/**
 * 节目/风格专名：禁止进检索 query（只允许进 extract 合同定笔法）。
 * 含「圆桌派」及易被搜成节目考古的「圆桌」单字搭配。
 */
const SHOW_OR_STYLE_NAME_RE =
  /锵锵(?:三人行)?|三人行|窦文涛|圆桌派|圆桌辩论|圆桌资料|鲁豫(?:有约)?|面对面|杨澜|Oprah|HARDtalk|Fresh\s*Air|脱口秀大会|奇葩说/gi;

/** 从检索句中剔除节目/风格专名，避免搜出节目单、嘉宾名单 */
export function scrubShowNamesFromSearchQuery(q: string): string {
  const cleaned = String(q || '')
    .replace(SHOW_OR_STYLE_NAME_RE, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return cleaned;
}
/** 发现池话题默认条数 */
export const VOICE_STYLE_TOPIC_DEFAULT = 24;
const TOPIC_PAGE_SIZE = 12;

function clampSearchMaxResults(n: unknown, fallback = VOICE_STYLE_SEARCH_MAX): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.floor(n) : fallback;
  return Math.max(1, Math.min(VOICE_STYLE_SEARCH_MAX, v));
}

function clampTopicMaxResults(n: unknown, fallback = VOICE_STYLE_TOPIC_DEFAULT): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.floor(n) : fallback;
  return Math.max(1, Math.min(36, v));
}

export type VoiceStyleTopicPreviewInput = {
  voiceCategory: string;
  voiceId: string;
  language?: string;
  searchRegion?: string;
  maxResults?: number;
  topicCount?: number;
  userId?: string;
};

export type VoiceStyleTopicDiagnostics = {
  queryCount: number;
  queries: string[];
  hitCount: number;
  inputItemsForLlm: number;
  approxInputChars: number;
  searchDimensions: SearchDimension[];
  timeRange: string;
  parallel: boolean;
};

export type VoiceStyleTopicPreviewResult = {
  query: string;
  queries: string[];
  depth: string;
  providers: string[];
  hitCount: number;
  truncated: boolean;
  text: string;
  items: Array<{ title: string; url: string; snippet: string; domain: string }>;
  topicChips: string[];
  topicPool: string[];
  intentLabel: string;
  diagnostics: VoiceStyleTopicDiagnostics;
};

function uniq(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const s = String(raw || '').trim().replace(/\s+/g, ' ');
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

type LangKey = 'zh' | 'zh-TW' | 'en' | 'ja';

function langKey(lang: string): LangKey {
  if (lang === 'zh-TW' || lang === 'zh_tw') return 'zh-TW';
  if (lang === 'en' || lang === 'ja') return lang;
  return 'zh';
}

/**
 * 选题预览时间窗：优先近热。默认近 7 天，避免 month 窗翻出过气爆款（如旧「老板体验日」）。
 */
export function timeRangeForVoiceCategory(
  _voiceCategory: string
): 'day' | 'week' | 'month' {
  return 'week';
}

/**
 * 各类别「当前热门对应内容」检索词。
 * 只按类别拼 query；文风名/节目名只进 extract 合同定笔法，禁止进检索。
 */
function creativeQueries(args: {
  catId: string;
  catLabel: string;
  lang: string;
}): string[] {
  const { catId, catLabel, lang } = args;
  const l = langKey(lang);

  const pack: Record<string, Partial<Record<LangKey, string[]>>> = {
    hongguo_drama: {
      zh: [
        '热门短剧 剧情简介 爆款',
        '红果 抖音 竖屏短剧 近期热播 剧名',
        `${catLabel} 近期热播 核心冲突`,
      ],
      'zh-TW': [
        '熱門短劇 劇情簡介 爆款',
        '熱播豎屏短劇 近期劇名',
        `${catLabel} 近期熱播 核心衝突`,
      ],
      en: [
        'popular vertical short drama titles trending',
        'trending reel short drama plot synopsis',
        `${catLabel} hit micro drama story hooks`,
      ],
      ja: [
        '人気縦型ショートドラマ あらすじ',
        'バズ短編ドラマ タイトル 熱播',
        `${catLabel} ヒット 縦型ドラマ`,
      ],
    },
    fanqie_web: {
      zh: [
        '热门短篇网文 开局设定',
        '番茄 短篇 爆款书名 题材',
        `${catLabel} 近期热门 核心反转`,
      ],
      'zh-TW': [
        '熱門短篇網文 開局',
        '華文短篇連載 爆款書名',
        `${catLabel} 近期熱門 核心反轉`,
      ],
      en: [
        'popular short web fiction premises',
        'trending serial short story hooks',
        `${catLabel} hit fiction plot openings`,
      ],
      ja: [
        '人気短編ネット小説 あらすじ',
        'なろう 短編 バズ設定',
        `${catLabel} ヒット フック`,
      ],
    },
    talk_brief: {
      zh: [
        '本周社会热议 公共议题 可辩论',
        '近7天新闻 经济 民生 代际争议话题',
        '谈话节目常用议题类型 热点争议 本周热门',
      ],
      'zh-TW': [
        '本周社會熱議 公共議題 可辯論',
        '近7天新聞 經濟 民生 代際爭議話題',
        '談話節目常用議題類型 熱點爭議',
      ],
      en: [
        'this week social debate public issues controversy',
        'past 7 days news economy livelihood generational topics',
        'talk show dossier topic types trending controversies',
      ],
      ja: [
        '今週の社会議論 公共テーマ',
        '直近7日 ニュース 経済 暮らし 世代論点',
        'トーク番組向け 今週の論争テーマ類型',
      ],
    },
    literary_column: {
      zh: [
        '近期可写 文学专栏选题',
        '文学专栏 热门切入 角度',
        `${catLabel} 爆款标题 角度`,
      ],
      'zh-TW': [
        '近期可寫 文學專欄選題',
        '文學專欄 熱門切入',
        `${catLabel} 爆款標題 角度`,
      ],
      en: [
        'trending essay column topics',
        'popular literary feature angles',
        `${catLabel} hit essay hooks`,
      ],
      ja: [
        '今書ける コラム題材',
        '文芸コラム 人気切り口',
        `${catLabel} ヒット題`,
      ],
    },
    self_media: {
      zh: [
        '本周热搜 锐评选题',
        '自媒体 近7天爆款观点 热议',
        `${catLabel} 今日热点快反 角度`,
      ],
      'zh-TW': [
        '近期熱門銳評 選題',
        '自媒體 近期爆款觀點文',
        `${catLabel} 熱點快反 角度`,
      ],
      en: [
        'trending hot-take essay topics',
        'popular commentary angles this week',
        `${catLabel} viral opinion hooks`,
      ],
      ja: [
        'バズ論評 ネタ 今週',
        'ネット評論 今の論点',
        `${catLabel} ホットテイク`,
      ],
    },
    voiceover_brief: {
      zh: [
        '本周热门短视频解说 选题',
        '口播 近7天爆款开口钩子',
        `${catLabel} 可播 本周热门一点说清`,
      ],
      'zh-TW': [
        '熱門短視頻解說 選題',
        '口播 近期爆款開口鉤子',
        `${catLabel} 可播 熱門一點說清`,
      ],
      en: [
        'trending short-video explainer topics',
        'popular VO script hooks this week',
        `${catLabel} hit 90-second explain ideas`,
      ],
      ja: [
        '人気ショート解説 ネタ',
        'ナレ バズ開口 今週',
        `${catLabel} 三分で説明 ヒット`,
      ],
    },
    finance_narrative: {
      zh: [
        '财经专栏 本周热门选题',
        '资本故事 近7天热议公司/交易',
        `${catLabel} 本周热议 可写切入`,
      ],
      'zh-TW': [
        '財經專欄 近期熱門選題',
        '資本故事 爆款文章角度',
        `${catLabel} 熱議交易/公司 可寫切入`,
      ],
      en: [
        'trending finance column story angles',
        'popular deal / market narrative topics',
        `${catLabel} hit business-story hooks`,
      ],
      ja: [
        '金融コラム 今の人気題材',
        '資本ストーリー バズ角度',
        `${catLabel} ヒット 取引/企業ネタ`,
      ],
    },
    political_report: {
      zh: [
        '时政报道 本周选题角度',
        '政策/发布会 近7天热门切入',
        `${catLabel} 本周热议 材料边界 可写`,
      ],
      'zh-TW': [
        '時政報道 近期選題角度',
        '政策/發布會 熱門切入',
        `${catLabel} 近期熱議 材料邊界`,
      ],
      en: [
        'trending public-affairs reporting angles',
        'popular policy explainer topics',
        `${catLabel} hit briefing / local-gap leads`,
      ],
      ja: [
        '時事報道 今の切り口',
        '政策解説 人気テーマ',
        `${catLabel} ヒット 会見/現場ネタ`,
      ],
    },
    course_tutorial: {
      zh: [
        '热门网课 一课标题',
        '近期爆款 线上课程 课题',
        `${catLabel} 热门跟练/精讲课 选题`,
      ],
      'zh-TW': [
        '熱門網課 一課標題',
        '近期爆款 線上課程 課題',
        `${catLabel} 熱門跟練/精講課 選題`,
      ],
      en: [
        'popular online course lesson titles',
        'trending skill course topics this month',
        `${catLabel} hit class outline ideas`,
      ],
      ja: [
        '人気オンライン講座 レッスン題',
        '今バズってる スキル講座 テーマ',
        `${catLabel} ヒット授業 タイトル`,
      ],
    },
  };

  const byLang = pack[catId];
  if (byLang) {
    const list = byLang[l] || byLang.zh || [];
    if (list.length) return list;
  }

  if (l === 'en') {
    return [`${catLabel} trending writing topics`, `${catLabel} popular creative premises`].filter(
      Boolean
    );
  }
  if (l === 'ja') {
    return [`${catLabel} 今の創作トピック`, `${catLabel} 人気題材`].filter(Boolean);
  }
  return [`${catLabel} 近期热门 写作选题`, `${catLabel} 爆款题材`].filter(Boolean);
}

/**
 * 类别时间域后缀：风格角度拼在后面，形成「题材类型 + 近热」。
 */
function categoryTimeDomain(catId: string, lang: string): string {
  const l = langKey(lang);
  const zh: Record<string, string> = {
    talk_brief: '本周社会热议',
    hongguo_drama: '近期热播短剧',
    fanqie_web: '近期热门短篇',
    literary_column: '近期可写专栏',
    self_media: '本周热议锐评',
    voiceover_brief: '本周热门口播',
    finance_narrative: '本周财经热议',
    political_report: '本周时政选题',
    course_tutorial: '近期热门网课',
  };
  const en: Record<string, string> = {
    talk_brief: 'trending this week',
    hongguo_drama: 'trending short dramas',
    fanqie_web: 'trending short fiction',
    literary_column: 'trending essay topics',
    self_media: 'viral commentary this week',
    voiceover_brief: 'trending VO topics',
    finance_narrative: 'finance stories this week',
    political_report: 'public affairs this week',
    course_tutorial: 'popular online courses',
  };
  if (l === 'en') return en[catId] || 'trending this week';
  if (l === 'ja') return '今週の話題';
  if (l === 'zh-TW') return zh[catId]?.replace(/本周/g, '本週').replace(/近期/g, '近期') || '本週熱議';
  return zh[catId] || '近期热门';
}

/**
 * 组装检索句：类别定域为主，风格 search_angles 定题材类型角；禁止节目名/工艺口号硬丢。
 */
export function assembleVoiceStyleSearchQueries(input: {
  catId: string;
  catLabel: string;
  language: string;
  categoryQueries: string[];
  searchAngles: string[];
  /** 额外禁止出现在 query 中的专名（风格显示名、参考节目提示等） */
  banPhrases?: string[];
}): { primary: string; queries: string[] } {
  const lang = input.language;
  const timeDom = categoryTimeDomain(input.catId, lang);
  const ban = (input.banPhrases ?? [])
    .map((s) => String(s ?? '').trim())
    .filter((s) => s.length >= 2);

  const scrub = (q: string): string => {
    let s = scrubShowNamesFromSearchQuery(q);
    for (const b of ban) {
      if (!b) continue;
      s = s.split(b).join(' ');
    }
    return s.replace(/\s{2,}/g, ' ').trim();
  };

  const catQs = input.categoryQueries.map(scrub).filter(Boolean);
  const angles = input.searchAngles.map(scrub).filter(Boolean);

  const styleQs = angles.map((a) => scrub(`${a} ${timeDom}`)).filter(Boolean);

  // Q1 类别域；Q2/Q3 优先风格题材角，不足再用类别补路
  const queries = uniq([
    catQs[0],
    styleQs[0] || catQs[1] || catQs[0],
    styleQs[1] || catQs[2] || styleQs[0] || catQs[1] || catQs[0],
  ])
    .map(scrub)
    .filter(Boolean)
    .slice(0, VOICE_STYLE_QUERY_MAX);

  const fallback = scrub(
    input.catId === 'talk_brief'
      ? `${timeDom} 公共议题 可辩论`
      : `${scrub(input.catLabel)} ${timeDom}`
  );

  return {
    primary: queries[0] || fallback,
    queries: queries.length > 0 ? queries : [fallback],
  };
}

export function buildVoiceStyleTopicQueries(input: {
  voiceCategory: string;
  voiceId: string;
  language?: string;
}): {
  primary: string;
  queries: string[];
  intentLabel: string;
  language: string;
  catId: string;
  voiceLabel: string;
  blurb: string;
  topicHints: string[];
  searchAngles: string[];
} {
  const lang = String(input.language || 'zh').trim() || 'zh';
  const cat = getVoiceCategory(input.voiceCategory);
  const voice = getCatalogVoice(input.voiceId);
  const catId = String(cat?.id || input.voiceCategory || '').trim();
  const catLabel =
    pickI18n(cat?.label, lang) || String(input.voiceCategory || '').trim() || '综合';
  const voiceLabel = pickI18n(voice?.label, lang) || String(input.voiceId || '').trim();
  const uiHint = pickI18n(voice?.uiAuthorHint, lang);
  const blurb = pickI18n(voice?.blurb, lang) || pickI18n(cat?.blurb, lang);
  const topicHints = getTopicHints({
    voiceCategory: input.voiceCategory,
    voiceId: input.voiceId,
  }).slice(0, 4);
  const searchAngles = getSearchAngles({
    voiceCategory: input.voiceCategory,
    voiceId: input.voiceId,
  });
  const intentLabel = voiceLabel ? `${catLabel} / ${voiceLabel}` : catLabel;

  const categoryQueries = creativeQueries({ catId, catLabel, lang });
  const assembled = assembleVoiceStyleSearchQueries({
    catId,
    catLabel,
    language: lang,
    categoryQueries,
    searchAngles,
    banPhrases: [voiceLabel, uiHint, input.voiceId].filter(Boolean),
  });

  return {
    primary: assembled.primary,
    queries: assembled.queries,
    intentLabel,
    language: lang,
    catId,
    voiceLabel,
    blurb,
    topicHints,
    searchAngles,
  };
}

/** queryBuilder=voiceCategoryTrend：仅按类别拼多路检索（可复用，不绑 taskKey） */
export function buildVoiceCategoryTrendQueries(input: {
  voiceCategory: string;
  language?: string;
}): { primary: string; queries: string[]; catId: string; catLabel: string; language: string } {
  const lang = String(input.language || 'zh').trim() || 'zh';
  const cat = getVoiceCategory(input.voiceCategory);
  const catId = String(cat?.id || input.voiceCategory || '').trim();
  const catLabel =
    pickI18n(cat?.label, lang) || String(input.voiceCategory || '').trim() || '综合';
  const catQueries = creativeQueries({ catId, catLabel, lang })
    .map(scrubShowNamesFromSearchQuery)
    .filter(Boolean);
  const queries = uniq([catQueries[0], catQueries[1] || catQueries[0], catQueries[2] || catQueries[0]])
    .map(scrubShowNamesFromSearchQuery)
    .filter(Boolean)
    .slice(0, VOICE_STYLE_QUERY_MAX);
  const fallbackQ = scrubShowNamesFromSearchQuery(
    catId === 'talk_brief' ? '本周社会热议 公共议题 可辩论' : `${catLabel} 近期热门`
  );
  return {
    primary: queries[0] || fallbackQ,
    queries: queries.length > 0 ? queries : [fallbackQ],
    catId,
    catLabel,
    language: lang,
  };
}

export async function resolveVoiceStyleTopicBrief(input: {
  voiceCategory: string;
  voiceId: string;
  language?: string;
}): Promise<VoiceStyleTopicBrief> {
  const lang = String(input.language || 'zh').trim() || 'zh';
  const meta = getCatalogVoice(input.voiceId);
  const voiceLabel =
    pickI18n(meta?.label, lang) || String(input.voiceId || '').trim();
  const blurb = pickI18n(meta?.blurb, lang) || '';
  const topic_hints = getTopicHints({
    voiceCategory: input.voiceCategory,
    voiceId: input.voiceId,
  }).slice(0, 4);
  const payload = await resolveVoiceForModelAsync(input.voiceId, lang);
  return {
    voice_id: String(input.voiceId || '').trim(),
    voice_label: voiceLabel,
    blurb: blurb || payload?.blurb || '',
    topic_hints,
    ...(payload?.craft ? { craft: payload.craft } : {}),
  };
}

function mapItem(it: SearchResultItem): {
  title: string;
  url: string;
  snippet: string;
  domain: string;
} {
  const url = String(it.url ?? '').trim();
  let domain = '';
  try {
    domain = url ? new URL(url).hostname.replace(/^www\./, '') : '';
  } catch {
    domain = '';
  }
  return {
    title: String(it.title ?? '').trim().slice(0, 100),
    url,
    snippet: String(it.snippet ?? it.content ?? '')
      .trim()
      .slice(0, 120),
    domain,
  };
}

function approxItemsChars(items: Array<{ title: string; snippet: string; domain: string }>): number {
  return items.reduce(
    (n, it) => n + it.title.length + it.snippet.length + it.domain.length + 24,
    0
  );
}

export async function previewVoiceStyleTopics(
  input: VoiceStyleTopicPreviewInput,
  deepSearch: (args: {
    query: string;
    dimensions: SearchDimension[];
    depth: SearchDepth;
    numResults: number;
    timeRange?: 'day' | 'week' | 'month';
    language?: string;
  }) => Promise<{
    aggregated: SearchResultItem[];
    providers: string[];
    depth: SearchDepth;
  }>,
  opts?: {
    extractTopics?: (args: {
      items: Array<{ title: string; url: string; snippet: string; domain: string }>;
      intentLabel: string;
      /** 主查询（供 text 合同 websource.query） */
      query: string;
      language: string;
      maxTopics: number;
      maxInputItems: number;
      voiceCategory: string;
      voiceId: string;
      voiceStyle: VoiceStyleTopicBrief;
    }) => Promise<string[]>;
  }
): Promise<VoiceStyleTopicPreviewResult> {
  const built = buildVoiceStyleTopicQueries({
    voiceCategory: input.voiceCategory,
    voiceId: input.voiceId,
    language: input.language,
  });
  const maxResults = clampSearchMaxResults(input.maxResults);
  const topicCount = clampTopicMaxResults(input.topicCount);
  const perQuery = Math.max(6, Math.ceil(maxResults / Math.max(1, built.queries.length)));
  const dimensions: SearchDimension[] = ['general'];
  const timeRange = timeRangeForVoiceCategory(input.voiceCategory);

  const settled = await Promise.all(
    built.queries.map((query) =>
      deepSearch({
        query,
        dimensions,
        depth: 'standard',
        numResults: perQuery,
        timeRange,
        language: built.language,
      }).catch(() => null)
    )
  );

  const providers = new Set<string>();
  const aggregated: SearchResultItem[] = [];
  for (const r of settled) {
    if (!r) continue;
    for (const p of r.providers || []) providers.add(String(p));
    aggregated.push(...(r.aggregated || []));
  }

  // 有发布时间则新的优先，减少旧爆款占满送模槽
  aggregated.sort((a, b) => {
    const ta = Date.parse(String(a.publishedAt || '')) || 0;
    const tb = Date.parse(String(b.publishedAt || '')) || 0;
    return tb - ta;
  });

  const seenUrl = new Set<string>();
  const itemsRaw: Array<{ title: string; url: string; snippet: string; domain: string }> = [];
  for (const it of aggregated) {
    const m = mapItem(it);
    if (!m.url || seenUrl.has(m.url)) continue;
    seenUrl.add(m.url);
    itemsRaw.push(m);
    if (itemsRaw.length >= maxResults) break;
  }

  const inputItems = itemsRaw.slice(0, VOICE_STYLE_INPUT_MAX);
  const voiceStyle = await resolveVoiceStyleTopicBrief({
    voiceCategory: input.voiceCategory,
    voiceId: input.voiceId,
    language: built.language,
  });

  let topics: string[] = [];
  if (opts?.extractTopics && inputItems.length > 0) {
    topics = await opts.extractTopics({
      items: inputItems,
      intentLabel: built.intentLabel,
      query: built.primary,
      language: built.language,
      maxTopics: topicCount,
      maxInputItems: VOICE_STYLE_INPUT_MAX,
      voiceCategory: input.voiceCategory,
      voiceId: input.voiceId,
      voiceStyle,
    });
  }

  // 无提炼结果时：不把写死 hints 当话题池；仅用检索标题作弱回退
  if (topics.length === 0) {
    topics = inputItems
      .map((it) => it.title)
      .filter(Boolean)
      .slice(0, Math.min(topicCount, TOPIC_PAGE_SIZE));
  }

  const topicPool = uniq(topics).slice(0, topicCount);
  const topicChips = topicPool.slice(0, TOPIC_PAGE_SIZE);
  const depth = String(settled.find((r) => r)?.depth || 'standard');

  return {
    query: built.primary,
    queries: built.queries,
    depth,
    providers: [...providers],
    hitCount: itemsRaw.length,
    truncated: aggregated.length > itemsRaw.length,
    text: itemsRaw.map((it) => `${it.title}\n${it.snippet}`).join('\n\n').slice(0, 8000),
    items: itemsRaw,
    topicChips,
    topicPool,
    intentLabel: built.intentLabel,
    diagnostics: {
      queryCount: built.queries.length,
      queries: built.queries,
      hitCount: itemsRaw.length,
      inputItemsForLlm: inputItems.length,
      approxInputChars: approxItemsChars(inputItems),
      searchDimensions: dimensions,
      timeRange,
      parallel: true,
    },
  };
}

export { TOPIC_PAGE_SIZE };
