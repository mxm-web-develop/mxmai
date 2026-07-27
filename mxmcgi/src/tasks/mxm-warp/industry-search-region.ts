/**
 * 行业日报新闻检索范围（search_region）。
 * 产品默认全球国际市场；中国大陆仅为可选范围，禁止默认锁死大陆站。
 */
import { DOMAIN_PRESETS } from '../../core/search/domain-presets';
import type { IndustrySearchTrack } from './industry-search-track-classify';
import { formatYmdChinese, queryDatePartForMode, type IndustryDailyDateMode } from './industry-daily-date';

export const SEARCH_REGIONS = ['global', 'cn', 'tw', 'jp', 'na', 'eu'] as const;
export type SearchRegion = (typeof SEARCH_REGIONS)[number];

/** 引导 chips 展示（中文 UI）；提交值仍为英文 key */
export const SEARCH_REGION_LABELS: Record<SearchRegion, string> = {
  global: '全球',
  cn: '中国大陆',
  tw: '台湾',
  jp: '日本',
  na: '北美',
  eu: '欧洲',
};

const ALIAS_TO_REGION: Record<string, SearchRegion> = {
  global: 'global',
  worldwide: 'global',
  world: 'global',
  international: 'global',
  全球: 'global',
  国际: 'global',
  cn: 'cn',
  china: 'cn',
  mainland: 'cn',
  mainland_china: 'cn',
  '中国大陆': 'cn',
  大陆: 'cn',
  中国: 'cn',
  tw: 'tw',
  taiwan: 'tw',
  台湾: 'tw',
  台灣: 'tw',
  jp: 'jp',
  japan: 'jp',
  日本: 'jp',
  na: 'na',
  'north america': 'na',
  north_america: 'na',
  us: 'na',
  usa: 'na',
  北美: 'na',
  美国: 'na',
  eu: 'eu',
  europe: 'eu',
  欧洲: 'eu',
  歐洲: 'eu',
};

export function isSearchRegion(v: unknown): v is SearchRegion {
  return typeof v === 'string' && (SEARCH_REGIONS as readonly string[]).includes(v);
}

/** 缺省 / 未知 → global（国际优先） */
export function normalizeSearchRegion(raw: unknown): SearchRegion {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ');
  if (!s) return 'global';
  const compact = s.replace(/\s+/g, ' ');
  if (ALIAS_TO_REGION[compact]) return ALIAS_TO_REGION[compact]!;
  if (ALIAS_TO_REGION[s.replace(/\s+/g, '_')]) return ALIAS_TO_REGION[s.replace(/\s+/g, '_')]!;
  // 原文大小写保留的中文 key
  const orig = String(raw ?? '').trim();
  if (ALIAS_TO_REGION[orig]) return ALIAS_TO_REGION[orig]!;
  return 'global';
}

export function searchRegionLabel(region: SearchRegion): string {
  return SEARCH_REGION_LABELS[region];
}

/** 检索引擎语种：多语言检索一律 all，成稿/总结语言另走 basic.language */
export function searchLanguageForRegion(_region: SearchRegion): 'zh' | 'en' | 'all' {
  return 'all';
}

export type SearchQueryLocale = 'zh' | 'en' | 'ja';

/**
 * 按检索范围决定要打哪些查询语言（再由 LLM 收拢到用户成稿语言）。
 * 全球 / 北美 / 欧洲：不跑中文 query，避免 Tavily 被大陆站淹没。
 */
export function queryLocalesForRegion(region: SearchRegion): SearchQueryLocale[] {
  switch (region) {
    case 'cn':
    case 'tw':
      return ['zh', 'en'];
    case 'jp':
      return ['ja', 'en'];
    case 'na':
    case 'eu':
      return ['en'];
    case 'global':
    default:
      return ['en', 'ja'];
  }
}

