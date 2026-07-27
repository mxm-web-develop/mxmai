/**
 * 行业日报 pre：按「行业 + 日期」检索当日/该日要闻，提炼成热门话题 chips。
 * 目标是事件标题，不是栏目名、媒体名、订阅页。
 */

import type { SearchDepth, SearchDimension, SearchResultItem } from '../../core/search/types';
import { buildIndustryTrendSearchQuery } from './web-search-step';
import {
  formatYmdChinese,
  industryDailySearchBounds,
  reportDateSearchWindow,
  resolveIndustryDailyDateLabel,
  shiftYmd,
} from './industry-daily-date';
import { resolveIndustrySearchStrategy } from './industry-search-strategy';
import {
  buildMultilingualIndustryQueries,
  preferItemsForSearchRegion,
  type SearchRegion,
} from './industry-search-region';
import { resolveSearchTrackForParams } from './industry-search-track-classify';
import { isLikelyHotTopicTitle } from './topic-chips-from-websource';
import { sanitizeWebsourceForLlm, clampSearchMaxResults, clampTopicMaxResults } from '../websearch-topic-extract';

export { formatYmdChinese, industryDailySearchBounds, reportDateSearchWindow, shiftYmd } from './industry-daily-date';

export type IndustryDailyTopicPreviewInput = {
  industry: string;
  industryCustom?: string;
  dateMode?: string;
  reportDate?: string;
  /** global | cn | tw | jp | na | eu；默认 global */
  searchRegion?: string;
  /** 检索召回条数（可达 200） */
  maxResults?: number;
  /** 热点提炼返回条数；与 maxResults 解耦，默认 8 */
  topicCount?: number;
  /** 已分类的检索赛道；缺省则 preview 内解析 */
  searchTrack?: string;
  language?: string;
  userId?: string;
};

export type IndustryDailyTopicPreviewResult = {
  query: string;
  queries: string[];
  ymd: string;
  dateLabel: string;
  depth: string;
  providers: string[];
  hitCount: number;
  truncated: boolean;
  text: string;
  items: Array<{ title: string; url: string; snippet: string; domain: string }>;
  topicChips: string[];
  /** 供 C 端回写 params.search_track */
  search_track: string;
  track_source?: string;
};

/** 中文日期：2026年7月22日 */
/** 有 publishedAt 且明显偏离报道日（>2 天）的条目剔除；无日期保留 */
export function filterSearchItemsByReportYmd<T extends { publishedAt?: string; title?: string }>(
  items: T[],
  reportYmd: string,
  maxDaySkew = 2
): T[] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(reportYmd.trim());
  if (!m || items.length === 0) return items;
  const reportMs = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const kept: T[] = [];
  for (const it of items) {
    const raw = String(it.publishedAt ?? '').trim();
    if (!raw) {
      kept.push(it);
      continue;
    }
    const pub = new Date(raw);
    if (Number.isNaN(pub.getTime())) {
      kept.push(it);
      continue;
    }
    const pubYmd = `${pub.getUTCFullYear()}-${String(pub.getUTCMonth() + 1).padStart(2, '0')}-${String(pub.getUTCDate()).padStart(2, '0')}`;
    const pm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(pubYmd);
    if (!pm) {
      kept.push(it);
      continue;
    }
    const pubMs = Date.UTC(Number(pm[1]), Number(pm[2]) - 1, Number(pm[3]));
    const skew = Math.abs(pubMs - reportMs) / (24 * 60 * 60 * 1000);
    if (skew <= maxDaySkew) kept.push(it);
  }
  return kept.length > 0 ? kept : items;
}

/**
 * 多组查询：走赛道 + 检索范围策略（维度/域名/后缀）。
 * 默认全球：英文向查询、不强制大陆域名白名单。
 * 今日/昨日/自定义带具体日历日；本周/本月用周期词 + 对应检索窗。
 */
