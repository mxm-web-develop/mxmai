/**
 * webSearch 后可选：调用 text 业务从检索结果提炼话题 chips。
 * 必须走 runTaskV2 计价。模型返回空 topics 时，用已清洗的检索标题做确定性兜底（不编造新事件）。
 * 仅当检索侧也无可用标题时才抛错。
 */
import type { TaskRunV2Request } from './types';
import { parseNestedTextTaskKey } from './business-pipeline';
import { MXM_WARP_CONTRACT_VERSION, emptyContract } from './mxm-warp/contract-types';
import {
  escapeRawControlsInJsonStrings,
  extractJsonObject,
  stripOuterMarkdownFence,
} from './parse-llm-json';
import { topicFormatForVoiceCategory } from './writing-style-presets/topic-article-purpose';

export const DEFAULT_TOPIC_EXTRACT_TEXT_KEY = 'text/expert/industry-hot-topics';
/** 话题写作文风选题（非日报） */
export const WRITING_STYLE_TOPIC_EXTRACT_TEXT_KEY = 'text/expert/writing-style-topics';

/** 联网检索条数上限（写入合同 items） */
export const SEARCH_HIT_MAX = 200;
/** 热点提炼：送模候选上限（title+短 snippet） */
export const TOPIC_EXTRACT_INPUT_MAX = 80;
/** 写作风格选题：送模候选上限（速度优先） */
export const WRITING_STYLE_TOPIC_EXTRACT_INPUT_MAX = 16;
/** 热点提炼：发现池话题上限（供换一批；整池须 LLM 提炼+译成用户语言） */
export const TOPIC_OUTPUT_MAX = 48;
/** 默认发现池提炼条数（不再由用户填 topic_count） */
export const TOPIC_POOL_DEFAULT = 40;
/** C 端每屏展示条数 */
export const TOPIC_PAGE_SIZE = 8;

export function isWritingStyleTopicExtractKey(textKey: string): boolean {
  return String(textKey || '').trim() === WRITING_STYLE_TOPIC_EXTRACT_TEXT_KEY;
}

/** 检索条数：1～200 */
export function clampSearchMaxResults(n: unknown, fallback = 8): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.floor(n) : fallback;
  return Math.max(1, Math.min(SEARCH_HIT_MAX, v));
}

/** 话题输出条数：1～TOPIC_OUTPUT_MAX */
export function clampTopicMaxResults(n: unknown, fallback = TOPIC_POOL_DEFAULT): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.floor(n) : fallback;
  return Math.max(1, Math.min(TOPIC_OUTPUT_MAX, v));
}

/** 送模候选条数：不少于输出目标，不超过 TOPIC_EXTRACT_INPUT_MAX */
export function clampTopicExtractInputCount(n: unknown, outputTarget = TOPIC_POOL_DEFAULT): number {
  const want = clampTopicMaxResults(outputTarget);
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.floor(n) : TOPIC_EXTRACT_INPUT_MAX;
  return Math.max(want, Math.min(TOPIC_EXTRACT_INPUT_MAX, v));
}

/** 按发现池目标条数生成 field_specs；强调用户语言意译 + 来源下标回挂 */
export function buildTopicExtractFieldSpecs(maxTopics: number) {
  const n = clampTopicMaxResults(maxTopics);
  const softMin = Math.max(1, Math.ceil(n * 0.35));
  const preferMin = Math.max(softMin, Math.ceil(n * 0.55));
  return [
    {
      name: 'topics',
      type: 'array',
      description: `JSON 数组，最多 ${n} 条（建议 ${preferMin}～${n}；弱证据可少到 ${softMin}，禁止为凑数编造）。检索条目非空时禁止返回空数组。元素必须是对象 {topic, sources}（兼容旧：纯字符串或 {topic,confidence}）：topic=事件短句；sources=支撑该话题的检索条目 1-based 下标数组（对应合同 sources.websource.items 的序号，至少 1 个；可多条）。confidence∈0～1 可选，低于 0.55 的勿输出。按「与行业/检索词关联度 → 热度/重要性 → 可报道价值」排序。LANGUAGE（硬）：每条 topic 必须用 contract.basic.language（zh|zh-TW|en|ja，缺省 zh）书写——从英/日/中等多语检索意译成该语言的事件短句，禁止整段照抄外文标题/栏目名当话题（专名可保留原文）；但 sources 必须指向真实检索条目下标，禁止无来源编造。禁止编号、勿附字数、勿英文推理。禁止栏目名/媒体名/首页/小时榜/榜单标题；禁止仅有艺人健康/取消一场演出且无行业影响的碎片话题`,
    },
  ] as const;
}

