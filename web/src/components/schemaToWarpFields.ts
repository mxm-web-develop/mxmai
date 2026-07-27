/**
 * 将 Task formSchema.properties 转为分步引导字段（废弃长表单一屏渲染）
 */
import type { WarpGateField } from './WarpGateWizard';
import { userFacingCopy } from '../lib/uiCopyHygiene';

const SKIP_KEYS = new Set(['parallel_count', 'metadata', 'uid']);

const INLINE_SUPPLEMENT = new Set([
  'style_custom',
  'analysis_stance',
  'article_structure_custom',
  'industry_custom',
  'writing_folder_id',
  'report_date',
]);

export type JsonSchemaLike = {
  properties?: Record<string, Record<string, unknown>>;
  required?: string[];
  [k: string]: unknown;
};

function isInlineSupplement(name: string, prop: Record<string, unknown>): boolean {
  if (INLINE_SUPPLEMENT.has(name)) return true;
  if (prop['x-ui-type'] === 'folderCard') return true;
  if (prop['x-show-when'] != null || prop['x-hide-when'] != null) return true;
  if (prop['x-guided-inline'] === true || prop['x-guided-hidden'] === true) return true;
  return false;
}

function propToField(
  name: string,
  prop: Record<string, unknown>,
  requiredSet: Set<string>
): WarpGateField {
  const xUiType = typeof prop['x-ui-type'] === 'string' ? prop['x-ui-type'] : undefined;
  const isScale = xUiType === 'scale';
  const enumVals = Array.isArray(prop.enum) ? prop.enum.map(String) : undefined;
  const xUi = prop['x-ui'];
  let minimum = typeof prop.minimum === 'number' ? prop.minimum : undefined;
  let maximum = typeof prop.maximum === 'number' ? prop.maximum : undefined;
  if (isScale && (minimum == null || maximum == null) && enumVals?.length) {
    const nums = enumVals.map(Number).filter((n) => Number.isFinite(n));
    if (nums.length) {
      minimum = minimum ?? Math.min(...nums);
      maximum = maximum ?? Math.max(...nums);
    }
  }
  return {
    name,
    type: typeof prop.type === 'string' ? prop.type : 'string',
    title: userFacingCopy(
      typeof prop.title === 'string' ? prop.title : name,
      name
    ),
    description: userFacingCopy(
      typeof prop.description === 'string' ? prop.description : ''
    ) || undefined,
    enum: isScale ? undefined : enumVals,
    required: requiredSet.has(name) || prop.required === true,
    default:
      typeof prop.default === 'string' || typeof prop.default === 'number'
        ? String(prop.default)
        : undefined,
    'x-ui':
      typeof xUi === 'string'
        ? xUi
        : name === 'core_topic'
          ? 'topic-chips'
          : name === 'main_topic'
            ? 'main-topic'
            : undefined,
    'x-ui-type': xUiType,
    minimum,
    maximum,
    'x-enum-labels': Array.isArray(prop['x-enum-labels'])
      ? prop['x-enum-labels'].map(String)
      : undefined,
  };
}

/** schema → 有序 Warp 字段（跳过内部补充 / 挂卡字段） */
export function schemaToWarpFields(schema: JsonSchemaLike | null | undefined): WarpGateField[] {
  const props = schema?.properties ?? {};
  const requiredSet = new Set((schema?.required ?? []).map(String));
  const out: WarpGateField[] = [];
  for (const [name, prop] of Object.entries(props)) {
    if (SKIP_KEYS.has(name)) continue;
    if (!prop || typeof prop !== 'object') continue;
    if (isInlineSupplement(name, prop)) continue;
    if (prop['x-hidden'] === true) continue;
    out.push(propToField(name, prop, requiredSet));
  }
  return out;
}
