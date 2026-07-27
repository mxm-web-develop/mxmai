/**
 * 多份并发生成：各份共享同一套生产参数（场景/参考图/宫格/画幅等），
 * 组间差异仅通过 prompt 变体句 + parallel_index/parallel_total 模板变量拉开。
 */
import type { JsonSchemaV2 } from './types';
import { stripPlatformFields } from './platform-fields';

export type ParallelBatchContext = {
  parentTaskId: string;
  parallelIndex: number;
  parallelTotal: number;
};

export function buildParallelVariationSuffix(parallelIndex: number, parallelTotal: number): string {
  return (
    `[Generation set ${parallelIndex + 1}/${parallelTotal}: distinct composition, pose, framing, and camera; ` +
    `must not duplicate other sets in this batch. ` +
    `WARDROBE LOCK: keep the exact same garments, colors, and fabric as clothing reference images; do not change outfit or SKU across sets.]`
  );
}

function cloneParamsRecord(params: Record<string, unknown>): Record<string, unknown> {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(params);
  }
  return JSON.parse(JSON.stringify(params)) as Record<string, unknown>;
}

/**
 * 为第 parallelIndex 份子任务生成差异化 params（已剔除 parallel_count）
 */
export function allocateVariationParams(args: {
  formSchema: JsonSchemaV2;
  baseParams: Record<string, unknown>;
  parallelIndex: number;
  parallelTotal: number;
}): Record<string, unknown> {
  const { formSchema, parallelIndex, parallelTotal } = args;
  const params = stripPlatformFields(cloneParamsRecord(args.baseParams));
  const props = (formSchema.properties ?? {}) as Record<string, Record<string, unknown>>;

  const suffix = buildParallelVariationSuffix(parallelIndex, parallelTotal);
  if (typeof params.prompt === 'string') {
    const base = params.prompt.trim();
    params.prompt = base ? `${base}\n\n${suffix}` : suffix;
  } else if ('prompt' in props) {
    params.prompt = suffix;
  }

  return params;
}

export function parallelContextVars(ctx: ParallelBatchContext): Record<string, unknown> {
  return {
    parallel_index: ctx.parallelIndex + 1,
    parallel_total: ctx.parallelTotal,
    parent_task_id: ctx.parentTaskId,
  };
}
