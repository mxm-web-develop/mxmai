/**
 * Smartflow 节点 params 变量解析（business / tools 等共用）
 */

import { ExecutionContext } from '../models/types';
import { VariableResolver } from '../variables/resolver';

/** 整段仅为单个 {{path}} 时直接取原始值，避免 number/array 被 String() 化 */
const SINGLE_VARIABLE_REF = /^\{\{\s*([^}]+?)\s*\}\}$/;

function tryParseJsonValue(s: string): unknown {
  const t = s.trim();
  if (!t) return s;
  const first = t[0];
  if (first !== '{' && first !== '[' && first !== '"') return s;
  try {
    return JSON.parse(t);
  } catch {
    return s;
  }
}

/**
 * 递归解析 params：字符串做 VariableResolver；解析后尝试 JSON.parse 数组/对象。
 */
export function resolveSmartflowParams(
  value: unknown,
  context: ExecutionContext
): unknown {
  if (value == null) return value;

  if (typeof value === 'string') {
    const singleRef = value.match(SINGLE_VARIABLE_REF);
    if (singleRef) {
      const pathVal = VariableResolver.resolvePath(singleRef[1].trim(), context);
      if (pathVal !== undefined) return pathVal;
      return value;
    }

    const hasVar = VariableResolver.hasVariables(value);
    const resolved = hasVar ? VariableResolver.resolve(value, context) : value;
    if (typeof resolved !== 'string') return resolved;
    if (hasVar || resolved.trim().startsWith('[') || resolved.trim().startsWith('{')) {
      return tryParseJsonValue(resolved);
    }
    return resolved;
  }

  if (Array.isArray(value)) {
    return value.map((v) => resolveSmartflowParams(v, context));
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = resolveSmartflowParams(v, context);
    }
    return out;
  }

  return value;
}
