/**
 * 扁平 contractSchema + x-zone → 运行时 basic / business
 */
import type { JsonSchemaV2 } from '../types';
import type { MxmWarpContract, XZone } from './contract-types';

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

export function readXZone(fieldSchema: Record<string, unknown>): XZone {
  const z = fieldSchema['x-zone'];
  if (z === 'basic') return 'basic';
  return 'business';
}

/** 从 JSON Schema properties 拆出 basic / business 字段名 */
export function partitionContractSchemaFields(schema: JsonSchemaV2 | undefined): {
  basicKeys: string[];
  businessKeys: string[];
  fieldSchemas: Record<string, Record<string, unknown>>;
} {
  const props = asRecord(schema?.properties) ?? {};
  const basicKeys: string[] = [];
  const businessKeys: string[] = [];
  const fieldSchemas: Record<string, Record<string, unknown>> = {};
  for (const [name, raw] of Object.entries(props)) {
    const fs = asRecord(raw) ?? {};
    fieldSchemas[name] = fs;
    if (readXZone(fs) === 'basic') basicKeys.push(name);
    else businessKeys.push(name);
  }
  return { basicKeys, businessKeys, fieldSchemas };
}

/**
 * 用用户 params（及已有 contract 碎片）组装 / 合并 basic+business。
 * 不发明字段值：只搬运 params 里已有的键。
 */
export function assembleZonesFromParams(
  schema: JsonSchemaV2 | undefined,
  params: Record<string, unknown>,
  prior?: Pick<MxmWarpContract, 'basic' | 'business'>
): { basic: Record<string, unknown>; business: Record<string, unknown> } {
  const { basicKeys, businessKeys } = partitionContractSchemaFields(schema);
  const basic: Record<string, unknown> = { ...(prior?.basic ?? {}) };
  const business: Record<string, unknown> = { ...(prior?.business ?? {}) };

  for (const k of basicKeys) {
    if (Object.prototype.hasOwnProperty.call(params, k) && params[k] !== undefined) {
      basic[k] = params[k];
    }
  }
  for (const k of businessKeys) {
    if (Object.prototype.hasOwnProperty.call(params, k) && params[k] !== undefined) {
      business[k] = params[k];
    }
  }

  // 无 schema 时：全部进 business（除保留顶层名）
  if (basicKeys.length === 0 && businessKeys.length === 0) {
    const reserved = new Set(['meta', 'basic', 'business', 'sources', 'assets', 'enrich_search']);
    for (const [k, v] of Object.entries(params)) {
      if (reserved.has(k) || v === undefined) continue;
      business[k] = v;
    }
  }

  return { basic, business };
}

/** 为 input LLM 生成「仅 basic 简单回填」的字段说明 */
export function buildBasicFieldGuide(schema: JsonSchemaV2 | undefined): Array<{
  name: string;
  description: string;
  type?: string;
}> {
  const { basicKeys, fieldSchemas } = partitionContractSchemaFields(schema);
  return basicKeys.map((name) => {
    const fs = fieldSchemas[name] ?? {};
    return {
      name,
      description: typeof fs.description === 'string' ? fs.description : typeof fs.title === 'string' ? fs.title : name,
      type: typeof fs.type === 'string' ? fs.type : undefined,
    };
  });
}
