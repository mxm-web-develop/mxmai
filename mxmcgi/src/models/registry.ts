import type { ModelDefinition, ModelScope } from './types';

/**
 * 简单的内存模型注册表。
 *
 * 设计原则：
 * - 不主动读文件系统，避免与打包方式耦合；
 * - 通过各模型模块在顶层调用 registerModel() 完成自注册；
 * - 提供按 provider / scope / modelKey 检索的基础能力。
 */

type ProviderKey = string;

const byProvider = new Map<ProviderKey, Map<ModelScope, Map<string, ModelDefinition[]>>>();
const byScopeAndKey = new Map<ModelScope, Map<string, ModelDefinition[]>>();

export function registerModel(def: ModelDefinition): void {
  const { provider, scope, modelKey } = def;

  // byProvider 映射
  let scopeMap = byProvider.get(provider);
  if (!scopeMap) {
    scopeMap = new Map();
    byProvider.set(provider, scopeMap);
  }

  let modelMap = scopeMap.get(scope);
  if (!modelMap) {
    modelMap = new Map();
    scopeMap.set(scope, modelMap);
  }

  const existingForProvider = modelMap.get(modelKey) ?? [];
  existingForProvider.push(def);
  modelMap.set(modelKey, existingForProvider);

  // byScopeAndKey 映射
  let scopeKeyMap = byScopeAndKey.get(scope);
  if (!scopeKeyMap) {
    scopeKeyMap = new Map();
    byScopeAndKey.set(scope, scopeKeyMap);
  }
  const existingGlobal = scopeKeyMap.get(modelKey) ?? [];
  existingGlobal.push(def);
  scopeKeyMap.set(modelKey, existingGlobal);
}

export function getModel(
  provider: string,
  scope: ModelScope,
  modelKey: string
): ModelDefinition | null {
  const scopeMap = byProvider.get(provider);
  const modelMap = scopeMap?.get(scope);
  const defs = modelMap?.get(modelKey);
  return defs && defs.length > 0 ? defs[0] : null;
}

export function getModelsByKey(
  scope: ModelScope,
  modelKey: string
): ModelDefinition[] {
  const scopeMap = byScopeAndKey.get(scope);
  return scopeMap?.get(modelKey) ?? [];
}

export function listModels(filter?: {
  provider?: string;
  scope?: ModelScope;
}): ModelDefinition[] {
  const results: ModelDefinition[] = [];

  if (filter?.provider) {
    const scopeMap = byProvider.get(filter.provider);
    if (!scopeMap) return [];
    const scopes = filter.scope ? [filter.scope] : Array.from(scopeMap.keys());
    for (const scope of scopes) {
      const modelMap = scopeMap.get(scope);
      if (!modelMap) continue;
      for (const defs of modelMap.values()) {
        results.push(...defs);
      }
    }
    return results;
  }

  if (filter?.scope) {
    const scopeMap = byScopeAndKey.get(filter.scope);
    if (!scopeMap) return [];
    for (const defs of scopeMap.values()) {
      results.push(...defs);
    }
    return results;
  }

  // 无过滤：返回所有
  for (const scopeMap of byScopeAndKey.values()) {
    for (const defs of scopeMap.values()) {
      results.push(...defs);
    }
  }
  return results;
}

