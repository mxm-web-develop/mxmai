import type { PublishedApiInputDoc } from '@mxmai/mxmdata';
import type { JsonSchemaV2 } from '../tasks/types';

const INTERNAL_FIELD_KEYS = new Set(['writing_type', 'storage_form', 'uid', 'useConfiguredPrompt', 'logicalModel']);

function isUserVisibleProperty(prop: Record<string, unknown> | undefined): boolean {
  if (!prop || typeof prop !== 'object') return true;
  if (prop['x-user-visible'] === false) return false;
  return true;
}

function cloneSchema(schema: JsonSchemaV2): JsonSchemaV2 {
  return JSON.parse(JSON.stringify(schema)) as JsonSchemaV2;
}

/**
 * 从 Task V2 formSchema 生成对外入参 JSON Schema 快照（剔除内部字段）。
 */
export function buildPublishedInputSchema(formSchema: JsonSchemaV2): {
  schema: JsonSchemaV2;
  inputDoc: PublishedApiInputDoc;
} {
  const base = cloneSchema(formSchema);
  const props = (base.properties ?? {}) as Record<string, Record<string, unknown>>;
  const nextProps: Record<string, Record<string, unknown>> = {};
  const fieldHints: Record<string, string> = {};
  const referenceImageSlots: PublishedApiInputDoc['referenceImageSlots'] = [];
  const required = Array.isArray(base.required) ? [...base.required] : [];

  for (const [key, prop] of Object.entries(props)) {
    if (INTERNAL_FIELD_KEYS.has(key)) continue;
    if (!isUserVisibleProperty(prop)) continue;

    const p = { ...prop };
    const enumLabels = p['x-enum-labels'] as Record<string, string> | undefined;
    if (enumLabels && typeof enumLabels === 'object') {
      const labels = Object.entries(enumLabels)
        .map(([v, l]) => `${v}: ${l}`)
        .join('; ');
      fieldHints[key] = labels;
    } else if (typeof p.title === 'string' && p.title.trim()) {
      fieldHints[key] = p.title.trim();
    }

    if (p['x-ui-type'] === 'referenceImages') {
      referenceImageSlots.push({
        field: key,
        title: typeof p.title === 'string' ? p.title : key,
        description:
          typeof p.description === 'string'
            ? p.description
            : '上传参考图后，在请求 body 的 params 中传入 data URI 或平台 asset URL 数组',
        maxItems: typeof p.maxItems === 'number' ? p.maxItems : undefined,
      });
      if (!p.description) {
        p.description =
          '参考图数组：每项含 content（URL 或 data URI）、可选 type/purpose。可先调用平台上传接口获取 URL。';
      }
    }

    delete p['x-user-visible'];
    delete p['x-enum-labels'];
    nextProps[key] = p;
  }

  const filteredRequired = required
    .map(String)
    .filter((k) => Object.prototype.hasOwnProperty.call(nextProps, k));

  const schema: JsonSchemaV2 = {
    ...base,
    properties: nextProps,
    required: filteredRequired.length > 0 ? filteredRequired : undefined,
  };
  if (schema.required && schema.required.length === 0) {
    delete schema.required;
  }

  const inputDoc: PublishedApiInputDoc = {};
  if (Object.keys(fieldHints).length > 0) inputDoc.fieldHints = fieldHints;
  if (referenceImageSlots.length > 0) inputDoc.referenceImageSlots = referenceImageSlots;

  return { schema, inputDoc };
}

export interface SmartflowStartInputItem {
  name?: string;
  type?: string;
  content?: unknown;
}

const REF_IMAGE_ITEM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    content: { type: 'string', title: '图片 URL / Base64' },
    type: {
      type: 'string',
      title: '用途类型',
      enum: ['main-subject', 'background', 'outfits', 'color-reference', 'style-reference'],
      default: 'main-subject',
    },
    purpose: { type: 'string', title: '用途说明（可选）' },
  },
  required: ['content', 'type'],
} as const;

/** start.input[].type → JSON Schema property（与 Admin / Task V2 x-ui-type 对齐） */
export function startInputTypeToSchemaProperty(type: string): Record<string, unknown> {
  const t = String(type || 'string').trim();
  const lower = t.toLowerCase();

  if (lower === 'json' || lower === 'object') {
    return { type: 'object', additionalProperties: true };
  }
  if (lower === 'number' || lower === 'integer') {
    return { type: lower === 'integer' ? 'integer' : 'number', 'x-ui-type': 'number' };
  }
  if (lower === 'boolean') {
    return { type: 'boolean', 'x-ui-type': 'switch' };
  }
  if (lower === 'text') {
    return { type: 'string', 'x-ui-type': 'text' };
  }
  if (lower === 'selection') {
    return { type: 'string', 'x-ui-type': 'selection' };
  }
  if (lower === 'multiselection') {
    return {
      type: 'array',
      'x-ui-type': 'multiSelection',
      items: { type: 'string' },
    };
  }
  if (lower === 'referenceimages') {
    return {
      type: 'array',
      'x-ui-type': 'referenceImages',
      items: { ...REF_IMAGE_ITEM_SCHEMA },
    };
  }
  if (lower === 'eshopgarmentbatch') {
    return {
      type: 'array',
      'x-ui-type': 'eshopGarmentBatch',
      items: {
        type: 'object',
        required: ['images'],
        properties: {
          label: { type: 'string' },
          shoot_preset: { type: 'string' },
          garment_material: { type: 'string' },
          prompt: { type: 'string' },
          images: {
            type: 'array',
            minItems: 1,
            items: { ...REF_IMAGE_ITEM_SCHEMA, properties: { ...REF_IMAGE_ITEM_SCHEMA.properties, type: { ...REF_IMAGE_ITEM_SCHEMA.properties.type, default: 'outfits' } } },
          },
        },
      },
    };
  }
  if (lower === 'array' || lower === 'file' || lower === 'image' || lower === 'images') {
    return {
      type: 'array',
      items: { type: 'string' },
      ...(lower !== 'array'
        ? { description: '文件/图片：传 URL、data URI 或平台 asset URL' }
        : {}),
    };
  }
  if (lower === 'url') {
    return { type: 'string', format: 'uri', description: 'URL' };
  }
  return { type: 'string', 'x-ui-type': 'string' };
}

