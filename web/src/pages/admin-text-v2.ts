/**
 * Admin / 前端侧 text v2 常量（与 mxmcgi/src/tasks/text-v2.ts 对齐）
 */
import type { JsonSchema } from './AdminBusiness.types';

export const TEXT_V2_TYPES = ['plan', 'transform', 'expert', 'validation'] as const;
export type TextV2Type = (typeof TEXT_V2_TYPES)[number];

export const TEXT_V2_INPUT_KEYS: Record<TextV2Type, readonly string[]> = {
  expert: ['contract', 'field_specs'],
  plan: ['contract', 'goal'],
  transform: ['input', 'instruction'],
  validation: ['contract', 'rules'],
};

export const TEXT_V2_TYPE_OPTIONS = [
  { value: 'plan', label: 'plan · 规划' },
  { value: 'transform', label: 'transform · 转换' },
  { value: 'expert', label: 'expert · 专家填合同' },
  { value: 'validation', label: 'validation · 校验' },
] as const;

export function isTextV2Type(value: string | null | undefined): value is TextV2Type {
  return !!value && (TEXT_V2_TYPES as readonly string[]).includes(value);
}

export function parseTextV2TypeFromNestedKey(nestedKey: string): TextV2Type | null {
  const parts = nestedKey.trim().split('/').filter(Boolean);
  if (parts[0] !== 'text' || !parts[1]) return null;
  return isTextV2Type(parts[1]) ? parts[1] : null;
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

export function getTextV2FixedFormSchema(type: TextV2Type): JsonSchema {
  const schemas: Record<TextV2Type, JsonSchema> = {
    expert: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      required: ['contract', 'field_specs'],
      properties: {
        contract: prop('运行时合同', '完整或裁剪后的业务合同', 'object', {
          additionalProperties: true,
        }),
        field_specs: prop('待填字段说明', '可由管道按 schema 自动生成', 'array', {
          items: { type: 'object', additionalProperties: true },
        }),
      },
      additionalProperties: false,
    },
    plan: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      required: ['contract', 'goal'],
      properties: {
        contract: prop('运行时合同', '规划所依据的合同上下文', 'object', {
          additionalProperties: true,
        }),
        goal: prop('规划目标', '本步要产出的规划意图'),
      },
      additionalProperties: false,
    },
    transform: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      required: ['input', 'instruction'],
      properties: {
        input: prop('输入内容', '待转换内容（格式由 subtype prompt 约定）'),
        instruction: prop('转换说明', '本步转换目标与约束摘要'),
      },
      additionalProperties: false,
    },
    validation: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      required: ['contract', 'rules'],
      properties: {
        contract: prop('运行时合同', '待校验的合同快照', 'object', {
          additionalProperties: true,
        }),
        rules: prop('校验规则', '规则说明（由 subtype prompt 解释）'),
      },
      additionalProperties: false,
    },
  };
  return schemas[type];
}

export function defaultNestedTextInputMapping(type: TextV2Type): Record<string, string> {
  switch (type) {
    case 'expert':
      return {
        contract: '${state.contract}',
        // field_specs 空着时由运行时自动生成
      };
    case 'plan':
      return {
        contract: '${state.contract}',
        goal: '${params.goal}',
      };
    case 'transform':
      return {
        input: '${state.finalPrompt}',
        instruction: 'Follow the subtype unifiedTemplate.',
      };
    case 'validation':
      return {
        contract: '${state.contract}',
        rules: '${params.rules}',
      };
    default:
      return {};
  }
}
