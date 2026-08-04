/**
 * 将 Task formSchema.properties 转为分步引导字段（废弃长表单一屏渲染）
 */
import type { WarpGateField } from './WarpGateWizard';
import type { AppLocale } from '../i18n/appLocale';
import { userFacingCopy } from '../lib/uiCopyHygiene';
import {
  isSeekGenreFieldName,
  isSeekVoiceFieldName,
  seekGenreEnumForLocale,
  seekVoiceEnumForLocale,
} from '../lib/seekVoicePresets';

const SKIP_KEYS = new Set([
  'parallel_count',
  'metadata',
  'uid',
  'voice_id',
  'speed',
  'character_folder_id',
]);

const INLINE_SUPPLEMENT = new Set([
  'style_custom',
  'analysis_stance',
  'article_structure_custom',
  'industry_custom',
  'writing_folder_id',
  'report_date',
  'purpose',
  'topic_source',
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
  if (prop['x-user-visible'] === false) return true;
  if (prop['x-guided-inline'] === true || prop['x-guided-hidden'] === true) return true;
  return false;
}

function resolvePropEnum(prop: Record<string, unknown>): string[] | undefined {
  if (Array.isArray(prop.enum) && prop.enum.length) return prop.enum.map(String);
  const items = prop.items;
  if (items && typeof items === 'object' && !Array.isArray(items)) {
    const ie = (items as Record<string, unknown>).enum;
    if (Array.isArray(ie) && ie.length) return ie.map(String);
  }
  return undefined;
}

function enrichSeekLocaleField(field: WarpGateField, locale: AppLocale): WarpGateField {
  if (isSeekVoiceFieldName(field.name)) {
    const pack = seekVoiceEnumForLocale(locale);
    const ids = field.enum?.length ? field.enum : pack.enum;
    const labelById = new Map(pack.enum.map((id, i) => [id, pack.labels[i] || id]));
    return {
      ...field,
      type: 'array',
      enum: ids,
      'x-enum-labels': ids.map((id) => labelById.get(id) || id),
      'x-ui': field['x-ui'] || 'multi-chips',
      'x-ui-type': field['x-ui-type'] || 'chips',
      minItems: field.minItems ?? 1,
      maxItems: field.maxItems ?? 8,
    };
  }
  if (isSeekGenreFieldName(field.name)) {
    const pack = seekGenreEnumForLocale(locale);
    const ids = field.enum?.length ? field.enum : pack.enum;
    const labelById = new Map(pack.enum.map((id, i) => [id, pack.labels[i] || id]));
    return {
      ...field,
      enum: ids,
      'x-enum-labels': ids.map((id) => labelById.get(id) || id),
    };
  }
  return field;
}

function propToField(
  name: string,
  prop: Record<string, unknown>,
  requiredSet: Set<string>,
  locale?: AppLocale
): WarpGateField {
  const xUiType = typeof prop['x-ui-type'] === 'string' ? prop['x-ui-type'] : undefined;
  const isScale = xUiType === 'scale';
  const enumVals = resolvePropEnum(prop);
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
  const isArray = prop.type === 'array' || isSeekVoiceFieldName(name);
  const defaultArr = Array.isArray(prop.default)
    ? prop.default.map(String).filter(Boolean)
    : undefined;
  const field: WarpGateField = {
    name,
    type: isArray ? 'array' : typeof prop.type === 'string' ? prop.type : 'string',
    title: userFacingCopy(
      typeof prop.title === 'string' ? prop.title : name,
      name === 'voice_ids' ? '文风' : name
    ),
    description:
      userFacingCopy(
        typeof prop.description === 'string' ? prop.description : '',
        name === 'voice_ids'
          ? '按语言分组点选一种或多种文风；份数等于所选数量'
          : undefined
      ) || undefined,
    enum: isScale ? undefined : enumVals,
    required: requiredSet.has(name) || prop.required === true,
    default:
      defaultArr
        ? undefined
        : typeof prop.default === 'string' || typeof prop.default === 'number'
          ? String(prop.default)
          : undefined,
    defaultArray: defaultArr,
    'x-ui':
      typeof xUi === 'string'
        ? xUi
        : isSeekVoiceFieldName(name)
          ? 'multi-chips'
          : name === 'core_topic'
            ? 'topic-chips'
            : name === 'main_topic'
              ? 'main-topic'
              : undefined,
    'x-ui-type': xUiType,
    minimum,
    maximum,
    minItems: typeof prop.minItems === 'number' ? prop.minItems : undefined,
    maxItems: typeof prop.maxItems === 'number' ? prop.maxItems : undefined,
    'x-enum-labels': Array.isArray(prop['x-enum-labels'])
      ? prop['x-enum-labels'].map(String)
      : undefined,
  };
  return locale ? enrichSeekLocaleField(field, locale) : field;
}

/** schema → 有序 Warp 字段（跳过内部补充 / 挂卡字段） */
export function schemaToWarpFields(
  schema: JsonSchemaLike | null | undefined,
  locale?: AppLocale
): WarpGateField[] {
  const props = schema?.properties ?? {};
  const requiredSet = new Set((schema?.required ?? []).map(String));
  const out: WarpGateField[] = [];
  for (const [name, prop] of Object.entries(props)) {
    if (SKIP_KEYS.has(name)) continue;
    if (!prop || typeof prop !== 'object') continue;
    if (isInlineSupplement(name, prop)) continue;
    if (prop['x-hidden'] === true) continue;
    out.push(propToField(name, prop, requiredSet, locale));
  }
  return out;
}