/** 话题写作：创作选题 field_specs（按 voice_category + voice 风格动态格式，非日报） */
export function buildWritingStyleTopicFieldSpecs(
  maxTopics: number,
  voiceCategory?: string,
  voiceStyle?: {
    voice_label?: string;
    blurb?: string;
    topic_hints?: string[];
    craft?: { opening?: string; stance?: string; avoid?: string; lexicon?: string };
  } | null
) {
  const n = clampTopicMaxResults(maxTopics);
  const softMin = Math.max(1, Math.ceil(n * 0.35));
  const preferMin = Math.max(softMin, Math.ceil(n * 0.55));
  const fmt = topicFormatForVoiceCategory(String(voiceCategory || ''));
  const dramaOnly =
    String(voiceCategory || '').trim() === 'hongguo_drama'
      ? ''
      : '严禁短剧剧名腔（【…】+婚礼/重生/打脸/真假千金等剧情梗）。';
  const talkOnly =
    String(voiceCategory || '').trim() === 'talk_brief'
      ? '谈话硬约束：voice_label/参考节目只定交锋笔法；选题必须是社会/新闻/经济/民生等公共议题；禁止节目停播、主持人落泪、嘉宾沙发名单、节目复盘等元话题。'
      : '';
  const styleBits: string[] = [];
  if (voiceStyle?.voice_label) styleBits.push(`风格「${voiceStyle.voice_label}」（只定笔法，不定题材）`);
  if (voiceStyle?.blurb) styleBits.push(`中性说明：${voiceStyle.blurb}`);
  if (voiceStyle?.craft?.opening) styleBits.push(`开口偏好：${voiceStyle.craft.opening}`);
  if (voiceStyle?.craft?.stance) styleBits.push(`立场：${voiceStyle.craft.stance}`);
  if (voiceStyle?.craft?.avoid) styleBits.push(`禁止：${voiceStyle.craft.avoid}`);
  if (voiceStyle?.craft?.lexicon) styleBits.push(`用语：${voiceStyle.craft.lexicon}`);
  const hints = Array.isArray(voiceStyle?.topic_hints)
    ? voiceStyle!.topic_hints!.filter(Boolean).slice(0, 4)
    : [];
  if (hints.length) styleBits.push(`优先贴近这些角度：${hints.join('；')}`);
  const styleLock =
    styleBits.length > 0
      ? `写作风格锁定（硬）：${styleBits.join('。')}。同类别换风格时选题角度必须可区分，勿输出其它风格典型题。`
      : '写作风格锁定：见 contract.basic.voice_style。';
  return [
    {
      name: 'topics',
      type: 'array',
      description: `JSON 数组，最多 ${n} 条（建议 ${preferMin}～${n}；可少到 ${softMin}）。元素可为字符串或 {topic, sources}。当前类别格式（硬）：${fmt.fieldHint}。完整规则见 contract.basic.topic_format。正确例：${fmt.exampleGood}。错误例（禁止）：${fmt.exampleBad}。${styleLock}${dramaOnly}${talkOnly}禁止行业新闻通报句、榜单、教程、版权合规、工具上线。LANGUAGE：用 basic.language。sources 可选，1-based。禁止空数组（检索非空时）。`,
    },
  ] as const;
}

/** @deprecated 仅兼容旧引用；新代码请用 buildTopicExtractFieldSpecs(maxResults) */
export const TOPIC_EXTRACT_FIELD_SPECS = buildTopicExtractFieldSpecs(8);

export type WebsourceItem = {
  title?: string;
  url?: string;
  snippet?: string;
  domain?: string;
};

export type WebsourcePayload = {
  query?: string;
  depth?: string;
  providers?: string[];
  hitCount?: number;
  truncated?: boolean;
  text?: string;
  items?: WebsourceItem[];
  topicChips?: string[];
  [k: string]: unknown;
};

/** 单条热点 + 支撑它的检索 URL（跨语言意译后靠此回挂，禁止专名死表） */
export type TopicChipLink = {
  topic: string;
  urls: string[];
};

export type TopicExtractResult = {
  topics: string[];
  /** topic 文案 → 支撑 URL 列表 */
  topicSourceMap: Record<string, string[]>;
  textTaskId: string;
  filteredOut: number;
};

import {
  cleanWebSearchItems,
  resolveWebSearchCleanOptions,
  type WebSearchResultCleanOptions,
} from './mxm-warp/web-search-result-clean';

/** 栏目/榜单/体育集锦/App 广告等噪声 */
const NOISE_RE =
  /小时报|热点小时|Premier Plays|MLB\.com|\bMLB\b|Highlights|流动应用|APP是一个|娱乐串燒|娱乐串烧|早報頭條|早报头条|头版头条内容精华|官方网站|门户导航|订阅页|訂閱/i;