export function buildIndustryDailyTopicQueries(params: Record<string, unknown>): {
  primary: string;
  queries: string[];
  ymd: string;
  dateLabel: string;
  mode: ReturnType<typeof resolveIndustryDailyDateLabel>['mode'];
  timeRange: 'day' | 'week' | 'month';
  startDate: string;
  endDate: string;
  maxDaySkew: number;
  dimensions: SearchDimension[];
  depth: SearchDepth;
  includeDomains?: string[];
  track: string;
  searchRegion: string;
  /** 检索引擎语种：多语言检索固定 all */
  searchLanguage: 'zh' | 'en' | 'all';
} {
  const strategy = resolveIndustrySearchStrategy(params);
  const { sector, dimensions, depth, includeDomains, searchRegion, searchLanguage, track } =
    strategy;
  const { dateLabel, ymd, mode } = resolveIndustryDailyDateLabel(params);
  const bounds = industryDailySearchBounds(mode, ymd);
  const queries = buildMultilingualIndustryQueries({
    sector,
    track,
    region: searchRegion,
    ymd,
    dateMode: mode,
    maxQueries: 3,
  });
  const primary =
    buildIndustryTrendSearchQuery(params) || queries[0] || `${sector} ${ymd} news`.trim();
  return {
    primary,
    queries: [...new Set([primary, ...queries].filter(Boolean))],
    ymd,
    dateLabel,
    mode,
    timeRange: bounds.timeRange,
    startDate: bounds.startDate,
    endDate: bounds.endDate,
    maxDaySkew: bounds.maxDaySkew,
    dimensions,
    depth,
    includeDomains,
    track,
    searchRegion,
    searchLanguage,
  };
}

