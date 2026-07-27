/**
 * Provider 物理模型目录（权威数据源）
 *
 * 从 provider_models 表读取启用的模型；上游 ID、scope、modality 等以 DB 为准。
 * 启动时由 ProviderFactory.loadProviderCatalog() 加载；与代码 registry 合并。
 */

import type { ProviderType } from '../core/providers/types';
import { isRegisteredProviderType } from '../core/providers/registered-provider-types';
import type { ProviderModel } from '@mxmai/mxmdata';

function isProviderType(s: string): s is ProviderType {
  return isRegisteredProviderType(s);
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
 * 扁平列出所有启用的 provider_models（来自 DB 缓存）
 */
export function listAllEnabled(): ProviderModel[] {
  const all: ProviderModel[] = [];
  for (const list of cache.values()) {
    all.push(...list);
  }
  return all;
}

/**
 * 按 scope 列出启用的 model_key（跨 provider 去重）
 */
export function listEnabledModelKeysByScope(scope: string): string[] {
  const want = String(scope).toLowerCase();
  const keys = new Set<string>();
  for (const m of listAllEnabled()) {
    const s = String((m as any).scope ?? '').toLowerCase();
    if (s === want) {
      keys.add(m.model_key);
    }
  }
  return Array.from(keys);
}

/** 写作等业务可复用仅注册在 text scope 的 chat 物理模型（如 MiniMax-M3） */
const CHAT_SCOPE_FALLBACK: Record<string, string> = {
  writing: 'text',
};

/**
 * 已废弃/误配的 model_key → 当前物理 model_key。
 * MiniMax 官方仅有 MiniMax-M3，不存在 MiniMax-M3-highspeed（highspeed 仅 M2.x 系列）。
 */
const DEPRECATED_MODEL_KEY_ALIASES: Partial<Record<ProviderType, Record<string, string>>> = {
  maxplan: {
    'MiniMax-M3-highspeed': 'MiniMax-M3',
  },
};

function resolveModelKeyAlias(modelKey: string, provider?: ProviderType | null): string {
  if (!provider) return modelKey;
  const mapped = DEPRECATED_MODEL_KEY_ALIASES[provider]?.[modelKey];
  if (mapped && mapped !== modelKey) {
    console.warn(
      `[ProviderModelCatalog] model_key 别名: ${provider}/${modelKey} → ${mapped}（建议在 Admin 更新路由）`,
    );
    return mapped;
  }
  return modelKey;
}

function matchEnabledModel(
  list: ProviderModel[],
  filter: { modelKey: string; scope?: string | null; provider?: ProviderType | null },
): ProviderModel | null {
  const modelKey = filter.modelKey;
  const wantScope = filter.scope != null ? String(filter.scope).toLowerCase() : null;
  const wantProvider = filter.provider ?? null;

  for (const m of list) {
    if (m.model_key !== modelKey && m.upstream_model !== modelKey) continue;
    if (wantProvider && m.provider !== wantProvider) continue;
    if (wantScope) {
      const s = String((m as { scope?: string }).scope ?? '').toLowerCase();
      if (s !== wantScope) continue;
    }
    return m;
  }
  return null;
}

/**
 * 查询某个 model_key 在 DB 中是否存在（可选限定 scope/provider）
 */
export function findEnabledModel(filter: {
  modelKey: string;
  scope?: string;
  provider?: ProviderType;
}): ProviderModel | null {
  const resolvedKey = resolveModelKeyAlias(filter.modelKey, filter.provider ?? null);
  const resolvedFilter = resolvedKey === filter.modelKey ? filter : { ...filter, modelKey: resolvedKey };

  const wantProvider = resolvedFilter.provider ?? null;
  const list = wantProvider ? listByProvider(wantProvider) : listAllEnabled();

  const direct = matchEnabledModel(list, resolvedFilter);
  if (direct) return direct;

  const wantScope = resolvedFilter.scope != null ? String(resolvedFilter.scope).toLowerCase() : null;
  const fallbackScope = wantScope ? CHAT_SCOPE_FALLBACK[wantScope] : undefined;
  if (!fallbackScope) return null;

  return matchEnabledModel(list, { ...resolvedFilter, scope: fallbackScope });
}

/**
 * 刷新内存中的 provider_models 目录（Admin/脚本改库后、或进程启动后新增模型时使用）
 */
export async function refreshProviderModelCatalog(): Promise<void> {
  await loadProviderModelCatalog();
  try {
    const { providerFactory } = await import('./providers');
    await providerFactory.loadProviderCatalog();
  } catch (e) {
    console.warn(
      '[ProviderModelCatalog] providerFactory.loadProviderCatalog 刷新失败:',
      e instanceof Error ? e.message : String(e)
    );
  }
}

/**
 * 查内存目录；未命中时从 DB 重新加载后再查一次（避免 worker 长跑后目录过期）
 */
export async function findEnabledModelWithReload(filter: {
  modelKey: string;
  scope?: string;
  provider?: ProviderType;
}): Promise<ProviderModel | null> {
  const hit = findEnabledModel(filter);
  if (hit) return hit;
  await refreshProviderModelCatalog();
  return findEnabledModel(filter);
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