/**
 * 易触发 Maxplan 1026（input new_sensitive）的硬敏感；
 * 非「国际/军事/时政」行业时送模前剔除。含门户侧栏/相关阅读常见噪声。
 */
const HARD_SENSITIVE_RE =
  /伊核|猛轰|核区|核打击|导弹|轰炸|战区告急|血腥|斩首|恐袭|ISIS|哈马斯|真主党|习近平|总书记|中央军委|解放军|台独|港独|法轮|六四|维稳|反腐|打虎|胡塞|核武器|核协议|亚伯拉罕|上海合作组织|上合组织|went rogue|cyber-?attack|hacked a start/i;

/** 送模 snippet 上限：门户常把整页导航塞进摘要，过长易夹带敏感侧栏 */
const SNIPPET_MAX_CHARS = 180;
const TITLE_MAX_CHARS = 100;

function itemBlob(it: WebsourceItem): string {
  return `${String(it.title ?? '')} ${String(it.snippet ?? '')}`;
}

export type PrepareItemsOptions = {
  /** 默认开启（资讯类）；传 false 关闭域名/样板/去重清洗 */
  resultClean?: boolean | WebSearchResultCleanOptions | null;
};

/** 送模/落库前清洗：去掉噪声与（按行业）硬敏感；maxItems 由调用方决定（检索可达 200，提炼候选通常 ≤80） */
export function prepareItemsForTopicExtract(
  items: WebsourceItem[],
  industry: string,
  maxItems = 8,
  prepareOpts?: PrepareItemsOptions
): { items: WebsourceItem[]; filteredOut: number } {
  const sector = String(industry || '').trim();
  const allowHardGeo = /国际|军事|时政|地缘|防务/.test(sector);
  const limit = Math.max(1, Math.min(SEARCH_HIT_MAX, Math.floor(maxItems) || 8));

  const cleanOpts = resolveWebSearchCleanOptions(
    prepareOpts?.resultClean === undefined ? true : prepareOpts.resultClean,
    true
  );
  const preCleaned = cleanWebSearchItems(items, cleanOpts);
  let filteredOut = preCleaned.filteredOut;

  const kept: WebsourceItem[] = [];
  for (const it of preCleaned.items) {
    const blob = itemBlob(it);
    if (!blob.trim()) {
      filteredOut += 1;
      continue;
    }
    if (NOISE_RE.test(blob)) {
      filteredOut += 1;
      continue;
    }
    if (!allowHardGeo && HARD_SENSITIVE_RE.test(blob)) {
      filteredOut += 1;
      continue;
    }
    kept.push({
      title: String(it.title ?? '')
        .trim()
        .slice(0, TITLE_MAX_CHARS),
      snippet: String(it.snippet ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, SNIPPET_MAX_CHARS),
      domain: String(it.domain ?? '').trim().slice(0, 40),
      ...(it.url ? { url: String(it.url).trim().slice(0, 300) } : {}),
    });
    if (kept.length >= limit) break;
  }
  return { items: kept, filteredOut };
}

/**
 * 写入合同 / 嵌套写作前：截断 snippet、剔硬敏感，并重建 text。
 * 预览缓存的超长摘要必须再过一遍，否则 Maxplan 仍会 1026。
 */
export function sanitizeWebsourceForLlm(
  payload: WebsourcePayload,
  industry: string,
  maxItems = 12,
  prepareOpts?: PrepareItemsOptions
): WebsourcePayload {
  const rawItems = Array.isArray(payload.items) ? payload.items : [];
  const { items, filteredOut } = prepareItemsForTopicExtract(
    rawItems,
    industry,
    maxItems,
    prepareOpts
  );
  const query = String(payload.query ?? '').trim() || '（查询）';
  const depth = String(payload.depth ?? '').trim();
  const header = depth
    ? `【联网检索 · ${depth}】\n查询: ${query}\n`
    : `【联网检索】\n查询: ${query}\n`;
  const lines = items.map((it, i) => {
    const title = String(it.title ?? '').trim();
    const snippet = String(it.snippet ?? '').trim();
    const url = String(it.url ?? '').trim();
    return `[${i + 1}] ${title}\n${snippet}${url ? `\n来源: ${url}` : ''}`.trim();
  });
  const text =
    items.length === 0
      ? `${header}\n（未检索到可用结果）`
      : `${header.trimEnd()}\n\n${lines.join('\n\n')}`;
  // extracted 与 queries 透传：即使 snippet 全部被过滤，也可被 LLM 二次使用
  const { extracted: _e, queries: _q, ...rest } = payload as Record<string, unknown>;
  return {
    ...rest,
    items,
    hitCount: items.length,
    truncated: Boolean(payload.truncated) || filteredOut > 0 || rawItems.length > items.length,
    text: text.slice(0, 3500),
    sanitized: true,
    filteredOut,
    extracted: payload.extracted,
    queries: payload.queries,
  };
}

