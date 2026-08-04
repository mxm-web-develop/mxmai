/**
 * mxm-warp input：组装合同 + LLM 回填 basic，并按合同写 enrich_search 检索方案
 */
import type { JsonSchemaV2, PipelineStep, TaskContext } from '../types';
import { ConfigurationError } from '../errors';
import {
  assembleZonesFromParams,
  buildBasicFieldGuide,
  partitionContractSchemaFields,
} from './contract-from-schema';
import {
  emptyContract,
  MXM_WARP_CONTRACT_VERSION,
  type MxmWarpContract,
  type MxmWarpEnrichSearch,
} from './contract-types';
import { promoteParamsAssetsToContract } from './promote-assets';

export type WarpLlmFn = (args: {
  system: string;
  user: string;
  ctx: TaskContext;
}) => Promise<string>;

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const t = raw.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1]!.trim() : t;
  try {
    const v = JSON.parse(body) as unknown;
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  } catch {
    /* ignore */
  }
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      const v = JSON.parse(body.slice(start, end + 1)) as unknown;
      if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** enrich 管线含 webSearch 且目标为 enrich_search.result（或默认读 enrich_search.query）时，input 必须写出 query */
export function enrichPipelineNeedsSearchPlan(enrichSteps: PipelineStep[] | undefined): boolean {
  if (!Array.isArray(enrichSteps) || enrichSteps.length === 0) return false;
  return enrichSteps.some((s) => {
    if (String(s.step || '') !== 'webSearch') return false;
    const p = (s.params ?? {}) as Record<string, unknown>;
    const target = String(p.target ?? '').trim();
    const queryFrom = String(p.queryFrom ?? '').trim();
    if (target === 'enrich_search.result') return true;
    if (queryFrom.includes('enrich_search')) return true;
    // 无显式 query/queryTemplate/queryBuilder 时，默认吃 enrich_search
    const hasDirect =
      (typeof p.query === 'string' && p.query.trim()) ||
      (typeof p.queryTemplate === 'string' && p.queryTemplate.trim()) ||
      (typeof p.queryBuilder === 'string' && p.queryBuilder.trim());
    return !hasDirect;
  });
}

function readNonEmptyString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** 从 enrich_search 对象抽出可检索 query（兼容 LLM 常见别名） */
export function coerceEnrichSearchQuery(plan: Record<string, unknown> | null | undefined): string {
  if (!plan || typeof plan !== 'object') return '';
  for (const k of ['query', 'q', 'search', 'search_query', 'topic', 'what', 'keywords']) {
    const s = readNonEmptyString(plan[k]);
    if (s) return s;
  }
  return '';
}

/**
 * LLM 未给出可用 query 时，用已有合同 / params 拼一条可检索方案（保证 enrich.webSearch 不空跑）。
 * 不写死业务中文后缀；日报等业务应在 enrich.webSearch 节点配 queryTemplate。
 *
 * opts.fromFields：按顺序从 basic/params 取值（默认主话题相关字段）
 * opts.suffixTokens：可选附加词（业务在调用侧或节点配置传入）
 */