const SECTOR_BY_LOCALE: Record<SearchQueryLocale, Record<string, string>> = {
  zh: {
    金融: '金融',
    股票: '股票',
    基金: '基金',
    银行保险: '银行保险',
    加密货币: '加密货币',
    科技: '科技',
    人工智能: '人工智能',
    半导体: '半导体',
    消费电子: '消费电子',
    互联网: '互联网',
    娱乐: '娱乐',
    影视综: '影视综',
    音乐: '音乐',
    游戏: '游戏',
    体育: '体育',
    足球: '足球',
    篮球: '篮球',
    网球: '网球',
    赛车: '赛车',
    finance: '金融',
    technology: '科技',
    tech: '科技',
    entertainment: '娱乐',
    sports: '体育',
  },
  en: {
    金融: 'finance',
    股票: 'stocks equities',
    基金: 'mutual funds ETF',
    银行保险: 'banking insurance',
    加密货币: 'cryptocurrency',
    科技: 'technology',
    人工智能: 'artificial intelligence',
    半导体: 'semiconductor',
    消费电子: 'consumer electronics',
    互联网: 'internet tech',
    娱乐: 'entertainment',
    影视综: 'film TV variety',
    音乐: 'music industry',
    游戏: 'video games',
    体育: 'sports',
    足球: 'football soccer',
    篮球: 'basketball NBA',
    网球: 'tennis',
    赛车: 'motorsport F1',
    finance: 'finance',
    technology: 'technology',
    tech: 'technology',
    entertainment: 'entertainment',
    sports: 'sports',
  },
  ja: {
    金融: '金融',
    股票: '株式',
    基金: '投資信託',
    银行保险: '銀行保険',
    加密货币: '暗号資産',
    科技: 'テクノロジー',
    人工智能: '人工知能',
    半导体: '半導体',
    消费电子: '家電',
    互联网: 'インターネット',
    娱乐: 'エンタメ',
    影视综: '映画テレビ',
    音乐: '音楽',
    游戏: 'ゲーム',
    体育: 'スポーツ',
    足球: 'サッカー',
    篮球: 'バスケ',
    网球: 'テニス',
    赛车: 'モータースポーツ',
    finance: '金融',
    technology: 'テクノロジー',
    tech: 'テクノロジー',
    entertainment: 'エンタメ',
    sports: 'スポーツ',
  },
};

const SUFFIX_BY_LOCALE: Record<SearchQueryLocale, Record<string, string[]>> = {
  zh: {
    finance: ['市场动态', '监管政策', '要闻'],
    tech: ['科技新闻', 'AI 产品', '产业动态'],
    entertainment: ['娱乐新闻', '影视综艺', '文娱热点'],
    sports: ['体育新闻', '赛况', '赛事热点'],
    general: ['行业动态', '热点事件', '要闻'],
  },
  en: {
    finance: ['market news', 'policy update', 'headlines'],
    tech: ['tech news', 'AI product launch', 'industry update'],
    entertainment: ['entertainment news', 'film TV music', 'box office'],
    sports: ['sports news', 'match results', 'league headlines'],
    general: ['industry news', 'breaking news', 'headlines'],
  },
  ja: {
    finance: ['金融ニュース', '市場動向', '規制'],
    tech: ['テックニュース', 'AI製品', '業界動向'],
    entertainment: ['エンタメニュース', '映画テレビ', '話題'],
    sports: ['スポーツニュース', '試合結果', 'リーグ'],
    general: ['業界ニュース', '最新動向', 'ヘッドライン'],
  },
};

const GEO_HINT: Partial<Record<SearchRegion, Partial<Record<SearchQueryLocale, string>>>> = {
  na: { en: 'US', zh: '北美', ja: '北米' },
  eu: { en: 'Europe', zh: '欧洲', ja: '欧州' },
  jp: { en: 'Japan', zh: '日本', ja: '日本' },
  tw: { en: 'Taiwan', zh: '台湾', ja: '台湾' },
  cn: { en: 'China', zh: '中国', ja: '中国' },
};

