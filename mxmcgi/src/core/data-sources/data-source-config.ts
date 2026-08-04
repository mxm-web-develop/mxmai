/**
 * 专业数据源配置（scope=datasource，复用 search_scope_config 表）
 */

import { RepositoryFactory } from '@mxmai/mxmdata';
import type { DataSourceProviderConfig } from './types';

const CACHE_TTL_MS = 60 * 1000;
const DATASOURCE_SCOPE = 'datasource';

interface CacheEntry {
  config: DataSourceProviderConfig;
  timestamp: number;
  currentKeyIndex: number;
}

const configCache = new Map<string, CacheEntry>();

function extractApiKeys(extra: Record<string, unknown> | undefined): string[] {
  if (!extra) return [];
  const apiKeys = extra.api_keys as string[] | undefined;
  if (Array.isArray(apiKeys)) {
    return apiKeys.filter((k) => typeof k === 'string' && k.trim().length > 0);
  }
  const singleKey = (extra.api_key || extra.apiKey) as string | undefined;
  if (singleKey && typeof singleKey === 'string' && singleKey.trim().length > 0) {
    return [singleKey.trim()];
  }
  return [];
}

export async function getDataSourceProviderConfig(
  provider: string
): Promise<DataSourceProviderConfig> {
  const now = Date.now();
  const cached = configCache.get(provider);
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return { ...cached.config };
  }

  try {
    const repo = RepositoryFactory.createSearchScopeConfigRepository();
    const dbConfig = await repo.findConfig(DATASOURCE_SCOPE, provider, 'default');
    if (dbConfig) {
      const config: DataSourceProviderConfig = {
        name: provider,
        enabled: dbConfig.enabled,
        apiKeys: extractApiKeys(dbConfig.extra),
        rateLimit: dbConfig.extra?.rate_limit as number | undefined,
        extra: dbConfig.extra,
      };
      configCache.set(provider, { config, timestamp: now, currentKeyIndex: 0 });
      return config;
    }
  } catch (error) {
    console.warn(`[DataSourceConfig] Failed to load config for ${provider}:`, error);
  }

  return { name: provider, enabled: false, apiKeys: [] };
}

export function getCurrentDataSourceApiKey(provider: string): string | undefined {
  const cached = configCache.get(provider);
  if (!cached) return undefined;
  const keys = cached.config.apiKeys;
  if (keys.length === 0) return undefined;
  const currentKey = keys[cached.currentKeyIndex];
  if (!currentKey) return undefined;
  cached.currentKeyIndex = (cached.currentKeyIndex + 1) % keys.length;
  cached.timestamp = Date.now();
  return currentKey;
}

const ALWAYS_AVAILABLE = new Set(['coingecko', 'defillama', 'cn-market']);

export async function isDataSourceProviderUsable(provider: string): Promise<boolean> {
  const name = provider.trim().toLowerCase();
  if (ALWAYS_AVAILABLE.has(name)) {
    try {
      const repo = RepositoryFactory.createSearchScopeConfigRepository();
      const dbConfig = await repo.findConfig(DATASOURCE_SCOPE, name, 'default');
      if (dbConfig?.enabled === false) return false;
    } catch {
      // 无 DB 时仍可用
    }
    return true;
  }
  const cfg = await getDataSourceProviderConfig(name);
  if (cfg.enabled === false) return false;
  return cfg.apiKeys.length > 0;
}

const DOMAIN_PROVIDER_FALLBACK: Record<string, string[]> = {
  legal: ['pkulaw'],
  // cn-market：免费 A 股指数快照；Finnhub：个股/美股（需 Key）
  finance: ['cn-market', 'finnhub'],
  stock: ['cn-market', 'finnhub'],
  crypto: ['coingecko', 'defillama'],
  business: ['tianyancha'],
};

export async function resolveProviderForDomain(domain: string): Promise<string | null> {
  const chain = DOMAIN_PROVIDER_FALLBACK[domain] ?? [];
  for (const name of chain) {
    if (await isDataSourceProviderUsable(name)) return name;
  }
  return null;
}

export async function getAllDataSourceProviderConfigs(): Promise<DataSourceProviderConfig[]> {
  const providers = ['coingecko', 'cn-market', 'finnhub', 'defillama', 'pkulaw', 'tianyancha'];
  return Promise.all(providers.map((p) => getDataSourceProviderConfig(p)));
}

export async function listUsableDataSourceProviderNames(): Promise<string[]> {
  const all = ['coingecko', 'cn-market', 'finnhub', 'defillama', 'pkulaw', 'tianyancha'];
  const usable: string[] = [];
  for (const p of all) {
    if (await isDataSourceProviderUsable(p)) usable.push(p);
  }
  return usable;
}

export async function saveDataSourceProviderConfig(
  provider: string,
  config: Partial<Omit<DataSourceProviderConfig, 'name'>>
): Promise<DataSourceProviderConfig> {
  const repo = RepositoryFactory.createSearchScopeConfigRepository();
  const existing = await repo.findConfig(DATASOURCE_SCOPE, provider, 'default');

  let apiKeys: string[] = [];
  if (config.apiKeys !== undefined) {
    apiKeys = config.apiKeys.filter((k) => typeof k === 'string' && k.trim().length > 0);
  } else {
    apiKeys = extractApiKeys(existing?.extra);
  }

  const extra: Record<string, unknown> = { ...(existing?.extra || {}) };
  extra.api_keys = apiKeys;
  if (config.rateLimit !== undefined) extra.rate_limit = config.rateLimit;
  if (config.extra) {
    for (const [k, v] of Object.entries(config.extra)) {
      extra[k] = v;
    }
  }

  const upserted = await repo.upsertConfig({
    scope: DATASOURCE_SCOPE,
    task_key: provider,
    sub_type: 'default',
    provider,
    enabled: config.enabled ?? existing?.enabled ?? true,
    extra,
  });

  const newConfig: DataSourceProviderConfig = {
    name: provider,
    enabled: upserted.enabled,
    apiKeys: extractApiKeys(upserted.extra),
    rateLimit: upserted.extra?.rate_limit as number | undefined,
    extra: upserted.extra,
  };
  configCache.set(provider, { config: newConfig, timestamp: Date.now(), currentKeyIndex: 0 });
  return newConfig;
}

export function clearDataSourceConfigCache(): void {
  configCache.clear();
}
