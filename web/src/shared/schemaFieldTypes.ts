/**
 * Task V2 / Admin 业务表单字段类型 — Smartflow start.input[] 与 formSchema 共用
 */
import type { JsonSchema } from '../pages/AdminBusiness.types';
import { schemaPropsToFieldRows, schemaTypeToUiType } from '../pages/AdminBusiness.utils';

export const SCHEMA_FIELD_TYPE_OPTIONS = [
  { value: 'text', label: 'text（多行）' },
  { value: 'string', label: 'string（单行）' },
  { value: 'number', label: 'number（数字）' },
  { value: 'boolean', label: 'boolean（开关）' },
  { value: 'selection', label: 'selection（下拉单选）' },
  { value: 'multiSelection', label: 'multiSelection（多选数组）' },
  { value: 'checkboxGroup', label: 'checkboxGroup（分组多选框）' },
  { value: 'referenceImages', label: 'referenceImages（参考图）' },
  { value: 'image', label: 'image（图片上传，兼容旧字段）' },
  { value: 'imageUpload', label: 'imageUpload（图片上传）' },
  { value: 'fileUpload', label: 'fileUpload（通用文件上传）' },
  { value: 'audioUpload', label: 'audioUpload（音频上传）' },
  { value: 'documentUpload', label: 'documentUpload（文档上传）' },
  { value: 'eshopGarmentBatch', label: 'eshopGarmentBatch（服装 SKU 批量）' },
  { value: 'gridStoryboardImages', label: 'gridStoryboardImages（宫格分镜图）' },
  { value: 'kbRecall', label: 'kbRecall（知识库夹召回·旧，将废弃）' },
  { value: 'mxmKbInput', label: 'mxmKbInput（@知识库知识）' },
  { value: 'textFileOrPaste', label: 'textFileOrPaste（粘贴 / 文件 / 知识库）' },
  { value: 'minimaxVoice', label: 'minimaxVoice（MiniMax 音色选择/克隆）' },
  { value: 'webSearch', label: 'webSearch（联网检索）' },
  { value: 'domainSearch', label: 'domainSearch（专业数据源检索）' },
  { value: 'colorPicker', label: 'colorPicker（颜色拾取器）' },
  { value: 'json', label: 'json（自由对象，仅用于无 x-ui-type 的 object）' },
] as const;

/** 内部/派生字段，不同步进 start.input[] */
export const START_INPUT_SKIP_FIELDS = new Set(['_planning_images']);

export type SchemaFieldUiType = (typeof SCHEMA_FIELD_TYPE_OPTIONS)[number]['value'];

export type StartInputRow = {
  name?: string;
  type?: string;
  content?: unknown;
};

/** legacy：画布/DB 里 type=json 表示 object */
export function normalizeStartInputType(type: string | undefined): string {
  const t = String(type || 'string').trim();
  if (t === 'json') return 'json';
  const known = SCHEMA_FIELD_TYPE_OPTIONS.some((o) => o.value === t);
  return known ? t : 'string';
}

export function defaultContentForStartInputType(type: string): unknown {
  const t = normalizeStartInputType(type);
  switch (t) {
    case 'json':
      return {};
    case 'number':
      return 1;
    case 'boolean':
      return false;
    case 'referenceImages':
    case 'multiSelection':
    case 'checkboxGroup':
    case 'eshopGarmentBatch':
      return [];
    case 'gridStoryboardImages':
      return {
        enabled: false,
        layout: '3x3',
        source_image: null,
        cells: [],
        first_frame_index: 0,
        last_frame_index: null,
      };
    case 'kbRecall':
      return { folderId: '', query: '' };
    case 'mxmKbInput':
      return { text: '', mentions: [] };
    case 'textFileOrPaste':
      return { mode: 'paste', text: '' };
    case 'minimaxVoice':
      return { mode: 'system', voice_id: 'female-shaonv', label: '少女音色' };
    case 'webSearch':
      return { searchDepth: 'standard', query: '' };
    case 'domainSearch':
      return { searchDepth: 'standard', domain: 'auto', query: '' };
    case 'colorPicker':
      return '#002FA7';
    case 'text':
    case 'string':
    case 'selection':
    case 'image':
    case 'imageUpload':
    case 'fileUpload':
    case 'audioUpload':
    case 'documentUpload':
      return '';
    default:
      return '';
  }
}

export function formSchemaPropertyToStartInputType(prop: Record<string, unknown>): string {
  const xUi = String(prop['x-ui-type'] ?? '');
  if (xUi === 'checkboxGroup') return 'checkboxGroup';
  if (xUi === 'eshopGarmentBatch') return 'eshopGarmentBatch';
  if (xUi === 'gridStoryboardImages') return 'gridStoryboardImages';
  if (xUi === 'kbRecall') return 'kbRecall';
  if (xUi === 'mxmKbInput') return 'mxmKbInput';
  if (xUi === 'textFileOrPaste') return 'textFileOrPaste';
  if (xUi === 'minimaxVoice') return 'minimaxVoice';
  if (xUi === 'webSearch') return 'webSearch';
  if (xUi === 'domainSearch') return 'domainSearch';
  if (xUi === 'colorPicker') return 'colorPicker';
  if (
    xUi === 'image' ||
    xUi === 'imageUpload' ||
    xUi === 'fileUpload' ||
    xUi === 'audioUpload' ||
    xUi === 'documentUpload'
  ) {
    return xUi;
  }
  if (xUi === 'switch') return 'boolean';
  const mapped = schemaTypeToUiType(prop);
  if (mapped === 'boolean' || mapped === 'number' || mapped === 'referenceImages') return mapped;
  if (mapped === 'multiSelection' || mapped === 'selection' || mapped === 'text') return mapped;
  if (String(prop.type) === 'object' && !xUi) return 'json';
  if (String(prop.type) === 'array') {
    if (xUi === 'referenceImages' || xUi === 'eshopGarmentBatch' || xUi === 'multiSelection' || xUi === 'checkboxGroup') {
      return String(xUi);
    }
  }
  if (String(prop.type) === 'integer') return 'number';
  return mapped || 'string';
}

function defaultContentFromFieldRow(row: {
  type: string;
  defaultText: string;
}): unknown {
  const t = normalizeStartInputType(row.type);
  const dt = String(row.defaultText ?? '').trim();
  if (dt === '') return defaultContentForStartInputType(t);
  if (t === 'json' || t === 'referenceImages' || t === 'multiSelection' || t === 'checkboxGroup' || t === 'eshopGarmentBatch') {
    try {
      return JSON.parse(dt);
    } catch {
      return defaultContentForStartInputType(t);
    }
  }
  if (t === 'number') {
    const n = Number(dt);
    return Number.isFinite(n) ? n : defaultContentForStartInputType(t);
  }
  if (t === 'boolean') {
    return ['true', '1', 'yes'].includes(dt.toLowerCase());
  }
  return dt;
}

/** 从 start.formSchema 生成 input[]（与 Admin 字段类型一致） */
export function syncStartInputFromFormSchema(formSchema: JsonSchema | undefined): StartInputRow[] {
  if (!formSchema?.properties || typeof formSchema.properties !== 'object') {
    return [];
  }
  const rows = schemaPropsToFieldRows(formSchema);
  return rows
    .filter((r) => String(r.name || '').trim())
    .filter((r) => !START_INPUT_SKIP_FIELDS.has(r.name))
    .map((r) => ({
      name: r.name,
      type: normalizeStartInputType(r.type),
      content: defaultContentFromFieldRow(r),
    }));
}
