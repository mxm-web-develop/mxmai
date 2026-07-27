/**
 * 多份并发：批次级 params 预处理（各子任务共享同一份生产参数，仅 prompt 变体句不同）
 */
import type { JsonSchemaV2, TaskScope } from './types';
import { validateWithJsonSchema } from './schema-validator';
import { normalizeParamsBeforeSchemaValidate } from './form-param-normalize';
import {
  applyFormSchemaDefaults,
  cloneFormSchemaWithReferenceImageEnrichment,
  mergeGraphReferenceImageFromFormSlots,
  hydrateGraphImageSlotParamsFromReferenceImage,
  prepareGraphTaskParams,
} from './graph-reference-slots';
import { prepareVideoTaskParams, cloneVideoFormSchemaWithReferenceEnrichment } from '../core/video/video-reference-slots';

function cloneParams(params: Record<string, unknown>): Record<string, unknown> {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(params);
  }
  return JSON.parse(JSON.stringify(params)) as Record<string, unknown>;
}

/**
 * 在拆分多份子任务前，统一补默认值、合并参考图槽位并校验一次。
 */
export function prepareParallelBatchBaseParams(args: {
  scope: TaskScope;
  taskKey: string;
  subtype?: string | null;
  params: Record<string, unknown>;
  /** 开放 API 入参校验用发布快照；缺省则用完整 formSchema */
  formSchema: JsonSchemaV2;
  /** 完整 Task formSchema：补 x-user-visible:false 等隐藏字段默认值 */
  templateFormSchema?: JsonSchemaV2;
}): Record<string, unknown> {
  const { scope, taskKey, subtype, formSchema, templateFormSchema } = args;
  let base = cloneParams(args.params);

  if (scope === 'graph') {
    base = prepareGraphTaskParams(base, formSchema, { taskKey, subtype: subtype ?? null });
  } else if (scope === 'video') {
    base = prepareVideoTaskParams(base, formSchema, { taskKey, subtype: subtype ?? null });
  } else {
    applyFormSchemaDefaults(base as Record<string, any>, formSchema);
    base = normalizeParamsBeforeSchemaValidate(formSchema, base);
    const props = ((formSchema.properties ?? {}) as Record<string, any>) ?? {};
    const hasRefSlots = Object.values(props).some(
      (sch) => sch && typeof sch === 'object' && sch['x-ui-type'] === 'referenceImages'
    );
    if (hasRefSlots) {
      const p = base as Record<string, any>;
      mergeGraphReferenceImageFromFormSlots(p, formSchema);
      hydrateGraphImageSlotParamsFromReferenceImage(p, formSchema);
      mergeGraphReferenceImageFromFormSlots(p, formSchema);
      applyFormSchemaDefaults(p, formSchema);
    }
  }

  if (templateFormSchema && templateFormSchema !== formSchema) {
    applyFormSchemaDefaults(base as Record<string, any>, templateFormSchema);
  }

  validateWithJsonSchema(
    scope === 'video'
      ? cloneVideoFormSchemaWithReferenceEnrichment(formSchema)
      : cloneFormSchemaWithReferenceImageEnrichment(formSchema),
    base,
  );
  return base;
}