/** 英文推理 / 字数自检等元话语，不当作话题 */
const META_PROSE_RE =
  /\b(is correct|another topic|let'?s keep|we already have|chars?\)|keep it to)\b/i;

/**
 * 选题 chip 长度：短篇网文/悬疑埋线等常含对白，72 会把整条 JSON 选题打掉，
 * 再走 salvage 时按引号拆成碎片 chip（见截图「一个推荐变多个」）。
 */
const TOPIC_CANDIDATE_MIN_LEN = 6;
const TOPIC_CANDIDATE_MAX_LEN = 160;

function cjkRatio(s: string): number {
  const chars = [...s];
  if (chars.length === 0) return 0;
  const cjk = chars.filter((ch) => /[\u4e00-\u9fff]/.test(ch)).length;
  return cjk / chars.length;
}

/** 仅剥「整句被引号包裹」的外壳；保留文内「对白」的收尾引号 */
function stripWrappingQuotes(s: string): string {
  const t = s.trim();
  if (t.length < 2) return t;
  const pairs: Array<[string, string]> = [
    ['"', '"'],
    ['“', '”'],
    ['「', '」'],
    ['『', '』'],
  ];
  for (const [open, close] of pairs) {
    if (t.startsWith(open) && t.endsWith(close)) {
      return t.slice(open.length, t.length - close.length).trim();
    }
  }
  return t;
}

/** 超长时尽量在句读处截断，避免拒收后落入 salvage 拆碎片 */
function softTruncateTopic(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  const window = s.slice(0, maxLen);
  const marks = ['。', '！', '？', '；', '!', '?', ';'];
  let cut = -1;
  for (const m of marks) {
    const i = window.lastIndexOf(m);
    if (i > cut) cut = i;
  }
  if (cut >= Math.floor(maxLen * 0.45)) return window.slice(0, cut + 1);
  // 避免截在未闭合引号内：退到最近开引号前
  const openIdx = Math.max(
    window.lastIndexOf('「'),
    window.lastIndexOf('“'),
    window.lastIndexOf('"'),
    window.lastIndexOf('『')
  );
  const closeAfterOpen =
    openIdx >= 0
      ? Math.max(
          window.indexOf('」', openIdx),
          window.indexOf('”', openIdx),
          window.indexOf('』', openIdx)
        )
      : -1;
  if (openIdx >= Math.floor(maxLen * 0.4) && closeAfterOpen < 0) {
    return window.slice(0, openIdx).replace(/[：:]\s*$/, '').trimEnd();
  }
  return `${window.slice(0, maxLen - 1)}…`;
}

function normalizeTopicCandidate(raw: string): string | null {
  let s = raw.trim();
  if (!s) return null;
  s = s.replace(/^[\d]+[.\u3001、)\]]\s*/, '').trim();
  s = s.replace(/\s*\(\d+\s*chars?\)\s*$/i, '').trim();
  s = stripWrappingQuotes(s);
  // 折叠选题内换行，避免 UI 把一行对白当成下一条
  s = s.replace(/\s*\n+\s*/g, ' ').replace(/\s+/g, ' ').trim();
  if (s.length < TOPIC_CANDIDATE_MIN_LEN) return null;
  if (s.length > TOPIC_CANDIDATE_MAX_LEN) s = softTruncateTopic(s, TOPIC_CANDIDATE_MAX_LEN);
  if (s.length < TOPIC_CANDIDATE_MIN_LEN) return null;
  if (META_PROSE_RE.test(s)) return null;
  if (cjkRatio(s) < 0.35 && !/[\u4e00-\u9fff]{4,}/.test(s)) return null;
  if (
    /首页|小时报|热点小时|Highlights|Premier Plays|流动应用|APP是一个|娱乐串燒|娱乐串烧/i.test(s) &&
    s.length < 36
  ) {
    return null;
  }
  if (HARD_SENSITIVE_RE.test(s)) return null;
  return s;
}

/**
 * 对白碎片：无【钩子】、偏口语短句；常被 salvage 引号规则误当成独立选题。
 * 仅在同批已有【】选题时丢弃。
 */
function isOrphanDialogueFragment(s: string): boolean {
  const t = s.trim();
  if (!t || /^【[^】]+】/.test(t)) return false;
  if (t.length >= 40) return false;
  if (/[：:].{8,}/.test(t)) return false; // 「角度：矛盾」类仍保留
  return (
    /[？?！!]/.test(t) ||
    /^(你|我|他|她|谁|那|这|哥|姐|老板|师傅)/.test(t) ||
    /^(如果|睡得|您的件|时间点到了)/.test(t)
  );
}

