import type { JsonSchemaV2 } from '../tasks/types';
import { buildPublishedInputSchema } from '../open-api/schema-builder';
import type {
  AgentCatalogFieldSummary,
  AgentCatalogReferenceImageSlot,
} from './catalog-types';

const REF_IMAGE_PLACEHOLDER_URL = 'https://example.com/uploaded-image.jpg';

/** 常见槽位字段名 → Agent 短提示（form-config 无 x-agent-hint 时的兜底） */
const SLOT_AGENT_HINTS: Record<string, string> = {
  model_images: '模特/人物照片放此槽；禁止把服装 SKU 图放这里',
  garment_images: '服装 SKU 平铺/挂拍图放此槽；禁止把模特照片放这里',
  clothing_images: '同 garment_images（旧字段名）；服装 SKU 图，非模特图',
  product_images: '商品 SKU 参考图（静物/产品本体）',
  style_images: '风格/色调/构图参考（仅美学，非 SKU 款式）',
  environment_images: '场景/背景环境参考',
  reference_images: '通用参考图',
};

function readItemTypeDefault(prop: Record<string, unknown>): string | undefined {
  const items = prop.items;
  if (!items || typeof items !== 'object' || Array.isArray(items)) return undefined;
  const typeProp = (items as { properties?: { type?: { default?: unknown } } }).properties?.type;
  const d = typeProp?.default;
  return typeof d === 'string' && d.trim() ? d.trim() : undefined;
}

function buildAgentHint(field: string, prop: Record<string, unknown>): string | undefined {
  const explicit = prop['x-agent-hint'];
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();

  const title = typeof prop.title === 'string' ? prop.title.trim() : '';
  if (title && title.length <= 80) return title;

  const desc = typeof prop.description === 'string' ? prop.description.trim() : '';
  if (desc) {
    const first = desc.split(/[。.\n]/)[0]?.trim();
    if (first && first.length <= 120) return first;
  }

  return SLOT_AGENT_HINTS[field];
}

function sampleReferenceImageItem(itemTypeDefault?: string): Record<string, string> {
  return {
    content: REF_IMAGE_PLACEHOLDER_URL,
    type: itemTypeDefault || 'main-subject',
  };
}

function samplePropertyValue(prop: Record<string, unknown>, field: string): unknown {
  if (prop.default !== undefined) return prop.default;
  if (Array.isArray(prop.enum) && prop.enum.length > 0) return prop.enum[0];

  const uiType = prop['x-ui-type'];
  if (uiType === 'referenceImages') {
    const itemType = readItemTypeDefault(prop);
    const min = typeof prop.minItems === 'number' ? prop.minItems : 0;
    const count = Math.max(min, 1);
    return Array.from({ length: count }, () => sampleReferenceImageItem(itemType));
  }
  if (uiType === 'eshopGarmentBatch') {
    return [
      {
        label: 'SKU-1',
        images: [sampleReferenceImageItem('outfits')],
      },
    ];
  }

  if (prop.type === 'array') return [];
  if (prop.type === 'boolean') return false;
  if (prop.type === 'number' || prop.type === 'integer') {
    if (typeof prop.minimum === 'number') return prop.minimum;
    return 0;
  }
  if (prop.type === 'object') return {};
  if (field === 'prompt') return '用户补充说明示例';
  return '';
}

export function buildParamsExample(
  props: Record<string, Record<string, unknown>>,
  required: string[]
): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  const keys = required.length > 0 ? required : Object.keys(props);

  for (const key of keys) {
    const prop = props[key];
    if (!prop) {
      params[key] = '';
      continue;
    }
    params[key] = samplePropertyValue(prop, key);
  }

  for (const [key, prop] of Object.entries(props)) {
    if (Object.prototype.hasOwnProperty.call(params, key)) continue;
    if (prop['x-ui-type'] === 'referenceImages') {
      params[key] = samplePropertyValue(prop, key);
    } else if (prop.default !== undefined) {
      params[key] = prop.default;
    }
  }

  return params;
}

export function buildReferenceImageSlots(
  props: Record<string, Record<string, unknown>>,
  requiredSet: Set<string>
): AgentCatalogReferenceImageSlot[] {
  const slots: AgentCatalogReferenceImageSlot[] = [];

  for (const [field, prop] of Object.entries(props)) {
    if (prop['x-ui-type'] !== 'referenceImages') continue;

    const minItems = typeof prop.minItems === 'number' ? prop.minItems : undefined;
    const maxItems = typeof prop.maxItems === 'number' ? prop.maxItems : undefined;
    const itemTypeDefault = readItemTypeDefault(prop);
    const isRequired = requiredSet.has(field) || (minItems != null && minItems >= 1);

    slots.push({
      field,
      title: typeof prop.title === 'string' && prop.title.trim() ? prop.title.trim() : field,
      required: isRequired,
      ...(minItems != null ? { minItems } : {}),
      ...(maxItems != null ? { maxItems } : {}),
      ...(itemTypeDefault ? { itemTypeDefault } : {}),
      ...(buildAgentHint(field, prop) ? { agentHint: buildAgentHint(field, prop) } : {}),
    });
  }

  return slots;
}

export function summarizeInputSchema(schema: JsonSchemaV2): {
  required: string[];
  fields: AgentCatalogFieldSummary[];
  referenceImageSlots: AgentCatalogReferenceImageSlot[];
  paramsExample: Record<string, unknown>;
} {
  const { schema: cleaned } = buildPublishedInputSchema(schema);
  const props = (cleaned.properties ?? {}) as Record<string, Record<string, unknown>>;
  const requiredSet = new Set((cleaned.required ?? []).map(String));
  const required = [...requiredSet];

  const fields: AgentCatalogFieldSummary[] = Object.entries(props).map(([name, prop]) => {
    const uiType = typeof prop['x-ui-type'] === 'string' ? prop['x-ui-type'] : undefined;
    const itemTypeDefault = uiType === 'referenceImages' ? readItemTypeDefault(prop) : undefined;

    return {
      name,
      type: typeof prop.type === 'string' ? prop.type : undefined,
      title: typeof prop.title === 'string' ? prop.title : undefined,
      description: typeof prop.description === 'string' ? prop.description : undefined,
      enum: Array.isArray(prop.enum) ? prop.enum : undefined,
      required: requiredSet.has(name),
      ...(uiType ? { uiType } : {}),
      ...(typeof prop.minItems === 'number' ? { minItems: prop.minItems } : {}),
      ...(typeof prop.maxItems === 'number' ? { maxItems: prop.maxItems } : {}),
      ...(itemTypeDefault ? { itemTypeDefault } : {}),
    };
  });

  const referenceImageSlots = buildReferenceImageSlots(props, requiredSet);
  const paramsExample = buildParamsExample(props, required);

  return {
    required,
    fields,
    referenceImageSlots,
    paramsExample,
  };
}