function applyStartInputContentDefault(
  prop: Record<string, unknown>,
  content: unknown,
  examples: Record<string, unknown>,
  name: string
): void {
  if (content === undefined || content === null || content === '') return;
  examples[name] = content;
  const propType = prop.type;
  if (propType === 'string' && typeof content === 'string') {
    prop.default = content;
  } else if (propType === 'number' || propType === 'integer') {
    const n = typeof content === 'number' ? content : Number(content);
    if (Number.isFinite(n)) prop.default = n;
  } else if (propType === 'boolean') {
    prop.default =
      content === true ||
      content === 'true' ||
      content === 1 ||
      content === '1';
  } else if (propType === 'object' || propType === 'array') {
    if (typeof content === 'object') prop.default = content;
  }
}

/**
 * Smartflow start 节点 input[] → JSON Schema
 */
export function startInputToJsonSchema(
  inputs: SmartflowStartInputItem[] | undefined
): { schema: JsonSchemaV2; inputDoc: PublishedApiInputDoc } {
  const properties: Record<string, Record<string, unknown>> = {};
  const required: string[] = [];
  const examples: Record<string, unknown> = {};
  const fieldHints: Record<string, string> = {};

  if (!inputs || !Array.isArray(inputs) || inputs.length === 0) {
    return {
      schema: { type: 'object', properties: {}, additionalProperties: true },
      inputDoc: {
        notes: ['该工作流未在 start 节点声明入参，运行时可传空对象 {}'],
      },
    };
  }

  for (const item of inputs) {
    const name = String(item.name || 'input').trim() || 'input';
    const prop = { ...startInputTypeToSchemaProperty(String(item.type || 'string')) };
    applyStartInputContentDefault(prop, item.content, examples, name);
    properties[name] = prop;
  }

  const schema: JsonSchemaV2 = {
    type: 'object',
    properties,
    required: required.length > 0 ? required : undefined,
    additionalProperties: true,
  };

  const inputDoc: PublishedApiInputDoc = {};
  if (Object.keys(examples).length > 0) {
    inputDoc.examples = { input_data: examples };
  }
  if (Object.keys(fieldHints).length > 0) inputDoc.fieldHints = fieldHints;

  return { schema, inputDoc };
}

export function findSmartflowStartNode(schema: { nodes?: unknown[] } | null | undefined): {
  input?: SmartflowStartInputItem[];
  formSchema?: JsonSchemaV2;
  uiSchema?: Record<string, unknown>;
} | null {
  const nodes = schema?.nodes;
  if (!Array.isArray(nodes)) return null;
  const start = nodes.find((n: any) => n && typeof n === 'object' && n.type === 'start');
  if (!start || typeof start !== 'object') return null;
  const s = start as {
    input?: SmartflowStartInputItem[];
    formSchema?: JsonSchemaV2;
    uiSchema?: Record<string, unknown>;
  };
  return s;
}

/**
 * Smartflow start 节点 → 发布用 JSON Schema（优先 formSchema，回退 input[]）
 */
export function buildSnapshotForSmartflowStart(
  start: ReturnType<typeof findSmartflowStartNode>
): { schema: JsonSchemaV2; inputDoc: PublishedApiInputDoc } {
  if (start?.formSchema && typeof start.formSchema === 'object') {
    const built = buildPublishedInputSchema(start.formSchema as JsonSchemaV2);
    const inputDoc: PublishedApiInputDoc = {
      ...built.inputDoc,
      notes: [
        ...(built.inputDoc.notes ?? []),
        '请求 body 使用 { "input_data": { ...字段 } }；与 Task V2 开放 API 的 params 键不同。',
      ],
    };
    if (!inputDoc.examples?.input_data) {
      const props = (built.schema.properties ?? {}) as Record<string, Record<string, unknown>>;
      const example: Record<string, unknown> = {};
      for (const [key, prop] of Object.entries(props)) {
        if (prop?.default !== undefined) example[key] = prop.default;
      }
      if (Object.keys(example).length > 0) {
        inputDoc.examples = { ...(inputDoc.examples ?? {}), input_data: example };
      }
    }
    return { schema: built.schema, inputDoc };
  }
  return startInputToJsonSchema(start?.input);
}