/** 去掉已被更长选题覆盖的子串碎片（引号对白拆条） */
function dedupeTopicFragmentLinks(links: TopicChipLink[]): TopicChipLink[] {
  const topics = links.map((l) => l.topic);
  const hasBracket = topics.some((t) => /^【[^】]+】/.test(t));
  const kept: TopicChipLink[] = [];
  for (let i = 0; i < links.length; i++) {
    const cur = links[i]!;
    const t = cur.topic;
    if (hasBracket && isOrphanDialogueFragment(t)) continue;
    const covered = topics.some(
      (other, j) => j !== i && other !== t && other.length > t.length && other.includes(t)
    );
    if (covered) continue;
    kept.push(cur);
  }
  return kept;
}

/**
 * 模型返回空 topics 时，从已清洗检索标题确定性生成 chips（不编造事件）。
 * 对纯拉丁标题放宽长度限制，避免英文资讯检索后整单失败。
 * 每条 chip 与对应检索条 1:1 回挂 URL。
 */
export function fallbackTopicLinksFromSearchItems(
  items: WebsourceItem[],
  maxTopics: number
): TopicChipLink[] {
  const limit = clampTopicMaxResults(maxTopics);
  const out: TopicChipLink[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    if (out.length >= limit) break;
    const title = String(it.title ?? '').trim();
    if (!title) continue;
    let n = normalizeTopicCandidate(title);
    if (!n) {
      let s = title.replace(/^[\d]+[.\u3001、)\]]\s*/, '').trim();
      s = s.replace(/^["“「『]+|["”」』]+$/g, '').trim();
      if (
        s.length >= 12 &&
        s.length <= TOPIC_CANDIDATE_MAX_LEN + 40 &&
        !META_PROSE_RE.test(s) &&
        !HARD_SENSITIVE_RE.test(s) &&
        !NOISE_RE.test(s)
      ) {
        n =
          s.length > TOPIC_CANDIDATE_MAX_LEN
            ? softTruncateTopic(s, TOPIC_CANDIDATE_MAX_LEN)
            : s;
      }
    }
    if (!n || seen.has(n)) continue;
    seen.add(n);
    const url = String(it.url ?? '').trim();
    out.push({ topic: n, urls: url ? [url] : [] });
  }
  return out;
}

/** @deprecated 用 fallbackTopicLinksFromSearchItems */
export function fallbackTopicsFromSearchItems(
  items: WebsourceItem[],
  maxTopics: number
): string[] {
  return fallbackTopicLinksFromSearchItems(items, maxTopics).map((x) => x.topic);
}

const MIN_TOPIC_CONFIDENCE = 0.55;

function coerceSourceIndices(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  for (const x of raw) {
    const n = typeof x === 'number' ? x : Number(String(x ?? '').trim());
    if (!Number.isFinite(n)) continue;
    const i = Math.floor(n);
    if (i >= 1) out.push(i);
  }
  return [...new Set(out)];
}

function urlsFromSourceIndices(indices: number[], items: WebsourceItem[]): string[] {
  const urls: string[] = [];
  for (const idx of indices) {
    const it = items[idx - 1];
    const url = String(it?.url ?? '').trim();
    if (url) urls.push(url);
  }
  return [...new Set(urls)];
}

function collectTopicLinksFromList(
  list: unknown[],
  maxTopics: number,
  items: WebsourceItem[]
): TopicChipLink[] {
  const limit = clampTopicMaxResults(maxTopics);
  const out: TopicChipLink[] = [];
  const seen = new Set<string>();
  for (const row of list) {
    if (out.length >= limit) break;
    let s = '';
    let sourceIdx: number[] = [];
    if (typeof row === 'string') {
      s = row.trim();
    } else if (row && typeof row === 'object') {
      const r = row as Record<string, unknown>;
      const conf = r.confidence ?? r.score;
      if (typeof conf === 'number' && Number.isFinite(conf) && conf < MIN_TOPIC_CONFIDENCE) {
        continue;
      }
      for (const k of ['topic', 'event', 'title', 'text', 'headline', 'core']) {
        if (typeof r[k] === 'string' && String(r[k]).trim()) {
          s = String(r[k]).trim();
          break;
        }
      }
      sourceIdx = coerceSourceIndices(
        r.sources ?? r.source_ids ?? r.sourceIds ?? r.item_ids ?? r.refs
      );
    }
    const n = normalizeTopicCandidate(s);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push({ topic: n, urls: urlsFromSourceIndices(sourceIdx, items) });
  }
  return out;
}

