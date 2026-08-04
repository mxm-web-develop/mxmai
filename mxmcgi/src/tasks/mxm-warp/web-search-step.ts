/**
 * mxm-warp 网络检索管线步：平台通用节点；业务差异用 params / queryBuilder 插件。
 *
 * params:
 * - query / queryTemplate / queryFrom
 * - queryBuilder?: 命名策略（如 industryTrend）
 * - target / depth / maxResults / resultMaxChars
 * - scaleFrom?: 表单/合同字段名；配合 depthByScale / maxResultsByScale 按档覆盖 depth/maxResults
 * - depthByScale / maxResultsByScale?: Record<档位值, depth|number>
 * - dimensions / timeRange / startDate / endDate / includeDomains / language
 * - resultClean?: true | false | { dropLowQualityDomains?, stripBoilerplate?, dedupeByUrlTitle? }
 *   industryTrend 默认开启；其它 builder 默认关（可显式 true）
 * - topicExtractTextKey?: 遗留内嵌提炼（推荐独立 extractHotTopics 步）
 */
import type { PipelineStep, TaskContext } from '../types';
import { ConfigurationError } from '../errors';
import { SearchService } from '../../core/search/search-service';
import { listUsableSearchProviderNames } from '../../core/search/search-config';
import type {
  DeepSearchRequest,
  SearchDepth,
  SearchDimension,
} from '../../core/search/types';
import { getContract, withContract } from './input-stage';
import { emptyContract, MXM_WARP_CONTRACT_VERSION } from './contract-types';
import { registerInputStep, registerOutputStep } from '../pipeline-registry';
import { resolveSectorLabel } from './industry-search-track-classify';
import { resolveIndustryDailyDateLabel } from './industry-daily-date';
import {
  sanitizeWebsourceForLlm,
  clampSearchMaxResults,
  clampTopicMaxResults,
  TOPIC_POOL_DEFAULT,
} from '../websearch-topic-extract';
import {
  resolveWebSearchQueryBuilder,
  buildIndustryTrendSearchQuery,
  mergeIndustryParams,
} from './query-builders';
import {
  putEvidence,
  slimWebSearchForContract,
  targetToEvidenceKey,
  getEvidence,
} from './evidence';
import './query-builders';

const DEFAULT_RESULT_MAX_CHARS = 2500;
const SEARCH_DEPTHS = new Set<SearchDepth>(['quick', 'standard', 'deep']);

/**
 * 从节点静态 params + 可选 scaleFrom 档位表解析 depth / maxResults。
 * 业务把篇幅等枚举写在 formSchema，用 depthByScale / maxResultsByScale 映射，勿在此写死业务键。
 */
export function resolveScaledSearchKnobs(
  ctx: TaskContext,
  params: Record<string, unknown>
): { depth: SearchDepth; maxResults: number } {
  let depthRaw = typeof params.depth === 'string' ? params.depth.trim() : '';
  let maxResults =
    typeof params.maxResults === 'number' && Number.isFinite(params.maxResults)
      ? clampSearchMaxResults(params.maxResults)
      : 8;

  const scaleFrom = String(params.scaleFrom ?? '').trim();
  if (scaleFrom) {
    const merged = mergeIndustryParams(ctx);
    const scaleKey = String(merged[scaleFrom] ?? '').trim();
    if (scaleKey) {
      const depthBy = params.depthByScale;
      if (depthBy && typeof depthBy === 'object' && !Array.isArray(depthBy)) {
        const mapped = String((depthBy as Record<string, unknown>)[scaleKey] ?? '').trim();
        if (mapped) depthRaw = mapped;
      }
      const maxBy = params.maxResultsByScale;
      if (maxBy && typeof maxBy === 'object' && !Array.isArray(maxBy)) {
        const n = Number((maxBy as Record<string, unknown>)[scaleKey]);
        if (Number.isFinite(n)) maxResults = clampSearchMaxResults(n);
      }
    }
  }

  const depth: SearchDepth =
    depthRaw && SEARCH_DEPTHS.has(depthRaw as SearchDepth)
      ? (depthRaw as SearchDepth)
      : 'standard';
  return { depth, maxResults };
}

