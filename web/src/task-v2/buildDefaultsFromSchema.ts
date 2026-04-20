import type { TaskFormConfig } from '../api/client';
import type { SchemaFormValue } from '../components/SchemaForm';

export type BuildDefaultsOptions = {
  /** 当 schema 含 `uid` 字段且 default 未给出时，用于生成（默认 `task_${Date.now()}`） */
  fallbackUid?: () => string;
};

/**
 * 从 Admin `formSchema` 提取 `properties.*.default`（含隐藏字段），供 Task v2 提交与 prompt 插值。
 * 若 schema 定义了 `uid` 且仍无值，则使用 `fallbackUid`。
 */
export function buildDefaultsFromSchema(
  schema: TaskFormConfig['schema'] | null | undefined,
  opts?: BuildDefaultsOptions
): SchemaFormValue {
  const out: SchemaFormValue = {};
  const props = schema?.properties;
  if (!props || typeof props !== 'object') return out;
  for (const [k, defRaw] of Object.entries(props)) {
    const def = defRaw && typeof defRaw === 'object' ? (defRaw as Record<string, unknown>) : {};
    if (def.default !== undefined) out[k] = def.default;
  }
  if (Object.prototype.hasOwnProperty.call(props, 'uid') && out.uid === undefined) {
    out.uid = (opts?.fallbackUid ?? (() => `task_${Date.now()}`))();
  }
  return out;
}