function tryParseTopicLinksJson(
  body: string,
  maxTopics: number,
  items: WebsourceItem[]
): TopicChipLink[] {
  const attempts: string[] = [body];
  const extracted = extractJsonObject(body);
  if (extracted) attempts.push(extracted);
  const startArr = body.indexOf('[');
  const endArr = body.lastIndexOf(']');
  if (startArr >= 0 && endArr > startArr) attempts.push(body.slice(startArr, endArr + 1));
  const startObj = body.indexOf('{');
  const endObj = body.lastIndexOf('}');
  if (startObj >= 0 && endObj > startObj) attempts.push(body.slice(startObj, endObj + 1));

  for (const cand of attempts) {
    for (const variant of [cand, escapeRawControlsInJsonStrings(cand)]) {
      try {
        const parsed = JSON.parse(variant) as unknown;
        if (Array.isArray(parsed)) {
          const links = collectTopicLinksFromList(parsed, maxTopics, items);
          if (links.length) return links;
        } else if (parsed && typeof parsed === 'object') {
          const o = parsed as Record<string, unknown>;
          for (const k of ['topics', 'topicChips', 'chips', 'events', 'items']) {
            if (Array.isArray(o[k])) {
              const links = collectTopicLinksFromList(o[k] as unknown[], maxTopics, items);
              if (links.length) return links;
            }
          }
        }
      } catch {
        /* next */
      }
    }
  }
  return [];
}

/** 从编号列表 / 引号串抢救中文事件（模型常输出 CoT 而非 JSON）——无来源下标 */
function salvageTopicLinksFromProse(raw: string, maxTopics: number): TopicChipLink[] {
  const limit = clampTopicMaxResults(maxTopics);
  const out: TopicChipLink[] = [];
  const seen = new Set<string>();
  const push = (cand: string) => {
    const n = normalizeTopicCandidate(cand);
    if (!n || seen.has(n) || out.length >= limit) return;
    seen.add(n);
    out.push({ topic: n, urls: [] });
  };

  // 优先：【钩子】整段（可含对白与换行），直到下一编号 / 下一【 / 文末
  const bracketBlocks =
    /【[^】]{1,40}】[^\n]*(?:\n(?!\s*\d{1,2}[.\u3001、)\]]\s*|【)[^\n]*)*/g;
  for (const m of raw.matchAll(bracketBlocks)) push(m[0] || '');

  // 编号项：允许文内引号，不再在 」 处截断
  const numbered =
    /(?:^|[\s;；\n])(?:\d{1,2})[.\u3001、)\]]\s*(.+?)(?=(?:[\s;；\n]\d{1,2}[.\u3001、)\]])|$)/gs;
  for (const m of raw.matchAll(numbered)) push(m[1] || '');

  // 引号串：仅作无【】时的弱回退；随后 dedupe 会丢掉已被长选题覆盖的对白碎片
  if (out.length === 0) {
    const quoted = /[“"「]([^”"」\n]{6,160})[”"」]/g;
    for (const m of raw.matchAll(quoted)) push(m[1] || '');

    const dangling =
      /(?:^|[\n\r]|[-–—:：]\s*)([\u4e00-\u9fff][^”"」\n]{5,158}?)(?:[”"」]\s*(?:is correct|->|→|\(|$))/gi;
    for (const m of raw.matchAll(dangling)) push(m[1] || '');
  }

  return dedupeTopicFragmentLinks(out).slice(0, limit);
}

/**
 * 解析 text 业务输出为带来源回挂的 topics。
 * @param items 送模时的检索条（与 sources 1-based 下标对齐）
 */
export function parseTopicLinksFromTextBusinessOutput(
  raw: string,
  maxTopics = 8,
  items: WebsourceItem[] = []
): TopicChipLink[] {
  const t = raw.trim();
  if (!t) return [];
  const body = stripOuterMarkdownFence(t);
  const limit = clampTopicMaxResults(maxTopics);
  const fromJson = tryParseTopicLinksJson(body, limit, items);
  if (fromJson.length > 0) return dedupeTopicFragmentLinks(fromJson).slice(0, limit);
  return salvageTopicLinksFromProse(body, limit);
}

/** 兼容旧调用：只返回 topic 字符串 */
export function parseTopicsFromTextBusinessOutput(raw: string, maxTopics = 8): string[] {
  return parseTopicLinksFromTextBusinessOutput(raw, maxTopics, []).map((x) => x.topic);
}