export function synthesizeEnrichSearchQuery(
  contract: MxmWarpContract,
  params: Record<string, unknown>,
  opts?: {
    fromFields?: string[];
    suffixTokens?: string[];
  }
): string {
  const basic = contract.basic ?? {};
  const fromFields = opts?.fromFields?.length
    ? opts.fromFields
    : ['main_topic', 'core_topic', 'topic', 'industry_custom', 'industry'];

  const parts: string[] = [];
  const seen = new Set<string>();
  for (const field of fromFields) {
    const v =
      readNonEmptyString(basic[field]) || readNonEmptyString(params[field]);
    if (!v || seen.has(v)) continue;
    // 其它/其他行业名无信息量时跳过，等 industry_custom
    if ((field === 'industry' || field === 'industry_custom') && (v === '其他' || v === '其它')) {
      continue;
    }
    seen.add(v);
    parts.push(v);
  }

  const preQ = (() => {
    const ws = contract.sources?.websource;
    if (ws && typeof ws === 'object' && !Array.isArray(ws)) {
      return readNonEmptyString((ws as Record<string, unknown>).query);
    }
    return '';
  })();
  if (parts.length === 0 && preQ) parts.push(preQ);

  for (const tok of opts?.suffixTokens ?? []) {
    const t = String(tok ?? '').trim();
    if (t && !seen.has(t)) {
      seen.add(t);
      parts.push(t);
    }
  }

  if (parts.length === 0) return '';
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

export function ensureEnrichSearchPlan(
  enrich: MxmWarpEnrichSearch,
  contract: MxmWarpContract,
  params: Record<string, unknown>,
  required: boolean
): MxmWarpEnrichSearch {
  const next: MxmWarpEnrichSearch = { ...enrich };
  let query = coerceEnrichSearchQuery(next);
  if (!query) {
    query = synthesizeEnrichSearchQuery(contract, params);
    if (query) {
      next.query = query;
      if (!readNonEmptyString(next.mode)) next.mode = 'standard';
      if (!readNonEmptyString(next.rationale) && !readNonEmptyString(next.reason)) {
        next.rationale = 'fallback: synthesized from basic/sources after input LLM omitted query';
      }
    }
  } else if (!readNonEmptyString(next.query)) {
    next.query = query;
  }
  if (required && !coerceEnrichSearchQuery(next)) {
    throw new ConfigurationError(
      'input：未能生成 enrich_search.query。请根据 basic / sources 给出下一轮深搜查询词。'
    );
  }
  return next;
}

export function getContract(ctx: TaskContext): MxmWarpContract | null {
  const c = ctx.state.contract;
  if (c && typeof c === 'object' && !Array.isArray(c) && (c as MxmWarpContract).meta) {
    return c as MxmWarpContract;
  }
  return null;
}

export function withContract(ctx: TaskContext, contract: MxmWarpContract): TaskContext {
  return { ...ctx, state: { ...ctx.state, contract } };
}

/** 无 LLM：仅从 params 组装分区 */
export function runInputAssembleOnly(
  ctx: TaskContext,
  contractSchema: JsonSchemaV2 | undefined
): TaskContext {
  const prior = getContract(ctx);
  const meta = {
    version: MXM_WARP_CONTRACT_VERSION,
    scope: ctx.scope,
    taskKey: ctx.taskKey,
    subtype: ctx.subtype ?? null,
    taskId: ctx.taskId || '',
    ...(typeof ctx.params.label === 'string' && ctx.params.label.trim()
      ? { label: String(ctx.params.label).trim() }
      : {}),
  };
  const base = prior ?? emptyContract(meta);
  const zones = assembleZonesFromParams(contractSchema, ctx.params, base);
  const sourcesFromParams =
    ctx.params.sources && typeof ctx.params.sources === 'object' && !Array.isArray(ctx.params.sources)
      ? (ctx.params.sources as Record<string, unknown>)
      : null;
  const sources = {
    ...(prior?.sources && typeof prior.sources === 'object' ? { ...prior.sources } : {}),
    ...(sourcesFromParams ?? {}),
  };
  const assets =
    prior?.assets && typeof prior.assets === 'object' ? { ...prior.assets } : {};
  const enrich_search =
    prior?.enrich_search && typeof prior.enrich_search === 'object'
      ? { ...prior.enrich_search }
      : {};

  const contract: MxmWarpContract = {
    ...base,
    meta: { ...base.meta, ...meta, taskId: meta.taskId || base.meta.taskId },
    basic: zones.basic,
    business: zones.business,
    sources,
    assets,
    enrich_search,
  };
  let next = withContract(ctx, contract);
  next = promoteParamsAssetsToContract(next, contractSchema);
  return next;
}

/**
 * input：回填 basic + **必须**（当 enrich 需要）写出 enrich_search.query。
 * 依据：docs/mxm-warp-v2-对齐记录 — input 根据已有合同写顶层 enrich_search。
 */
export async function runInputStage(args: {
  ctx: TaskContext;
  contractSchema: JsonSchemaV2 | undefined;
  llm?: WarpLlmFn;
  /** enrich 含依赖 enrich_search.query 的 webSearch 时为 true */
  requireEnrichSearchPlan?: boolean;
}): Promise<TaskContext> {
  let ctx = runInputAssembleOnly(args.ctx, args.contractSchema);
  const guide = buildBasicFieldGuide(args.contractSchema);
  const requirePlan = args.requireEnrichSearchPlan === true;
  const shouldCallLlm = Boolean(args.llm) && (guide.length > 0 || requirePlan);

  let contract = getContract(ctx)!;

  if (shouldCallLlm && args.llm) {
    const system = [
      'You update a business contract JSON for the next pipeline stages.',
      'Only fill simple "basic" fields the user can answer (topic, style, etc.).',
      'Do NOT role-play. Do NOT invent complex professional "business" fields (those belong to enrich nestedText).',
      requirePlan
        ? [
            'REQUIRED: analyze current_basic + sources (especially sources.websource) and write enrich_search.',
            'enrich_search MUST be an object with a non-empty string field "query" — the exact web search query for a deeper follow-up search.',
            'Also set "mode" to one of: quick | standard | deep when useful; optional "rationale" (short).',
            'query should go beyond the pre hotspot search: focus the chosen topic / gaps / entities needing facts.',
          ].join(' ')
        : 'You may propose enrich_search as { query, mode?, rationale? } when a follow-up web search would help.',
      'Return ONE JSON object with keys: basic (object, optional) and enrich_search (object' +
        (requirePlan ? ', required with query' : ', optional') +
        ').',
      'No markdown fences, no prose.',
    ].join('\n');

    const user = JSON.stringify(
      {
        field_guide: guide,
        current_basic: contract.basic,
        sources: contract.sources,
        current_enrich_search: contract.enrich_search,
        user_params: args.ctx.params,
        require_enrich_search_query: requirePlan,
      },
      null,
      2
    );

    const raw = await args.llm({ system, user, ctx });
    const parsed = parseJsonObject(raw);
    if (parsed) {
      const { basicKeys } = partitionContractSchemaFields(args.contractSchema);
      const nextBasic = { ...contract.basic };
      const incomingBasic =
        parsed.basic && typeof parsed.basic === 'object' && !Array.isArray(parsed.basic)
          ? (parsed.basic as Record<string, unknown>)
          : parsed;
      for (const k of basicKeys) {
        if (Object.prototype.hasOwnProperty.call(incomingBasic, k) && incomingBasic[k] !== undefined) {
          nextBasic[k] = incomingBasic[k];
        }
      }

      let nextEnrich = { ...contract.enrich_search };
      if (
        parsed.enrich_search &&
        typeof parsed.enrich_search === 'object' &&
        !Array.isArray(parsed.enrich_search)
      ) {
        nextEnrich = { ...nextEnrich, ...(parsed.enrich_search as Record<string, unknown>) };
      }

      contract = {
        ...contract,
        basic: nextBasic,
        enrich_search: nextEnrich,
      };
      ctx = withContract(ctx, contract);
    }
  }

  contract = getContract(ctx)!;
  const ensured = ensureEnrichSearchPlan(
    contract.enrich_search,
    { ...contract, basic: contract.basic },
    args.ctx.params,
    requirePlan
  );
  if (ensured !== contract.enrich_search) {
    ctx = withContract(ctx, { ...contract, enrich_search: ensured });
  }
  return ctx;
}