const SEARCH_DEPTH_LABELS: Record<SearchDepth, string> = {
  quick: '快速',
  standard: '标准',
  deep: '深度',
};
const SEARCH_DIMENSIONS = new Set<SearchDimension>([
  'general',
  'news',
  'academic',
  'forum',
  'social',
  'video',
  'official',
  'finance',
  'all',
]);

/** 'sources.websource' 或 'enrich_search.<key>'（如 result / result_supplement） */
export type WebSearchTarget = 'sources.websource' | `enrich_search.${string}`;

/** multiQuery 控制：是否启用、补几条、最多几条、是否同步开抓全文 */
function parseMultiQueries(raw: unknown): {
  enabled: boolean;
  extra: number;
  maxQueries: number;
  extractContent: boolean;
} {
  if (raw === undefined) return { enabled: false, extra: 2, maxQueries: 4, extractContent: false };
  if (raw === false) return { enabled: false, extra: 0, maxQueries: 1, extractContent: false };
  if (raw === true) return { enabled: true, extra: 2, maxQueries: 4, extractContent: false };
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    const enabled = o.enabled !== false;
    const extra = Number.isFinite(o.extra) ? Math.max(0, Math.floor(Number(o.extra))) : 2;
    const maxQueries = Number.isFinite(o.maxQueries)
      ? Math.max(1, Math.floor(Number(o.maxQueries)))
      : Math.max(1, extra + 1);
    const extractContent = o.extractContent === true;
    return { enabled, extra, maxQueries, extractContent };
  }
  if (typeof raw === 'number' && raw > 0) {
    return { enabled: true, extra: Math.floor(raw), maxQueries: Math.floor(raw) + 1, extractContent: false };
  }
  if (typeof raw === 'string' && raw.trim()) {
    const arr = raw
      .split(/[,，\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    return arr.length > 0
      ? { enabled: true, extra: arr.length, maxQueries: arr.length + 1, extractContent: false }
      : { enabled: false, extra: 0, maxQueries: 1, extractContent: false };
  }
  return { enabled: false, extra: 0, maxQueries: 1, extractContent: false };
}

/**
 * 默认 multi-query 派生（不调 LLM，纯规则）。
 * - fact  事实/数据
 * - review 评价/争议/反方
 * - latest 最新动态
 * 仅用于「通用 webSearch」节点；业务可在 deps.buildMultiQueries 注入 LLM 派生
 */
export function defaultBuildMultiQueries(
  primary: string,
  ctx: TaskContext
): string[] {
  const base = String(primary ?? '').trim();
  if (!base) return [];
  const lang =
    String((ctx.params as Record<string, unknown>)?.language ?? 'zh').trim() || 'zh';
  const tmpl: Record<string, Record<string, string>> = {
    zh: {
      fact: `${base} 事实 数据 出处`,
      review: `${base} 争议 反方 评价 风险`,
      latest: `${base} 最新 进展 动态`,
    },
    en: {
      fact: `${base} facts data evidence`,
      review: `${base} controversy criticism risks`,
      latest: `${base} latest news update`,
    },
  };
  const set = tmpl[lang === 'en' ? 'en' : 'zh'];
  return [set.fact, set.review, set.latest];
}

/** 本地格式化，避免导入 context-field-resolver（会拉起 Supabase） */
function formatWebSearchBlock(
  searchDepth: SearchDepth,
  query: string,
  items: Array<{ title?: string; url?: string; snippet?: string }>,
  maxChars: number
): { text: string; hitCount: number; truncated: boolean } {
  const depthLabel = SEARCH_DEPTH_LABELS[searchDepth] ?? searchDepth;
  const header = `【联网检索 · ${depthLabel}】\n查询: ${query}\n`;
  if (items.length === 0) {
    return { text: `${header}\n（未检索到结果）`, hitCount: 0, truncated: false };
  }
  const lines: string[] = [header.trimEnd()];
  let truncated = false;
  let hitCount = 0;
  for (const item of items) {
    const title = (item.title || '').trim();
    const snippet = (item.snippet || '').trim();
    const url = (item.url || '').trim();
    const block = `[${hitCount + 1}] ${title}\n${snippet}${url ? `\n来源: ${url}` : ''}`.trim();
    const candidate = `${lines.join('\n\n')}\n\n${block}`;
    if (candidate.length > maxChars) {
      truncated = true;
      break;
    }
    lines.push(block);
    hitCount += 1;
  }
  return { text: lines.join('\n\n'), hitCount, truncated };
}

function readPath(ctx: TaskContext, path: string): unknown {
  const p = path.trim();
  if (!p) return undefined;
  if (p.startsWith('params.')) {
    const key = p.slice('params.'.length);
    return (ctx.params as Record<string, unknown>)[key];
  }
  if (p.startsWith('contract.')) {
    const contract = getContract(ctx);
    if (!contract) return undefined;
    const rest = p.slice('contract.'.length);
    const parts = rest.split('.').filter(Boolean);
    let cur: unknown = contract;
    for (const part of parts) {
      if (!cur || typeof cur !== 'object' || Array.isArray(cur)) return undefined;
      cur = (cur as Record<string, unknown>)[part];
    }
    return cur;
  }
  return (ctx.params as Record<string, unknown>)[p];
}

function coerceQuery(raw: unknown): string {
  if (typeof raw === 'string') return raw.trim();
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    for (const k of ['query', 'q', 'topic', 'search']) {
      if (typeof o[k] === 'string' && String(o[k]).trim()) return String(o[k]).trim();
    }
  }
  return '';
}