export function buildTopicSourceMap(links: TopicChipLink[]): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const link of links) {
    const topic = link.topic.trim();
    if (!topic) continue;
    const urls = [...new Set((link.urls || []).map((u) => String(u).trim()).filter(Boolean))];
    if (!urls.length) continue;
    const prev = map[topic] ?? [];
    map[topic] = [...new Set([...prev, ...urls])];
  }
  return map;
}

/** 从 writing 业务 pipeline.pre 读取热点提取 text 业务键 */
export function readTopicExtractTextKeyFromWritingPipeline(
  pipeline:
    | {
        pre?: Array<{
          step?: string;
          nestedTextTaskKey?: string;
          params?: Record<string, unknown>;
        }>;
      }
    | null
    | undefined
): string | null {
  const pre = pipeline?.pre;
  if (!Array.isArray(pre)) return null;
  // 优先独立热点提取节点
  for (const step of pre) {
    if (String(step?.step || '') !== 'extractHotTopics') continue;
    const key = String(
      step?.params?.textKey ?? step?.nestedTextTaskKey ?? ''
    ).trim();
    if (key.startsWith('text/')) return key;
    return 'text/expert/industry-hot-topics';
  }
  // 兼容旧：挂在 webSearch.topicExtractTextKey
  for (const step of pre) {
    if (String(step?.step || '') !== 'webSearch') continue;
    const key = String(step?.params?.topicExtractTextKey ?? '').trim();
    if (key.startsWith('text/')) return key;
  }
  return null;
}

function buildExpertRequest(args: {
  taskKey: string;
  subtype: string | null;
  industry: string;
  ymd?: string;
  dateLabel?: string;
  dateMode?: string;
  language?: string;
  query?: string;
  items: WebsourceItem[];
  parentTaskId?: string;
  maxTopics: number;
  /** 写作风格选题模式（非日报） */
  writingStyle?: boolean;
  voiceCategory?: string;
  voiceId?: string;
  voiceStyle?: {
    voice_id?: string;
    voice_label?: string;
    blurb?: string;
    topic_hints?: string[];
    craft?: {
      sentence?: string;
      stance?: string;
      opening?: string;
      avoid?: string;
      lexicon?: string;
    };
  } | null;
}): TaskRunV2Request {
  const writingStyle = Boolean(args.writingStyle);
  const contract = emptyContract({
    version: MXM_WARP_CONTRACT_VERSION,
    scope: 'writing',
    taskKey: 'generator',
    subtype: writingStyle ? 'topic-article' : 'industry-daily',
    taskId: args.parentTaskId || '',
  });
  const language = String(args.language ?? 'zh').trim() || 'zh';
  const voiceCategory = String(args.voiceCategory || '').trim();
  const topicFormat = writingStyle ? topicFormatForVoiceCategory(voiceCategory) : null;
  const vs = args.voiceStyle;
  contract.basic = {
    industry: args.industry,
    language,
    ...(args.ymd ? { report_ymd: args.ymd } : {}),
    ...(args.dateLabel ? { date_label: args.dateLabel } : {}),
    ...(args.dateMode ? { date_mode: args.dateMode } : {}),
    ...(voiceCategory ? { voice_category: voiceCategory } : {}),
    ...(args.voiceId ? { voice_id: args.voiceId } : {}),
    ...(writingStyle ? { extract_mode: 'writing_style_topics' } : {}),
    ...(topicFormat
      ? {
          topic_format: topicFormat.format,
          topic_format_id: topicFormat.id,
          topic_format_example_good: topicFormat.exampleGood,
          topic_format_example_bad: topicFormat.exampleBad,
        }
      : {}),
    ...(vs
      ? {
          voice_style: {
            voice_id: vs.voice_id || args.voiceId,
            voice_label: vs.voice_label,
            blurb: vs.blurb,
            topic_hints: vs.topic_hints,
            craft: vs.craft,
          },
        }
      : {}),
  };
  contract.sources = {
    websource: {
      query: args.query,
      hitCount: args.items.length,
      // 显式 1-based index，供模型在 topics[].sources 回挂
      items: args.items.map((it, i) => ({
        index: i + 1,
        title: it.title,
        snippet: it.snippet,
        domain: it.domain,
        ...(it.url ? { url: it.url } : {}),
      })),
    },
  };
  const fieldSpecs = writingStyle
    ? buildWritingStyleTopicFieldSpecs(args.maxTopics, voiceCategory, vs)
    : buildTopicExtractFieldSpecs(args.maxTopics);
  return {
    scope: 'text',
    taskKey: args.taskKey,
    subtype: args.subtype,
    params: {
      contract,
      field_specs: [...fieldSpecs],
    },
  };
}

/**
 * 调用配置的 text 业务提炼 topics。失败抛错，不做任何回退。
 */