function formatDateForQueryLocale(
  ymd: string,
  locale: SearchQueryLocale,
  dateMode?: IndustryDailyDateMode
): string {
  if (dateMode) return queryDatePartForMode(dateMode, ymd, locale);
  if (!ymd) return '';
  if (locale === 'zh') return formatYmdChinese(ymd);
  return ymd;
}

function hasCjk(s: string): boolean {
  return /[\u4e00-\u9fff]/.test(s);
}

/** 自定义中文赛道 → 英/日检索标签（避免 en 查询里仍塞「ai具身机器人」） */
const CJK_SECTOR_HINTS: Array<{ re: RegExp; en: string; ja: string }> = [
  { re: /具身|人形机器人|embodied|humanoid/i, en: 'embodied AI robot', ja: 'エンボディードAIロボット' },
  { re: /机器人|robotics|\brobot\b/i, en: 'robotics AI', ja: 'ロボットAI' },
  { re: /大模型|LLM|生成式/i, en: 'generative AI LLM', ja: '生成AI' },
  { re: /芯片|半导体|晶圆/i, en: 'semiconductor chip', ja: '半導体' },
  { re: /新能源|光伏|锂电/i, en: 'clean energy EV battery', ja: 'クリーンエネルギー' },
  { re: /医药|生物科技|制药/i, en: 'biotech pharma', ja: 'バイオ医薬' },
];

const TRACK_SECTOR_FALLBACK: Record<IndustrySearchTrack, Record<SearchQueryLocale, string>> = {
  finance: { zh: '金融', en: 'finance', ja: '金融' },
  tech: { zh: '科技', en: 'technology', ja: 'テクノロジー' },
  entertainment: { zh: '娱乐', en: 'entertainment', ja: 'エンタメ' },
  sports: { zh: '体育', en: 'sports', ja: 'スポーツ' },
  general: { zh: '综合', en: 'industry', ja: '業界' },
};

function sectorForLocale(
  sector: string,
  locale: SearchQueryLocale,
  track: IndustrySearchTrack = 'general'
): string {
  const s = sector.trim();
  if (!s) {
    return TRACK_SECTOR_FALLBACK[track][locale];
  }
  const mapped = SECTOR_BY_LOCALE[locale][s] || SECTOR_BY_LOCALE[locale][s.toLowerCase()];
  if (mapped) return mapped;
  // 英/日查询：自定义中文赛道不得原样进 query
  if ((locale === 'en' || locale === 'ja') && hasCjk(s)) {
    const hint = CJK_SECTOR_HINTS.find((h) => h.re.test(s));
    if (hint) return locale === 'en' ? hint.en : hint.ja;
    return TRACK_SECTOR_FALLBACK[track][locale];
  }
  return s;
}

/**
 * 多语言检索查询：同一赛道/日期用多语种各打若干条。
 * expandAllSuffixes=true 时用满后缀（放大召回，逼近 maxResults）。
 * 成稿语言不在此收窄。
 */
export function buildMultilingualIndustryQueries(input: {
  sector: string;
  track: IndustrySearchTrack;
  region: SearchRegion;
  ymd: string;
  /** 本周/本月时用周期词代替具体日历日 */
  dateMode?: IndustryDailyDateMode;
  maxQueries?: number;
  /** 每语种展开全部后缀，用于高召回（如 200 条） */
  expandAllSuffixes?: boolean;
}): string[] {
  const max = Math.max(1, Math.min(12, input.maxQueries ?? 3));
  const locales = queryLocalesForRegion(input.region);
  const out: string[] = [];
  for (const locale of locales) {
    const sector = sectorForLocale(input.sector, locale, input.track);
    const datePart = formatDateForQueryLocale(input.ymd, locale, input.dateMode);
    const suffixes =
      SUFFIX_BY_LOCALE[locale][input.track] ?? SUFFIX_BY_LOCALE[locale].general!;
    const useSuffixes = input.expandAllSuffixes
      ? suffixes
      : [suffixes[0] ?? (locale === 'en' ? 'news' : locale === 'ja' ? 'ニュース' : '新闻')];
    const geo = GEO_HINT[input.region]?.[locale];
    for (const suffix of useSuffixes) {
      const parts = [sector, datePart, suffix, geo].filter(Boolean);
      const q = parts.join(' ').replace(/\s+/g, ' ').trim();
      if (q && !out.includes(q)) out.push(q);
      if (out.length >= max) return out;
    }
  }
  return out;
}