function parseDimensions(raw: unknown): SearchDimension[] | undefined {
  if (Array.isArray(raw)) {
    const dims = raw
      .map((d) => String(d).trim())
      .filter((d): d is SearchDimension => SEARCH_DIMENSIONS.has(d as SearchDimension));
    return dims.length ? dims : undefined;
  }
  if (typeof raw === 'string' && raw.trim()) {
    const dims = raw
      .split(/[,，\s]+/)
      .map((d) => d.trim())
      .filter((d): d is SearchDimension => SEARCH_DIMENSIONS.has(d as SearchDimension));
    return dims.length ? dims : undefined;
  }
  return undefined;
}

function parseIncludeDomains(raw: unknown): string[] | undefined {
  if (Array.isArray(raw)) {
    const list = raw.map((d) => String(d).trim()).filter(Boolean);
    return list.length ? list : undefined;
  }
  if (typeof raw === 'string' && raw.trim()) {
    const list = raw
      .split(/[,，\s]+/)
      .map((d) => d.trim())
      .filter(Boolean);
    return list.length ? list : undefined;
  }
  return undefined;
}

function parseTimeRange(
  raw: unknown
): 'day' | 'week' | 'month' | 'year' | undefined {
  const s = String(raw ?? '').trim();
  if (s === 'day' || s === 'week' || s === 'month' || s === 'year') return s;
  return undefined;
}

/** 通用路径：从节点 params 组装 SearchService 请求 */
export function buildGenericWebSearchRequest(
  step: PipelineStep,
  query: string,
  opts: { depth: SearchDepth; maxResults: number }
): DeepSearchRequest {
  const params = (step.params ?? {}) as Record<string, unknown>;
  const dimensions = parseDimensions(params.dimensions) ?? ['news', 'general'];
  const timeRange = parseTimeRange(params.timeRange);
  const startDate = String(params.startDate ?? '').trim() || undefined;
  const endDate = String(params.endDate ?? '').trim() || undefined;
  const includeDomains = parseIncludeDomains(params.includeDomains);
  const languageRaw = String(params.language ?? '').trim();
  const language =
    languageRaw === 'zh' || languageRaw === 'en' || languageRaw === 'all'
      ? languageRaw
      : undefined;

  const req: DeepSearchRequest = {
    query,
    depth: opts.depth,
    numResults: opts.maxResults,
    dimensions,
  };
  if (timeRange) req.timeRange = timeRange;
  if (startDate) req.startDate = startDate;
  if (endDate) req.endDate = endDate;
  if (includeDomains) req.includeDomains = includeDomains;
  if (language) req.language = language;
  return req;
}