/** 清洗标题：去 markdown / 站点后缀噪声 */
export function cleanNewsHeadline(raw: string): string {
  let t = raw.trim();
  t = t.replace(/^#+\s*/, '').replace(/\s*#+\s*/g, ' ').trim();
  t = t.replace(/^\[\d+\]\s*/, '');
  t = t.replace(/\s*[-—–|｜]\s*[^|-—–｜]{1,20}$/u, '').trim();
  // 常见「_新浪财经_新浪网」「_财经新闻」站名尾巴
  t = t.replace(/_[^_]{0,12}(财经|新闻|网|日报|时报).*$/u, '').trim();
  t = t.replace(/\s+/g, ' ');
  return t;
}

/**
 * 从 title/snippet 提炼一条「像新闻事件」的话题；源站/栏目名返回 null。
 */
export function extractHotTopicFromSearchItem(item: {
  title?: string;
  snippet?: string;
  domain?: string;
}): string | null {
  const title = cleanNewsHeadline(String(item.title ?? ''));
  const snippet = String(item.snippet ?? '').replace(/\s+/g, ' ').trim();
  const domain = String(item.domain ?? '').trim().toLowerCase();

  const candidates: string[] = [];
  if (title) candidates.push(title);

  if (snippet) {
    const book = snippet.match(/《([^》]{6,40})》/);
    if (book?.[1]) candidates.push(book[1].trim());
    const first = snippet.split(/[。！？\n]/)[0]?.trim() ?? '';
    if (first.length >= 12 && first.length <= 72) candidates.push(cleanNewsHeadline(first));
  }

  for (const c of candidates) {
    if (!isLikelyEventHeadline(c, domain)) continue;
    return c.length > 64 ? `${c.slice(0, 62)}…` : c;
  }
  return null;
}

/** 比通用 chip 过滤更严：必须像「事件/要闻」，不能是源站名 */
export function isLikelyEventHeadline(title: string, domain = ''): boolean {
  const t = title.trim();
  if (!isLikelyHotTopicTitle(t)) return false;
  if (
    /报社$|时报$|日报$|周刊$|频道$|专题$|首页$|订阅$|訂閱$|Bloomberg|彭博|marketscreener|Reuters|路透/i.test(
      t
    ) &&
    t.length < 24
  ) {
    return false;
  }
  if (/^(金融市场|金融话题|国际金融|财经频道|热点话题|热门推荐)/.test(t) && t.length < 20) {
    return false;
  }
  // 门户导航 / 频道聚合（多栏目用 | 拼）
  if ((t.match(/[|｜]/g) || []).length >= 2) return false;
  if (/即時新聞|即时新闻|頭條新聞|头条新闻|网络领袖|官方网站|门户|財經,\s*地產|财经,\s*地产/.test(t)) {
    return false;
  }
  if (domain) {
    const host = domain.replace(/^www\./, '').split('.')[0] ?? '';
    if (host && t.toLowerCase().includes(host) && t.length < host.length + 8) return false;
  }
  const hasCjk = /[\u4e00-\u9fff]/.test(t);
  const hasEventCue =
    /\d/.test(t) ||
    /[《》]/.test(t) ||
    /(涨|跌|升|降|发布|宣布|通过|签署|上调|下调|制裁|上市|并购|暴雷|裁员|加息|降息|监管|处罚|突破|创新高|创新低|停牌|复牌|财报|营收|利润|要闻|日报|摘要|盈利|份额)/.test(
      t
    ) ||
    (hasCjk && t.length >= 16 && !/[|｜]/.test(t));
  if (!hasEventCue) return false;
  return true;
}

export function extractIndustryDailyTopicChips(
  items: Array<{ title?: string; snippet?: string; domain?: string }>,
  max = 8
): string[] {
  const chips: string[] = [];
  for (const it of items) {
    if (chips.length >= max) break;
    const topic = extractHotTopicFromSearchItem(it);
    if (!topic || chips.includes(topic)) continue;
    chips.push(topic);
  }
  return chips;
}

/**
 * 可选：由调用方注入「走 text 业务」的话题提炼（禁止本文件硬调裸 LLM）。
 */
export type TopicChipsExtractFn = (args: {
  items: Array<{ title?: string; snippet?: string; domain?: string; url?: string }>;
  industry: string;
  ymd: string;
  dateLabel: string;
  query: string;
  /** 与 webSearch.maxResults 对齐 */
  maxTopics: number;
  /** 用户成稿语言：zh | zh-TW | en | ja；总结阶段收拢用 */
  language?: string;
}) => Promise<string[]>;

type SearchRunner = (args: {
  query: string;
  dimensions: SearchDimension[];
  depth: SearchDepth;
  numResults: number;
  timeRange: 'day' | 'week' | 'month';
  startDate?: string;
  endDate?: string;
  includeDomains?: string[];
  language?: 'zh' | 'en' | 'all';
}) => Promise<{
  aggregated: SearchResultItem[];
  providers?: string[];
  depth?: string;
}>;

/**
 * 跑 1～2 组查询，合并结果；话题必须由 extractTopics（text 业务）产出，失败即抛错。
 */
export async function previewIndustryDailyTopics(
  input: IndustryDailyTopicPreviewInput,
  search: SearchRunner,
  opts: { extractTopics: TopicChipsExtractFn }
): Promise<IndustryDailyTopicPreviewResult> {
  const params: Record<string, unknown> = {
    industry: input.industry,
    industry_custom: input.industryCustom,
    date_mode: input.dateMode ?? 'today',
    report_date: input.reportDate,
    search_region: input.searchRegion ?? 'global',
    ...(input.searchTrack ? { search_track: input.searchTrack } : {}),
    ...(input.language ? { language: input.language } : {}),
  };
  const trackResolved = await resolveSearchTrackForParams(params, {
    userId: input.userId,
    requireModelForCustom: true,
  });
  params.search_track = trackResolved.track;
  const built = buildIndustryDailyTopicQueries(params);
  const max = clampSearchMaxResults(input.maxResults ?? 8);
  const topicCount = clampTopicMaxResults(input.topicCount ?? Math.min(8, max));
  const highRecall = max >= 40;
  const seenUrl = new Set<string>();
  const merged: SearchResultItem[] = [];
  const providers = new Set<string>();
  let depthUsed = 'quick';

  const queryList = highRecall
    ? buildMultilingualIndustryQueries({
        sector: resolveIndustrySearchStrategy(params).sector,
        track: built.track as 'finance' | 'tech' | 'entertainment' | 'sports' | 'general',
        region: built.searchRegion as SearchRegion,
        ymd: built.ymd,
        dateMode: built.mode,
        maxQueries: 9,
        expandAllSuffixes: true,
      })
    : built.queries;

  // 多语言 / 多后缀查询：高召回并行批跑，再交给 LLM 按 topicCount 收拢
  const batchSize = 3;
  for (let qi = 0; qi < queryList.length; qi += batchSize) {
    if (merged.length >= max) break;
    const batch = queryList.slice(qi, qi + batchSize);
    const results = await Promise.all(
      batch.map((q) =>
        search({
          query: q,
          dimensions: built.dimensions,
          depth: built.depth,
          numResults: Math.min(20, Math.max(8, Math.ceil(max / Math.max(1, queryList.length)))),
          timeRange: built.timeRange,
          startDate: built.startDate,
          endDate: built.endDate,
          includeDomains: built.includeDomains,
          language: 'all',
        })
      )
    );
    for (const res of results) {
      depthUsed = res.depth || built.depth;
      for (const p of res.providers ?? []) {
        if (p) providers.add(p);
      }
      for (const it of res.aggregated ?? []) {
        const url = String(it.url ?? '').trim();
        const key = url || `${it.title}|${it.snippet}`;
        if (seenUrl.has(key)) continue;
        seenUrl.add(key);
        merged.push(it);
      }
    }
  }

  const dated = filterSearchItemsByReportYmd(merged, built.ymd, built.maxDaySkew);
  const ranked = preferItemsForSearchRegion(dated, built.searchRegion as SearchRegion);
  const rawItems = ranked.slice(0, max).map((it) => ({
    title: String(it.title ?? '').trim(),
    url: String(it.url ?? '').trim(),
    snippet: String(it.snippet ?? '').trim(),
    domain: String(it.domain ?? '').trim(),
    publishedAt: it.publishedAt,
  }));

  const sector =
    (String(input.industry).trim() === '其他' || String(input.industry).trim() === '其它'
      ? String(input.industryCustom ?? '').trim()
      : String(input.industry).trim()) || '综合';

  const sanitized = sanitizeWebsourceForLlm(
    {
      query: queryList.join(' | '),
      depth: depthUsed,
      items: rawItems,
    },
    sector,
    max
  );
  const items = (sanitized.items ?? []).map((it) => ({
    title: String(it.title ?? '').trim(),
    url: String(it.url ?? '').trim(),
    snippet: String(it.snippet ?? '').trim(),
    domain: String(it.domain ?? '').trim(),
  }));

  if (!opts?.extractTopics) {
    throw new Error('previewIndustryDailyTopics 必须提供 extractTopics（走 text 业务，禁止规则回退）');
  }
  const topicChips = await opts.extractTopics({
    items,
    industry: sector,
    ymd: built.ymd,
    dateLabel: built.dateLabel,
    query: queryList.join(' | '),
    maxTopics: topicCount,
    language: String(input.language ?? 'zh').trim() || 'zh',
  });
  if (!Array.isArray(topicChips) || topicChips.length === 0) {
    throw new Error('话题提炼结果为空');
  }

  const text =
    `【联网检索 · 行业日报热点】\n查询: ${queryList[0]}\n日期: ${built.ymd}（${built.dateLabel}）\n\n${String(sanitized.text ?? '')
      .replace(/^【联网检索[^\n]*\n查询:[^\n]*\n*/, '')
      .trim()}`.trim();

  return {
    query: queryList[0]!,
    queries: queryList,
    ymd: built.ymd,
    dateLabel: built.dateLabel,
    depth: depthUsed,
    providers: [...providers],
    hitCount: items.length,
    truncated: merged.length > items.length || Boolean(sanitized.truncated),
    text,
    items,
    topicChips,
    search_track: trackResolved.track,
    track_source: trackResolved.source,
  };
}