const SECTOR_EN: Record<string, string> = {
  金融: 'finance',
  股票: 'stocks equities',
  基金: 'mutual funds ETF',
  银行保险: 'banking insurance',
  加密货币: 'cryptocurrency',
  科技: 'technology',
  人工智能: 'artificial intelligence',
  半导体: 'semiconductor',
  消费电子: 'consumer electronics',
  互联网: 'internet tech',
  娱乐: 'entertainment',
  影视综: 'film TV variety',
  音乐: 'music industry',
  游戏: 'video games',
  体育: 'sports',
  足球: 'football soccer',
  篮球: 'basketball NBA',
  网球: 'tennis',
  赛车: 'motorsport F1',
  finance: 'finance',
  tech: 'technology',
  technology: 'technology',
  entertainment: 'entertainment',
  sports: 'sports',
};

/** 查询里的赛道名：大陆/台湾用原文，其余优先英文（兼容旧单语路径） */
export function sectorQueryLabel(sector: string, region: SearchRegion): string {
  const s = sector.trim();
  if (!s) return region === 'cn' || region === 'tw' ? '综合' : 'industry';
  if (region === 'cn' || region === 'tw') return s;
  const en = SECTOR_EN[s] || SECTOR_EN[s.toLowerCase()];
  if (en) return en;
  if (hasCjk(s)) {
    const hint = CJK_SECTOR_HINTS.find((h) => h.re.test(s));
    if (hint) return hint.en;
    return 'technology';
  }
  return s;
}

/** 大陆门户 / .cn：全球检索时降权，避免挤掉国际源 */
const MAINLAND_CN_HOSTS = new Set([
  'sina.com',
  'sina.com.cn',
  'finance.sina.com.cn',
  'k.sina.com.cn',
  'sohu.com',
  'www.sohu.com',
  'qq.com',
  '163.com',
  'xinhuanet.com',
  'www.xinhuanet.com',
  'people.com.cn',
  'chinanews.com.cn',
  'www.chinanews.com.cn',
  'ce.cn',
  'www.ce.cn',
  'thepaper.cn',
  'www.thepaper.cn',
  '36kr.com',
  'zhihu.com',
  'baidu.com',
  'toutiao.com',
  'xhby.net',
  'www.xhby.net',
  'ifeng.com',
  'cctv.com',
  'chinadaily.com.cn',
  'gmw.cn',
  'youth.cn',
  'huanqiu.com',
  'guancha.cn',
  'cls.cn',
  'eastmoney.com',
  '10jqka.com.cn',
  'hexun.com',
  'yicai.com',
  'jiemian.com',
  'caixin.com',
  'wallstreetcn.com',
  'stcn.com',
  'cs.com.cn',
  'cnstock.com',
  'nbd.com.cn',
  'pedaily.cn',
  'geekpark.net',
  'leiphone.com',
  'ithome.com',
  'donews.com',
  'techweb.com.cn',
  'cnbeta.com',
  'mydrivers.com',
  'zol.com.cn',
  'yesky.com',
  '52hrtt.com',
  'www.52hrtt.com',
]);

