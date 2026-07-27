/**
 * Text 子业务 v2（mxm-warp · T）
 * 四档 type 钉死入参；subtype 只改 prompt。见 docs/mxm-warp-v2-对齐记录.md §T
 */

import type { JsonSchemaV2 } from './types';

export const TEXT_V2_TYPES = ['plan', 'transform', 'expert', 'validation'] as const;
export type TextV2Type = (typeof TEXT_V2_TYPES)[number];

export const TEXT_V2_INPUT_KEYS: Record<TextV2Type, readonly string[]> = {
  expert: ['contract', 'field_specs'],
  plan: ['contract', 'goal'],
  transform: ['input', 'instruction'],
  validation: ['contract', 'rules'],
} as const;

export const TEXT_V2_TYPE_LABELS: Record<TextV2Type, { zh: string; en: string }> = {
  plan: { zh: '规划', en: 'Plan' },
  transform: { zh: '转换', en: 'Transform' },
  expert: { zh: '专家填合同', en: 'Expert' },
  validation: { zh: '校验', en: 'Validation' },
};

const LEGACY_TEXT_TYPES = new Set(['format', 'think', 'structure', 'layout']);

export function isTextV2Type(value: string | null | undefined): value is TextV2Type {
  return !!value && (TEXT_V2_TYPES as readonly string[]).includes(value);
}

export function assertTextV2TaskKey(taskKey: string): TextV2Type {
  if (isTextV2Type(taskKey)) return taskKey;
  if (LEGACY_TEXT_TYPES.has(taskKey)) {
    throw new Error(
      `text taskKey「${taskKey}」已废止。请使用 plan | transform | expert | validation（本分支不兼容旧映射）。`
    );
  }
  throw new Error(
    `text taskKey「${taskKey}」非法。仅允许：${TEXT_V2_TYPES.join(' | ')}`
  );
}

function prop(
  title: string,
  description: string,
  type: 'string' | 'object' | 'array' = 'string',
  extra?: Record<string, unknown>
): Record<string, unknown> {
  return {
    type,
    title,
    description,
    ...(type === 'string' ? { minLength: 1 } : {}),
    ...extra,
  };
}

/** 平台注入的固定 formSchema / contractSchema（按 type） */
export function getTextV2FixedFormSchema(type: TextV2Type): JsonSchemaV2 {
  const schemas: Record<TextV2Type, JsonSchemaV2> = {
    expert: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      required: ['contract', 'field_specs'],
      properties: {
        contract: prop(
          '运行时合同',
          '完整或裁剪后的业务合同（含 basic/business/sources 等）。用于专家理解上下文并填 business。',
          'object',
          { additionalProperties: true }
        ),
        field_specs: prop(
          '待填字段说明',
          '待回填的 business 字段规格（名、类型、description）。可由管道按 schema 自动生成。',
          'array',
          {
            items: {
              type: 'object',
              required: ['name'],
              properties: {
                name: { type: 'string', description: 'business 字段名' },
                type: { type: 'string', description: '期望类型，如 string/object/array' },
                description: { type: 'string', description: '字段用途解读' },
                required: { type: 'boolean' },
              },
              additionalProperties: true,
            },
          }
        ),
      },
      additionalProperties: false,
    },
    plan: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      required: ['contract', 'goal'],
      properties: {
        contract: prop(
          '运行时合同',
          '规划所依据的合同上下文。',
          'object',
          { additionalProperties: true }
        ),
        goal: prop('规划目标', '本步要产出的规划意图（自然语言）。'),
      },
      additionalProperties: false,
    },
    transform: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      required: ['input', 'instruction'],
      properties: {
        input: prop(
          '输入内容',
          '待转换的原文或结构化文本（格式由 subtype prompt 约定）。'
        ),
        instruction: prop(
          '转换说明',
          '本步转换目标与约束摘要；细则以 unifiedTemplate 为准。'
        ),
      },
      additionalProperties: false,
    },
    validation: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      required: ['contract', 'rules'],
      properties: {
        contract: prop(
          '运行时合同',
          '待校验的合同快照。',
          'object',
          { additionalProperties: true }
        ),
        rules: prop(
          '校验规则',
          '规则说明（自然语言或结构化 JSON 字符串，由 subtype prompt 解释）。'
        ),
      },
      additionalProperties: false,
    },
  };
  return schemas[type];
}