export function resolveWebSearchQuery(ctx: TaskContext, step: PipelineStep): string {
  const params = (step.params ?? {}) as Record<string, unknown>;
  const direct = typeof params.query === 'string' ? params.query.trim() : '';
  if (direct) return direct;

  const builderName = String(params.queryBuilder ?? '').trim();
  const builder = resolveWebSearchQueryBuilder(builderName);
  if (builder) {
    const q = builder.buildQuery(ctx, step).trim();
    if (q) return q;
  }

  const tmpl = typeof params.queryTemplate === 'string' ? params.queryTemplate.trim() : '';
  if (tmpl) {
    const built = interpolateQueryTemplate(tmpl, ctx).trim();
    if (built) return built.replace(/\s+/g, ' ').trim();
  }

  const from = typeof params.queryFrom === 'string' ? params.queryFrom.trim() : '';
  if (from) {
    const q = coerceQuery(readPath(ctx, from));
    if (q) return q;
  }

  const target = resolveWebSearchTarget(step);
  if (target === 'enrich_search.result') {
    const contract = getContract(ctx);
    const plan = contract?.enrich_search;
    const q = coerceQuery(plan);
    if (q) return q;
  }

  return '';
}

/** ${params.x} / ${contract.a.b}；空值替换为空串。contract.basic.X 为空时回退 params.X */
export function interpolateQueryTemplate(template: string, ctx: TaskContext): string {
  return template.replace(/\$\{([^}]+)\}/g, (_m, rawPath: string) => {
    const path = String(rawPath || '').trim();
    let v = readPath(ctx, path);
    if (
      (v == null || v === '') &&
      path.startsWith('contract.basic.') &&
      path.split('.').length === 3
    ) {
      const key = path.slice('contract.basic.'.length);
      v = (ctx.params as Record<string, unknown>)[key];
    }
    if (v == null) return '';
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
    return '';
  });
}

/**
 * 列表式多 query（平台原语，无业务硬编码）：
 * - queriesFrom: 路径 → string | string[]（；/; 可拆）
 * - excludeQueryFrom: 可选，排除主线话题
 * - querySuffix: 可选，拼到每条话题后
 * - maxQueries: 最多几条（默认 3）
 * 返回 null = 未启用列表模式；[] = 启用但无有效副线（调用方应 no-op）。
 */
