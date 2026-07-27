/**
 * Task V2 平台级表单字段（自动注入各业务 formSchema，无需逐 bundle 维护）
 */
import type { JsonSchemaV2, TaskScope } from './types';

export const PARALLEL_COUNT_KEY = 'parallel_count';
export const PARALLEL_COUNT_MIN = 1;
export const PARALLEL_COUNT_MAX = 99;

const PARALLEL_COUNT_PROPERTY: Record<string, unknown> = {
  type: 'integer',
  title: '生成份数',
  description: `一次提交生成几份独立结果（${PARALLEL_COUNT_MIN}～${PARALLEL_COUNT_MAX}），每份内容须有差异。`,
  minimum: PARALLEL_COUNT_MIN,
  maximum: PARALLEL_COUNT_MAX,
  default: 1,
  'x-ui-order': -100,
};

/** text 业务不提供多份并发 */
export function scopeSupportsParallelCount(scope: TaskScope | string): boolean {
  return scope !== 'text';
}

export function extractParallelCount(params: Record<string, unknown> | undefined): number {
  if (!params) return 1;
  const raw = params[PARALLEL_COUNT_KEY];
  let n = 1;
  if (typeof raw === 'number' && Number.isFinite(raw)) n = Math.floor(raw);
  else if (typeof raw === 'string' && raw.trim()) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) n = Math.floor(parsed);
  }
  return Math.min(PARALLEL_COUNT_MAX, Math.max(PARALLEL_COUNT_MIN, n));
}

export function stripPlatformFields(params: Record<string, unknown>): Record<string, unknown> {
  const next = { ...params };
  delete next[PARALLEL_COUNT_KEY];
  return next;
}

export function mergePlatformFieldsIntoFormSchema(
  schema: JsonSchemaV2,
  scope: TaskScope | string
): JsonSchemaV2 {
  if (!scopeSupportsParallelCount(scope)) {
    return schema;
  }
  const base = { ...schema } as JsonSchemaV2;
  const props = { ...((base.properties ?? {}) as Record<string, unknown>) };
  if (!Object.prototype.hasOwnProperty.call(props, PARALLEL_COUNT_KEY)) {
    props[PARALLEL_COUNT_KEY] = { ...PARALLEL_COUNT_PROPERTY };
  }
  base.properties = props as JsonSchemaV2['properties'];
  return base;
}

export function mergePlatformFieldsIntoTemplateFormSchema(
  template: { formSchema: JsonSchemaV2 },
  scope: TaskScope | string
): void {
  template.formSchema = mergePlatformFieldsIntoFormSchema(template.formSchema, scope);
}