/** 保存 / 加载时强制覆盖 text 业务 schema，并清空 pipeline */
export function applyTextV2PlatformTemplate(
  taskKey: string,
  template: Record<string, unknown>
): Record<string, unknown> {
  const type = assertTextV2TaskKey(taskKey);
  const schema = getTextV2FixedFormSchema(type);
  return {
    ...template,
    formSchema: schema,
    contractSchema: schema,
    pipeline: { pre: [], enrich: [], post: [] },
  };
}

/**
 * nestedText / 平台会往 params 注入 `_pipelineDepth`、`metadata` 等；
 * formSchema.additionalProperties=false，校验前只抽取钉死业务键。
 */
export function pickTextV2ParamsForSchemaValidate(
  type: TextV2Type,
  params: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of TEXT_V2_INPUT_KEYS[type]) {
    if (Object.prototype.hasOwnProperty.call(params, key)) {
      out[key] = params[key];
    }
  }
  return out;
}

export function parseTextV2TypeFromNestedKey(nestedKey: string): TextV2Type | null {
  const parts = nestedKey.trim().split('/').filter(Boolean);
  if (parts[0] !== 'text' || !parts[1]) return null;
  return isTextV2Type(parts[1]) ? parts[1] : null;
}

export function assertNestedTextInputMappingKeys(
  nestedKey: string,
  inputMapping: Record<string, string> | undefined
): void {
  const type = parseTextV2TypeFromNestedKey(nestedKey);
  if (!type) {
    throw new Error(
      `nestedText「${nestedKey}」不是合法 text v2（需 text/{plan|transform|expert|validation}/subtype）`
    );
  }
  const allowed = new Set(TEXT_V2_INPUT_KEYS[type]);
  const keys = Object.keys(inputMapping ?? {});
  for (const k of keys) {
    if (!allowed.has(k)) {
      throw new Error(
        `nestedText「${nestedKey}」inputMapping 含非法键「${k}」。${type} 仅允许：${[
          ...allowed,
        ].join(', ')}`
      );
    }
  }
}

export type FieldSpec = {
  name: string;
  type?: string;
  description?: string;
  required?: boolean;
};

/** 从宿主合同 schema（business 区）生成 field_specs；优先未填/空字段 */
export function buildExpertFieldSpecs(opts: {
  contract?: Record<string, unknown> | null;
  contractSchema?: JsonSchemaV2 | null;
  onlyEmpty?: boolean;
}): FieldSpec[] {
  const onlyEmpty = opts.onlyEmpty !== false;
  const schema = opts.contractSchema;
  const props = (schema?.properties ?? {}) as Record<string, Record<string, unknown>>;
  const business: Record<string, unknown> =
    opts.contract && typeof opts.contract.business === 'object' && opts.contract.business
      ? (opts.contract.business as Record<string, unknown>)
      : {};

  const specs: FieldSpec[] = [];
  for (const [name, def] of Object.entries(props)) {
    if (!def || typeof def !== 'object') continue;
    const zone = def['x-zone'];
    if (zone === 'basic') continue;
    const cur = business[name];
    const empty =
      cur === undefined ||
      cur === null ||
      cur === '' ||
      (Array.isArray(cur) && cur.length === 0) ||
      (typeof cur === 'object' && !Array.isArray(cur) && Object.keys(cur as object).length === 0);
    if (onlyEmpty && !empty) continue;
    specs.push({
      name,
      type: typeof def.type === 'string' ? def.type : undefined,
      description: typeof def.description === 'string' ? def.description : undefined,
      required: Array.isArray(schema?.required) ? schema!.required!.includes(name) : undefined,
    });
  }
  return specs;
}

export type ValidationResult = { ok: boolean; errors: string[] };

export function parseValidationResult(raw: string): ValidationResult | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    let text = trimmed;
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence?.[1]) text = fence[1].trim();
    const obj = JSON.parse(text) as Record<string, unknown>;
    if (typeof obj.ok !== 'boolean') return null;
    const errors = Array.isArray(obj.errors)
      ? obj.errors.map((e) => String(e))
      : typeof obj.errors === 'string'
        ? [obj.errors]
        : [];
    return { ok: obj.ok, errors };
  } catch {
    return null;
  }
}
