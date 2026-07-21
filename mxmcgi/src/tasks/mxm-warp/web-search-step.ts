/**
 * mxm-warp 网络检索管线步：查询配在节点上；结果写入合同。
 *
 * params:
 * - query?: string
 * - queryFrom?: string  如 params.topic / contract.basic.topic / contract.enrich_search.query
 * - target?: 'sources.websource' | 'enrich_search.result'  （默认 sources.websource）
 * - depth?: quick|standard|deep
 * - maxResults?: number
 * - resultMaxChars?: number  结果文本长度上限（节点级）
 */
import type { PipelineStep, TaskContext } from '../types';
import { ConfigurationError } from '../errors';
import { SearchService } from '../../core/search/search-service';
import { listUsableSearchProviderNames } from '../../core/search/search-config';
import type { SearchDepth, SearchResultItem } from '../../core/search/types';
import { getContract, withContract } from './input-stage';
import { emptyContract, MXM_WARP_CONTRACT_VERSION } from './contract-types';
import { registerInputStep, registerOutputStep } from '../pipeline-registry';

const DEFAULT_RESULT_MAX_CHARS = 2500;
const SEARCH_DEPTHS = new Set<SearchDepth>(['quick', 'standard', 'deep']);
const SEARCH_DEPTH_LABELS: Record<SearchDepth, string> = {
  quick: '快速',
  standard: '标准',
  deep: '深度',
};

export type WebSearchTarget = 'sources.websource' | 'enrich_search.result';

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

export function resolveWebSearchQuery(ctx: TaskContext, step: PipelineStep): string {
  const params = (step.params ?? {}) as Record<string, unknown>;
  const direct = typeof params.query === 'string' ? params.query.trim() : '';
  if (direct) return direct;

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

export function resolveWebSearchTarget(step: PipelineStep): WebSearchTarget {
  const t = String((step.params as Record<string, unknown> | undefined)?.target ?? '').trim();
  if (t === 'enrich_search.result') return 'enrich_search.result';
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
  search?: (args: {
    query: string;
    depth: SearchDepth;
  }) => Promise<{
    items: Array<{ title?: string; url?: string; snippet?: string; domain?: string }>;
    providers: string[];
  }>;
};

async function defaultSearch(args: {
  query: string;
  depth: SearchDepth;
}): Promise<{
  items: Array<{ title?: string; url?: string; snippet?: string; domain?: string }>;
  providers: string[];
}> {
  const usable = await listUsableSearchProviderNames();
  if (usable.length === 0) {
    throw new ConfigurationError(
      'webSearch：当前无可用搜索引擎，请在 Admin 搜索配置中启用至少一个信息源'
    );
  }
  const searchService = new SearchService();
  const autoResult = await searchService.autoSearch({
    query: args.query,
    depth: args.depth,
  });
  const providers = [
    ...new Set(
      Object.values(autoResult.dimensionResults)
        .map((r) => r?.provider)
        .filter((p): p is string => typeof p === 'string' && p.length > 0)
    ),
  ];
  return {
    items: autoResult.aggregated ?? [],
    providers,
  };
}

/** 可测入口：写入合同 sources.websource 或 enrich_search.result */
export async function runWebSearchStep(
  ctx: TaskContext,
  step: PipelineStep,
  deps?: WebSearchRunDeps
): Promise<TaskContext> {
  let next = ensureContract(ctx);
  const params = (step.params ?? {}) as Record<string, unknown>;
  const query = resolveWebSearchQuery(next, step);
  if (!query) {
    throw new ConfigurationError(
      'webSearch：缺少查询。请在节点配置 query，或 queryFrom（如 params.topic / contract.enrich_search.query）'
    );
  }

  const depthRaw = typeof params.depth === 'string' ? params.depth.trim() : 'standard';
  const depth: SearchDepth = SEARCH_DEPTHS.has(depthRaw as SearchDepth)
    ? (depthRaw as SearchDepth)
    : 'standard';
  const maxResults =
    typeof params.maxResults === 'number' && Number.isFinite(params.maxResults)
      ? Math.max(1, Math.min(30, Math.floor(params.maxResults)))
      : 8;
  const resultMaxChars =
    typeof params.resultMaxChars === 'number' && Number.isFinite(params.resultMaxChars)
      ? Math.max(200, Math.floor(params.resultMaxChars))
      : DEFAULT_RESULT_MAX_CHARS;

  const searchFn = deps?.search ?? defaultSearch;
  const { items, providers } = await searchFn({ query, depth });
  const sliced = items.slice(0, maxResults);
  const formatted = formatWebSearchBlock(depth, query, sliced, resultMaxChars);

  const payload = {
    query,
    depth,
    providers,
    hitCount: formatted.hitCount,
    truncated: formatted.truncated,
    text: formatted.text,
    items: sliced.map((it) => ({
      title: it.title ?? '',
      url: it.url ?? '',
      snippet: it.snippet ?? '',
      domain: it.domain ?? '',
    })),
  };

  const contract = getContract(next)!;
  const target = resolveWebSearchTarget(step);
  if (target === 'enrich_search.result') {
    next = withContract(next, {
      ...contract,
      enrich_search: {
        ...contract.enrich_search,
        result: payload,
      },
    });
  } else {
    next = withContract(next, {
      ...contract,
      sources: {
        ...contract.sources,
        websource: payload,
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

// 模块加载即注册，避免与 business-pipeline-steps 形成循环依赖
registerWarpWebSearchStep();