export async function extractTopicChipsViaTextBusiness(args: {
  textKey: string;
  userId: string;
  industry: string;
  ymd?: string;
  dateLabel?: string;
  dateMode?: string;
  /** 用户成稿/界面语言：总结 topics 必须用此语言 */
  language?: string;
  websource: WebsourcePayload;
  parentTaskId?: string;
  /**
   * 发现池话题数（整池 LLM 提炼+译成用户语言，供换一批）。
   * 不再由用户填 topic_count；缺省 TOPIC_POOL_DEFAULT。
   */
  maxTopics?: number;
  /** 送模候选条数；缺省取 min(检索条数, TOPIC_EXTRACT_INPUT_MAX) */
  maxInputItems?: number;
  /** 检索清洗开关；默认开启 */
  resultClean?: boolean | WebSearchResultCleanOptions | null;
  voiceCategory?: string;
  voiceId?: string;
  voiceStyle?: {
    voice_id?: string;
    voice_label?: string;
    blurb?: string;
    topic_hints?: string[];
    craft?: {
      sentence?: string;
      stance?: string;
      opening?: string;
      avoid?: string;
      lexicon?: string;
    };
  } | null;
}): Promise<TopicExtractResult> {
  const textKey = args.textKey.trim();
  const writingStyle = isWritingStyleTopicExtractKey(textKey);
  const rawItems = Array.isArray(args.websource.items) ? args.websource.items : [];
  const maxTopics = clampTopicMaxResults(args.maxTopics ?? TOPIC_POOL_DEFAULT);
  const defaultInputCap = writingStyle
    ? WRITING_STYLE_TOPIC_EXTRACT_INPUT_MAX
    : TOPIC_EXTRACT_INPUT_MAX;
  const maxInput = writingStyle
    ? Math.max(1, Math.min(defaultInputCap, args.maxInputItems ?? rawItems.length))
    : clampTopicExtractInputCount(args.maxInputItems ?? rawItems.length, maxTopics);
  if (!textKey.startsWith('text/')) {
    throw new Error('未配置话题提炼 text 业务（topicExtractTextKey）');
  }
  if (rawItems.length === 0) {
    throw new Error('检索结果为空，无法提炼话题');
  }

  const { items, filteredOut } = prepareItemsForTopicExtract(rawItems, args.industry, maxInput, {
    resultClean: args.resultClean === undefined ? true : args.resultClean,
  });
  if (items.length === 0) {
    throw new Error(
      writingStyle
        ? `检索结果经清洗后无可送模条目（过滤 ${filteredOut} 条），请换风格重试`
        : `检索结果经清洗后无可送模条目（过滤 ${filteredOut} 条噪声/敏感），请换行业或日期重试`
    );
  }

  const { taskKey, subtype } = parseNestedTextTaskKey(textKey);
  const { runTaskV2 } = await import('./task-engine');
  const req = buildExpertRequest({
    taskKey,
    subtype,
    industry: args.industry,
    ymd: args.ymd,
    dateLabel: args.dateLabel,
    dateMode: args.dateMode,
    language: args.language,
    query: typeof args.websource.query === 'string' ? args.websource.query : undefined,
    items,
    parentTaskId: args.parentTaskId,
    maxTopics,
    writingStyle,
    voiceCategory: args.voiceCategory,
    voiceId: args.voiceId,
    voiceStyle: args.voiceStyle,
  });

  const result = await runTaskV2(req, args.userId);
  if (!result.success || !result.syncResult) {
    throw new Error(
      `话题提炼 text 业务失败：${textKey} status=${result.status} taskId=${result.taskId ?? ''}`
    );
  }

  const rawText = result.syncResult.text ?? '';
  let links = parseTopicLinksFromTextBusinessOutput(rawText, maxTopics, items).slice(
    0,
    maxTopics
  );
  if (links.length === 0) {
    links = fallbackTopicLinksFromSearchItems(items, maxTopics);
    console.warn(
      `[topic-extract] empty LLM topics, fallback to ${links.length} search titles taskId=${result.taskId} raw=${rawText
        .replace(/\s+/g, ' ')
        .slice(0, 120)}`
    );
  }
  if (links.length === 0) {
    throw new Error('未能从检索结果提炼出可用热点，请换行业、日期或检索范围后重试');
  }

  const topics = links.map((l) => l.topic);
  const topicSourceMap = buildTopicSourceMap(links);
  const linked = Object.keys(topicSourceMap).length;
  if (linked < topics.length) {
    console.warn(
      `[topic-extract] ${topics.length - linked}/${topics.length} chips missing source urls; prune will rely on enrich re-search`
    );
  }

  return {
    topics,
    topicSourceMap,
    textTaskId: result.taskId!,
    filteredOut,
  };
}
