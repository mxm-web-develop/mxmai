/**
 * Provider 物理模型目录（权威数据源）
 *
 * 从 provider_models 表读取启用的模型；上游 ID、scope、modality 等以 DB 为准。
 * 启动时由 ProviderFactory.loadProviderCatalog() 加载；与代码 registry 合并。
 */

import type { ProviderType } from '../core/providers/types';
import type { ProviderModel } from '@mxmai/mxmdata';

const VALID_PROVIDERS: ProviderType[] = [
  'replicate',
  'ppio',
  'deer',
  'openai',
  'google',
  'anthropic',
  'qwen',
  'volc',
  'minimax',
];

function isProviderType(s: string): s is ProviderType {
  return VALID_PROVIDERS.includes(s as ProviderType);
}

/** 按 provider 分组的启用模型缓存 */
let cache: Map<string, ProviderModel[]> = new Map();
let loaded = false;

/**
 * 从 DB 加载启用的 provider_models 并填充缓存
 */
export async function loadProviderModelCatalog(): Promise<void> {
  try {
    const { RepositoryFactory } = await import('@mxmai/mxmdata');
    const repo = RepositoryFactory.createProviderModelRepository();
    const all = await repo.list({ onlyEnabled: true });

    const byProvider = new Map<string, ProviderModel[]>();
    for (const m of all) {
      if (!isProviderType(m.provider)) continue;
      const list = byProvider.get(m.provider) ?? [];
      list.push(m);
      byProvider.set(m.provider, list);
    }
    cache = byProvider;
    loaded = true;
    console.log(
      `[ProviderModelCatalog] 已加载 ${all.length} 个启用模型，覆盖 provider: ${Array.from(cache.keys()).join(', ')}`
    );
  } catch (e) {
    console.warn('[ProviderModelCatalog] 加载失败，将仅使用静态模型:', e instanceof Error ? e.message : String(e));
    cache = new Map();
    loaded = true; // 避免重复尝试
  }
}

/**
 * 是否已加载（用于判断是否可做 sync 查询）
 */
export function isLoaded(): boolean {
  return loaded;
}

/**
 * 按 provider + model_key 查找（支持 model_key 或 upstream_model 匹配）
 */
export function getByProviderAndModelKey(provider: ProviderType, modelKey: string): ProviderModel | null {
  const list = cache.get(provider) ?? [];
  return (
    list.find((m) => m.model_key === modelKey || m.upstream_model === modelKey) ?? null
  );
}

/**
 * 模型是否在 DB 目录中且已启用
 */
export function isModelEnabled(provider: ProviderType, modelKey: string): boolean {
  return getByProviderAndModelKey(provider, modelKey) !== null;
}

/**
 * 获取实际上游模型名（upstream_model ?? model_key）
 */
export function getUpstreamModel(provider: ProviderType, modelKey: string): string | null {
  const m = getByProviderAndModelKey(provider, modelKey);
  return m ? (m.upstream_model ?? m.model_key) : null;
}

/**
 * 按 provider 列出启用的模型
 */
export function listByProvider(provider: ProviderType): ProviderModel[] {
  return cache.get(provider) ?? [];
}

/**
 * 返回用于合并到 modelProviderMap 的扁平列表：{ provider, model_key }[]
 */
export function getEnabledForMerge(): { provider: ProviderType; model_key: string }[] {
  const result: { provider: ProviderType; model_key: string }[] = [];
  for (const [provider, list] of cache) {
    if (!isProviderType(provider)) continue;
    for (const m of list) {
      result.push({ provider: provider as ProviderType, model_key: m.model_key });
      if (m.upstream_model && m.upstream_model !== m.model_key) {
        result.push({ provider: provider as ProviderType, model_key: m.upstream_model });
      }
    }
  }
  return result;
}
