/**
 * mxm-warp input：组装合同 +（可选）LLM 简单回填 basic / enrich_search 方案
 */
import type { JsonSchemaV2, TaskContext } from '../types';
import {
  assembleZonesFromParams,
  buildBasicFieldGuide,
  partitionContractSchemaFields,
} from './contract-from-schema';
import {
  emptyContract,
  MXM_WARP_CONTRACT_VERSION,
  type MxmWarpContract,
} from './contract-types';

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
  const sources =
    prior?.sources && typeof prior.sources === 'object'
      ? { ...prior.sources }
      : {};
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
  return withContract(ctx, contract);
}

/**
 * input LLM：只回填 basic（及可选 enrich_search 方案），禁止扮演角色写长文。
 */
export async function runInputStage(args: {
  ctx: TaskContext;
  contractSchema: JsonSchemaV2 | undefined;
  llm?: WarpLlmFn;
}): Promise<TaskContext> {
  let ctx = runInputAssembleOnly(args.ctx, args.contractSchema);
  const guide = buildBasicFieldGuide(args.contractSchema);
  if (!args.llm || guide.length === 0) {
    return ctx;
  }

  const contract = getContract(ctx)!;
  const system = [
    'You fill a business contract JSON. Only fill simple "basic" fields the user can answer.',
    'Do NOT role-play. Do NOT invent complex professional fields (those belong to enrich).',
    'You may also propose enrich_search as a small object: search method + what to search next.',
    'Return ONE JSON object with optional keys: basic (object), enrich_search (object).',
    'No markdown fences, no prose.',
  ].join('\n');

  const user = JSON.stringify(
    {
      field_guide: guide,
      current_basic: contract.basic,
      sources: contract.sources,
      user_params: args.ctx.params,
    },
    null,
    2
  );

  const raw = await args.llm({ system, user, ctx });
  const parsed = parseJsonObject(raw);
  if (!parsed) return ctx;

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
  if (parsed.enrich_search && typeof parsed.enrich_search === 'object' && !Array.isArray(parsed.enrich_search)) {
    nextEnrich = { ...nextEnrich, ...(parsed.enrich_search as Record<string, unknown>) };
  }

  return withContract(ctx, {
    ...contract,
    basic: nextBasic,
    enrich_search: nextEnrich,
  });
}