export function isMainlandChinaHost(domainOrUrl: string): boolean {
  const raw = String(domainOrUrl || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .split('/')[0]
    ?.split(':')[0]
    ?.replace(/^www\./, '') ?? '';
  if (!raw) return false;
  if (raw.endsWith('.cn') || raw.includes('.cn.')) return true;
  if (MAINLAND_CN_HOSTS.has(raw) || MAINLAND_CN_HOSTS.has(`www.${raw}`)) return true;
  // 子域：finance.sina.com.cn → 匹配 sina.com.cn
  const parts = raw.split('.');
  for (let i = 0; i < parts.length - 1; i++) {
    const candidate = parts.slice(i).join('.');
    if (MAINLAND_CN_HOSTS.has(candidate)) return true;
  }
  return false;
}

/**
 * 全球 / 北美 / 欧洲：国际源优先、大陆站沉底；大陆/台湾范围不改序。
 */
export function preferItemsForSearchRegion<T extends { domain?: string; url?: string }>(
  items: T[],
  region: SearchRegion
): T[] {
  if (region === 'cn' || region === 'tw' || items.length <= 1) return items;
  const intl: T[] = [];
  const mainland: T[] = [];
  for (const it of items) {
    const host = String(it.domain || it.url || '');
    if (isMainlandChinaHost(host)) mainland.push(it);
    else intl.push(it);
  }
  // 国际源过少时仍保留部分大陆站，避免空结果
  if (intl.length === 0) return items;
  const keepMainland = Math.min(mainland.length, Math.max(1, Math.floor(intl.length / 3)));
  return [...intl, ...mainland.slice(0, keepMainland)];
}

export function formatDateForRegionQuery(ymd: string, region: SearchRegion): string {
  if (!ymd) return '';
  if (region === 'cn' || region === 'tw') return formatYmdChinese(ymd);
  return ymd;
}

/** 国际向域名（不含大陆门户主导） */
const INTL_BY_TRACK: Record<IndustrySearchTrack, string[]> = {
  finance: [
    'bloomberg.com',
    'reuters.com',
    'ft.com',
    'wsj.com',
    'cnbc.com',
    'finance.yahoo.com',
    'marketwatch.com',
  ],
  tech: [
    'techcrunch.com',
    'theverge.com',
    'wired.com',
    'arstechnica.com',
    'reuters.com',
    'bloomberg.com',
    'theinformation.com',
  ],
  entertainment: [
    'variety.com',
    'hollywood.com',
    'billboard.com',
    'deadline.com',
    'hollywood.yahoo.com',
  ],
  sports: [
    'espn.com',
    'bbc.com',
    'skysports.com',
    'reuters.com',
    'theathletic.com',
    'nba.com',
    'fifa.com',
  ],
  general: ['reuters.com', 'bloomberg.com', 'apnews.com', 'bbc.com', 'nytimes.com'],
};

const CN_BY_TRACK: Record<IndustrySearchTrack, string[] | undefined> = {
  finance: DOMAIN_PRESETS.finance,
  tech: DOMAIN_PRESETS.tech,
  entertainment: DOMAIN_PRESETS.entertainment,
  sports: DOMAIN_PRESETS.sports,
  general: DOMAIN_PRESETS.industry,
};

const TW_BY_TRACK: Record<IndustrySearchTrack, string[]> = {
  finance: ['udn.com', 'ltn.com.tw', 'cna.com.tw', 'storm.mg', 'wealth.com.tw', 'reuters.com'],
  tech: ['cnbeta.com.tw', 'ithome.com.tw', 'udn.com', 'cna.com.tw', 'technews.tw', 'engadget.com'],
  entertainment: ['udn.com', 'ltn.com.tw', 'nextfilm.com.tw', 'variety.com', 'billboard.com'],
  sports: ['udn.com', 'ltn.com.tw', 'sports.yahoo.com', 'espn.com', 'cna.com.tw'],
  general: ['udn.com', 'ltn.com.tw', 'cna.com.tw', 'storm.mg', 'reuters.com'],
};

const JP_BY_TRACK: Record<IndustrySearchTrack, string[]> = {
  finance: ['nikkei.com', 'reuters.com', 'bloomberg.co.jp', 'ft.com', 'wsj.com'],
  tech: ['nikkei.com', 'reuters.com', 'techcrunch.com', 'theverge.com', 'wired.jp'],
  entertainment: ['variety.com', 'hollywood.com', 'oricon.co.jp', 'natalie.mu'],
  sports: ['nikkansports.com', 'reuters.com', 'espn.com', 'fifa.com', 'nba.com'],
  general: ['nikkei.com', 'asahi.com', 'reuters.com', 'japantimes.co.jp'],
};

const NA_BY_TRACK: Record<IndustrySearchTrack, string[]> = {
  finance: INTL_BY_TRACK.finance,
  tech: INTL_BY_TRACK.tech,
  entertainment: INTL_BY_TRACK.entertainment,
  sports: [...INTL_BY_TRACK.sports, 'cbssports.com'],
  general: ['reuters.com', 'apnews.com', 'nytimes.com', 'washingtonpost.com', 'wsj.com'],
};

const EU_BY_TRACK: Record<IndustrySearchTrack, string[]> = {
  finance: ['ft.com', 'reuters.com', 'bloomberg.com', 'economist.com', 'wsj.com'],
  tech: ['reuters.com', 'techcrunch.com', 'theverge.com', 'wired.com', 'bbc.com'],
  entertainment: ['bbc.com', 'theguardian.com', 'variety.com', 'deadline.com'],
  sports: ['bbc.com', 'skysports.com', 'reuters.com', 'uefa.com', 'fifa.com'],
  general: ['reuters.com', 'bbc.com', 'theguardian.com', 'ft.com', 'politico.eu'],
};

/**
 * 全球：不设白名单（避免被大陆站挤满）。
 * 区域：按市场给偏好域名。
 */
export function domainsForRegionAndTrack(
  region: SearchRegion,
  track: IndustrySearchTrack
): string[] | undefined {
  switch (region) {
    case 'global':
      return undefined;
    case 'cn': {
      const d = CN_BY_TRACK[track];
      return d && d.length ? [...d] : undefined;
    }
    case 'tw':
      return [...(TW_BY_TRACK[track] ?? TW_BY_TRACK.general)];
    case 'jp':
      return [...(JP_BY_TRACK[track] ?? JP_BY_TRACK.general)];
    case 'na':
      return [...(NA_BY_TRACK[track] ?? NA_BY_TRACK.general)];
    case 'eu':
      return [...(EU_BY_TRACK[track] ?? EU_BY_TRACK.general)];
    default:
      return undefined;
  }
}

/** 查询后缀：全球/国际用英文，大陆/台湾用中文 */
export function querySuffixesForRegionAndTrack(
  region: SearchRegion,
  track: IndustrySearchTrack
): string[] {
  if (region === 'cn' || region === 'tw') {
    switch (track) {
      case 'finance':
        return ['市场动态', '监管政策', '要闻'];
      case 'tech':
        return ['科技新闻', 'AI 产品', '产业动态'];
      case 'entertainment':
        return ['娱乐新闻', '影视综艺', '文娱热点'];
      case 'sports':
        return ['体育新闻', '赛况', '赛事热点'];
      default:
        return ['行业动态', '热点事件', '要闻'];
    }
  }

  const geo =
    region === 'na'
      ? 'US'
      : region === 'eu'
        ? 'Europe'
        : region === 'jp'
          ? 'Japan'
          : region === 'tw'
            ? 'Taiwan'
            : '';

  const withGeo = (base: string[]) =>
    geo ? base.map((s, i) => (i === 0 ? `${s} ${geo}`.trim() : s)) : base;

  switch (track) {
    case 'finance':
      return withGeo(['market news', 'policy update', 'headlines']);
    case 'tech':
      return withGeo(['tech news', 'AI product launch', 'industry update']);
    case 'entertainment':
      return withGeo(['entertainment news', 'film TV music', 'box office']);
    case 'sports':
      return withGeo(['sports news', 'match results', 'league headlines']);
    default:
      return withGeo(['industry news', 'breaking news', 'headlines']);
  }
}