export function resolveQueriesFromList(ctx: TaskContext, step: PipelineStep): string[] | null {
  const params = (step.params ?? {}) as Record<string, unknown>;
  const from = typeof params.queriesFrom === 'string' ? params.queriesFrom.trim() : '';
  if (!from) return null;

  const raw = readPath(ctx, from);
  let topics: string[] = [];
  if (Array.isArray(raw)) {
    for (const it of raw) {
      if (typeof it === 'string' || typeof it === 'number') {
        topics.push(...String(it).split(/[；;]/).map((s) => s.trim()).filter(Boolean));
      } else if (it && typeof it === 'object' && !Array.isArray(it)) {
        const o = it as Record<string, unknown>;
        const label = String(o.title ?? o.topic ?? o.name ?? '').trim();
        if (label) topics.push(label);
      }
    }
  } else if (typeof raw === 'string' || typeof raw === 'number') {
    topics = String(raw)
      .split(/[；;]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const excludePath =
    typeof params.excludeQueryFrom === 'string' ? params.excludeQueryFrom.trim() : '';
  const exclude = excludePath ? coerceQuery(readPath(ctx, excludePath)) : '';
  const suffix = typeof params.querySuffix === 'string' ? params.querySuffix.trim() : '';
  const maxRaw = Number(params.maxQueries ?? 3);
  const maxQueries =
    Number.isFinite(maxRaw) && maxRaw > 0 ? Math.min(8, Math.floor(maxRaw)) : 3;

  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of topics) {
    if (!t) continue;
    if (
      exclude &&
      (t === exclude || t.includes(exclude) || exclude.includes(t))
    ) {
      continue;
    }
    const q = suffix ? `${t} ${suffix}`.replace(/\s+/g, ' ').trim() : t;
    if (seen.has(q)) continue;
    seen.add(q);
    out.push(q);
    if (out.length >= maxQueries) break;
  }
  return out;
}

/** @deprecated 请从 query-builders 导入；保留兼容旧测试 */
export { buildIndustryTrendSearchQuery, mergeIndustryParams };

export { resolveIndustryDailyDateLabel, formatYmdChinese as formatYmdForQuery } from './industry-daily-date';

export function resolveWebSearchTarget(step: PipelineStep): WebSearchTarget {
  const t = String((step.params as Record<string, unknown> | undefined)?.target ?? '').trim();
  if (/^enrich_search\.[A-Za-z0-9_]+$/.test(t)) return t as WebSearchTarget;
  return 'sources.websource';
}

function ensureContract(ctx: TaskContext): TaskContext {
  if (getContract(ctx)) return ctx;
  return withContract(
    ctx,
    emptyContract({
      version: MXM_WARP_CONTRACT_VERSION,
      scope: ctx.scope,
      taskKey: ctx.taskKey,
      subtype: ctx.subtype ?? null,
      taskId: ctx.taskId || '',
    })
  );
}

export type WebSearchRunDeps = {
  search?: (args: DeepSearchRequest) => Promise<{
    items: Array<{ title?: string; url?: string; snippet?: string; domain?: string }>;
    providers: string[];
  }>;
  /** 多角度补搜：返回多条衍生 query；调用方各自独立 deepSearch 后合并 */
  buildMultiQueries?: (
    primary: string,
    ctx: TaskContext
  ) => Promise<string[]> | string[];
};

async function defaultSearch(args: DeepSearchRequest): Promise<{
  items: Array<{ title?: string; url?: string; snippet?: string; domain?: string }>;
  providers: string[];
  extractedContent?: import('../../core/search/types').ContentExtractResult[];
}> {
  const usable = await listUsableSearchProviderNames();
  if (usable.length === 0) {
    throw new ConfigurationError(
      'webSearch：当前无可用搜索引擎，请在 Admin 搜索配置中启用至少一个信息源'
    );
  }
  const searchService = new SearchService();
  const includeExtract = args.extractContent === true;
  let result: import('../../core/search/types').MultiDimensionSearchResult & {
    extractedContent?: import('../../core/search/types').ContentExtractResult[];
  };
  const useWithExtract =
    includeExtract && typeof (searchService as any).deepSearchWithExtract === 'function';
  if (useWithExtract) {
    result = await (searchService as any).deepSearchWithExtract(args);
  } else {
    result = await searchService.deepSearch(args);
  }
  const providers = [
    ...new Set(
      Object.values(result.dimensionResults)
        .map((r) => r?.provider)
        .filter((p): p is string => typeof p === 'string' && p.length > 0)
    ),
  ];
  return {
    items: result.aggregated ?? [],
    providers,
    extractedContent: useWithExtract ? (result as { extractedContent?: unknown }).extractedContent as import('../../core/search/types').ContentExtractResult[] | undefined : undefined,
  };
}

/** 从节点 + 任务参数解析 SearchService 请求 */
export function resolveWebSearchRequest(
  ctx: TaskContext,
  step: PipelineStep,
  query: string
): DeepSearchRequest {
  const params = (step.params ?? {}) as Record<string, unknown>;
  const { depth, maxResults } = resolveScaledSearchKnobs(ctx, params);

  const builderName = String(params.queryBuilder ?? '').trim();
  const builder = resolveWebSearchQueryBuilder(builderName);
  if (builder) {
    return builder.buildRequest(ctx, step, query, { depth, maxResults });
  }

  return buildGenericWebSearchRequest(step, query, { depth, maxResults });
}

/** 可测入口：写入合同 sources.websource 或 enrich_search.<key> */
export async function runWebSearchStep(
  ctx: TaskContext,
  step: PipelineStep,
  deps?: WebSearchRunDeps
): Promise<TaskContext> {
  let next = ensureContract(ctx);
  const params = (step.params ?? {}) as Record<string, unknown>;
  const target = resolveWebSearchTarget(step);
  const builderName = String(params.queryBuilder ?? '').trim();
  const builder = resolveWebSearchQueryBuilder(builderName);

  if (builder?.prepareContext) {
    next = await builder.prepareContext(next, step);
  }

  const contract0 = getContract(next)!;

  // C 端 pre 预览 / 续跑：已有证据或全量合同则跳过重复检索
  if (target === 'sources.websource') {
    const existingEv = getEvidence(next, 'websource');
    const evPayload = existingEv?.payload;
    const existing = contract0.sources?.websource;
    const sourcePayload =
      evPayload &&
      typeof evPayload === 'object' &&
      (Number(evPayload.hitCount) > 0 ||
        (Array.isArray(evPayload.items) && evPayload.items.length > 0))
        ? evPayload
        : existing &&
            typeof existing === 'object' &&
            !Array.isArray(existing) &&
            !(existing as { evidenceKey?: string }).evidenceKey &&
            (Number((existing as { hitCount?: number }).hitCount) > 0 ||
              (Array.isArray((existing as { items?: unknown[] }).items) &&
                ((existing as { items?: unknown[] }).items?.length ?? 0) > 0))
          ? (existing as Record<string, unknown>)
          : null;

    if (sourcePayload) {
      const industry = resolveSectorLabel(mergeIndustryParams(next));
      const { maxResults } = resolveScaledSearchKnobs(next, params);
      const preferClean = builderName === 'industryTrend';
      const cleaned = sanitizeWebsourceForLlm(
        sourcePayload as import('../websearch-topic-extract').WebsourcePayload,
        industry,
        maxResults,
        {
          resultClean:
            params.resultClean === undefined
              ? preferClean
                ? true
                : false
              : (params.resultClean as boolean | Record<string, unknown> | null),
        }
      );
      const topicChips =
        sourcePayload.topicChips ??
        (existing && typeof existing === 'object'
          ? (existing as { topicChips?: unknown }).topicChips
          : undefined);
      const fullPayload: Record<string, unknown> = {
        ...sourcePayload,
        ...cleaned,
        topicChips,
      };
      const evidenceKey = targetToEvidenceKey(target);
      next = putEvidence(next, evidenceKey, fullPayload);
      return withContract(next, {
        ...contract0,
        sources: {
          ...contract0.sources,
          websource: slimWebSearchForContract(fullPayload, evidenceKey),
        },
      });
    }
  }

  const listQueries = resolveQueriesFromList(next, step);
  if (listQueries !== null && listQueries.length === 0) {
    // 列表模式已声明但无副线话题：跳过，不抛错
    return next;
  }

  const query =
    listQueries && listQueries.length > 0
      ? listQueries[0]!
      : resolveWebSearchQuery(next, step);
  if (!query) {
    throw new ConfigurationError(
      'webSearch：缺少查询。请在节点配置 query、queryTemplate、queryFrom、queriesFrom 或已注册的 queryBuilder'
    );
  }

  const searchRequest = resolveWebSearchRequest(next, step, query);
  const depth = searchRequest.depth ?? 'standard';
  const maxResults = searchRequest.numResults ?? 8;
  const resultMaxChars =
    typeof params.resultMaxChars === 'number' && Number.isFinite(params.resultMaxChars)
      ? Math.max(200, Math.floor(params.resultMaxChars))
      : DEFAULT_RESULT_MAX_CHARS;

  const searchFn = deps?.search ?? defaultSearch;
  const buildMultiQueries =
    deps?.buildMultiQueries ?? defaultBuildMultiQueries;

  // queriesFrom 列表优先；否则 multiQuery 从主 query 派生多角度
  const multi = parseMultiQueries(params.multiQuery);
  const queries: string[] =
    listQueries && listQueries.length > 0 ? [...listQueries] : [query];
  if (!(listQueries && listQueries.length > 0) && multi.enabled) {
    const extra = await buildMultiQueries(query, next);
    for (const q of extra ?? []) {
      const t = String(q ?? '').trim();
      if (t && t !== query && !queries.includes(t)) queries.push(t);
      if (queries.length >= multi.maxQueries) break;
    }
  }

  let items: Awaited<ReturnType<typeof searchFn>>['items'] = [];
  let providers: string[] = [];
  let extracted:
    | NonNullable<Awaited<ReturnType<typeof searchFn>>['extractedContent']>
    | undefined;
  let queryLabel = query;
  if (builder?.runMultiQuery) {
    const mr = await builder.runMultiQuery({
      ctx: next,
      step,
      searchRequest,
      searchFn,
      maxResults,
      primaryQuery: query,
    });
    items = mr.items;
    providers = mr.providers;
    queryLabel = mr.queryLabel;
  } else if (queries.length > 1) {
    // 多角度：并行搜多 query，合并 items；extract 默认与单 query 一致（可用 params.extractContent=false 关闭）
    const wantExtract =
      params.extractContent === undefined
        ? true
        : params.extractContent === true || multi.extractContent === true;
    const perQueryReq = buildGenericWebSearchRequest(step, query, { depth, maxResults });
    perQueryReq.extractContent = wantExtract;
    if (wantExtract) {
      perQueryReq.maxExtractCount =
        typeof params.maxExtractCount === 'number' && Number.isFinite(params.maxExtractCount)
          ? Math.max(1, Math.floor(params.maxExtractCount))
          : 5;
      perQueryReq.extractDomains = parseIncludeDomains(params.extractDomains);
    }
    const subResults = await Promise.all(
      queries.map((q) =>
        searchFn({ ...perQueryReq, query: q }).catch((err) => {
          console.warn(`[webSearch] multi-query 子查询失败：${q}（${(err as Error).message}）`);
          return { items: [], providers: [] as string[] };
        })
      )
    );
    const seen = new Set<string>();
    const merged: typeof items = [];
    const extMerged: NonNullable<typeof extracted> = [];
    for (const r of subResults) {
      for (const it of r.items) {
        const key = `${it.domain}|${it.title}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(it);
      }
      providers = [...providers, ...r.providers];
      if (r.extractedContent) extMerged.push(...r.extractedContent);
    }
    items = merged;
    providers = [...new Set(providers)];
    extracted = extMerged.length ? extMerged : undefined;
    queryLabel = queries.join(' | ');
  } else {
    // 单 query：默认开 extractContent（snippet 太短影响命中率），除非显式 false
    const wantExtract =
      params.extractContent === undefined ? true : params.extractContent === true;
    const req: DeepSearchRequest = { ...searchRequest, extractContent: wantExtract };
    if (wantExtract) {
      req.maxExtractCount =
        typeof params.maxExtractCount === 'number' && Number.isFinite(params.maxExtractCount)
          ? Math.max(1, Math.floor(params.maxExtractCount))
          : 5;
      req.extractDomains = parseIncludeDomains(params.extractDomains);
    }
    const res = await searchFn(req);
    items = res.items;
    providers = res.providers ?? [];
    extracted = res.extractedContent;
  }

  const slicedRaw = items.slice(0, maxResults);
  const industryLabel = resolveSectorLabel(mergeIndustryParams(next));
  const preferClean = builderName === 'industryTrend';
  const sanitized = sanitizeWebsourceForLlm(
    {
      query: queryLabel,
      depth,
      items: slicedRaw.map((it) => ({
        title: it.title ?? '',
        url: it.url ?? '',
        snippet: it.snippet ?? '',
        domain: it.domain ?? '',
      })),
      providers,
      dimensions: searchRequest.dimensions,
      includeDomains: searchRequest.includeDomains,
      timeRange: searchRequest.timeRange,
      ...(queries.length > 1 ? { queries } : {}),
      ...(extracted && extracted.length > 0
        ? {
            extracted: extracted.slice(0, params.maxExtractCount ?? 5).map((e) => {
              const content =
                typeof (e as { content?: unknown }).content === 'string'
                  ? String((e as { content: string }).content).trim()
                  : '';
              const summaryRaw =
                typeof e.summary === 'string' && e.summary.trim()
                  ? e.summary.trim()
                  : content;
              return {
                url: e.url,
                title: e.title,
                // ContentExtractor 只填 content；下游 evidence 读 summary —— 必须回填
                summary: summaryRaw ? summaryRaw.slice(0, 1200) : undefined,
                keyPoints: e.keyPoints?.slice(0, 6),
                dataPoints: e.dataPoints?.slice(0, 8),
                confidence: e.confidence,
              };
            }),
          }
        : {}),
    },
    industryLabel,
    maxResults,
    {
      resultClean:
        params.resultClean === undefined
          ? preferClean
            ? true
            : false
          : (params.resultClean as boolean | Record<string, unknown> | null),
    }
  );
  const sliced = (sanitized.items ?? []).map((it) => ({
    title: it.title ?? '',
    url: it.url ?? '',
    snippet: it.snippet ?? '',
    domain: it.domain ?? '',
  }));
  const formatted = formatWebSearchBlock(depth, queryLabel, sliced, resultMaxChars);

  const payload: Record<string, unknown> = {
    query: queryLabel,
    depth,
    dimensions: searchRequest.dimensions,
    includeDomains: searchRequest.includeDomains,
    timeRange: searchRequest.timeRange,
    providers,
    hitCount: sliced.length,
    truncated: formatted.truncated || Boolean(sanitized.truncated) || items.length > sliced.length,
    text: formatted.text,
    items: sliced,
    queries: queries.length > 1 ? queries : undefined,
    extracted: sanitized.extracted,
  };

  const topicExtractTextKey = String(params.topicExtractTextKey ?? '').trim();
  if (target === 'sources.websource' && topicExtractTextKey.startsWith('text/')) {
    if (typeof next.userId !== 'string' || !next.userId.trim()) {
      throw new ConfigurationError('webSearch.topicExtractTextKey 需要 userId');
    }
    const { extractTopicChipsViaTextBusiness } = await import('../websearch-topic-extract');
    const p = (next.params as Record<string, unknown>) ?? {};
    const industry = String(p.industry ?? getContract(next)?.basic?.industry ?? '').trim();
    const { dateLabel, ymd } = resolveIndustryDailyDateLabel(p);
    const userLang =
      String(p.language ?? getContract(next)?.basic?.language ?? 'zh').trim() || 'zh';
    const topicExtractMax = clampTopicMaxResults(
      params.topicExtractMax ?? params.maxTopics ?? TOPIC_POOL_DEFAULT
    );
    const extracted = await extractTopicChipsViaTextBusiness({
      textKey: topicExtractTextKey,
      userId: next.userId.trim(),
      industry: industry || '综合',
      dateMode: String(p.date_mode ?? '').trim() || undefined,
      dateLabel,
      ymd,
      language: userLang,
      websource: payload as import('../websearch-topic-extract').WebsourcePayload,
      parentTaskId: next.taskId,
      maxTopics: topicExtractMax,
      maxInputItems: Math.min(sliced.length, 80),
    });
    payload.topicChips = extracted.topics;
    payload.topicSourceMap = extracted.topicSourceMap;
    const nestedUsage = Array.isArray(next.state.pipelineNestedUsage)
      ? [...(next.state.pipelineNestedUsage as unknown[])]
      : [];
    nestedUsage.push({
      nestedTextTaskKey: topicExtractTextKey,
      taskId: extracted.textTaskId,
      purpose: 'webSearch.topicExtract',
      filteredOut: extracted.filteredOut,
    });
    next = { ...next, state: { ...next.state, pipelineNestedUsage: nestedUsage } };
  }

  const evidenceKey = targetToEvidenceKey(target);
  next = putEvidence(next, evidenceKey, payload);
  const pointer = slimWebSearchForContract(payload, evidenceKey);

  const contract = getContract(next)!;
  if (target.startsWith('enrich_search.')) {
    const key = target.slice('enrich_search.'.length);
    next = withContract(next, {
      ...contract,
      enrich_search: {
        ...contract.enrich_search,
        [key]: pointer,
      },
    });
  } else {
    next = withContract(next, {
      ...contract,
      sources: {
        ...contract.sources,
        websource: pointer,
      },
    });
  }
  return next;
}

let registered = false;

export function registerWarpWebSearchStep(): void {
  if (registered) return;
  registered = true;
  const runner = async (ctx: TaskContext, step: PipelineStep) => runWebSearchStep(ctx, step);
  registerInputStep('webSearch', runner);
  registerOutputStep('webSearch', runner);
}

registerWarpWebSearchStep();
