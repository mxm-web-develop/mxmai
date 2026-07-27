/**
 * 搜索引擎配置管理器
 * 从 DB 读取 API key 等配置，支持缓存和多 Key 轮询
 */

import { RepositoryFactory } from '@mxmai/mxmdata';
import type { SearchScopeConfig } from '@mxmai/mxmdata';

export interface SearchProviderConfig {
  name: string;
  enabled: boolean;
  /** API key 数组，按顺序轮询使用 */
  apiKeys: string[];
  rateLimit?: number;
  extra?: Record<string, unknown>;
}

const CACHE_TTL_MS = 60 * 1000; // 1分钟缓存

interface CacheEntry {
  config: SearchProviderConfig;
  timestamp: number;
  /** 当前使用的 key 索引 */
  currentKeyIndex: number;
}

const configCache: Map<string, CacheEntry> = new Map();

/** Provider → 环境变量名（DB 未配置 Key 时回退） */
const PROVIDER_ENV_KEYS: Record<string, string> = {
  anysearch: 'ANYSEARCH_API_KEY',
  brave: 'BRAVE_API_KEY',
  tavily: 'TAVILY_API_KEY',
  bing: 'BING_API_KEY',
  bocha: 'BOCHA_API_KEY',
  serpapi: 'SERPAPI_API_KEY',
};

function getEnvApiKeys(provider: string): string[] {
  const envName = PROVIDER_ENV_KEYS[provider];
  if (!envName) return [];
  const raw = process.env[envName]?.trim();
  return raw ? [raw] : [];
}

/**
 * 获取单个 Provider 的配置（带缓存）
 * API Key 轮询：每次调用后自动切换到下一个 Key
 */
export async function getSearchProviderConfig(
  provider: string
): Promise<SearchProviderConfig> {
  const now = Date.now();
  const cached = configCache.get(provider);

  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    // 返回当前有效的 key
    const config = { ...cached.config };
    const currentKey = config.apiKeys[cached.currentKeyIndex];
    config.apiKeys = config.apiKeys.slice(cached.currentKeyIndex);
    return config;
  }

  const envKeys = getEnvApiKeys(provider);

  try {
    const repo = RepositoryFactory.createSearchScopeConfigRepository();
    const dbConfig = await repo.findByProvider(provider);

    if (dbConfig) {
      let apiKeys = extractApiKeysFromConfig(dbConfig.extra);
      if (apiKeys.length === 0 && envKeys.length > 0) {
        apiKeys = envKeys;
      }
      const config: SearchProviderConfig = {
        name: provider,
        enabled: dbConfig.enabled,
        apiKeys,
        rateLimit: dbConfig.extra?.rate_limit as number | undefined,
        extra: dbConfig.extra,
      };
      configCache.set(provider, { config, timestamp: now, currentKeyIndex: 0 });
      return config;
    }
  } catch (error) {
    console.warn(`[SearchConfig] Failed to load config for ${provider}:`, error);
  }

  // DB 无记录：有环境变量 Key 则视为可用
  if (envKeys.length > 0) {
    const config: SearchProviderConfig = {
      name: provider,
      enabled: true,
      apiKeys: envKeys,
    };
    configCache.set(provider, { config, timestamp: now, currentKeyIndex: 0 });
    return config;
  }

  // 返回默认禁用状态
  return { name: provider, enabled: false, apiKeys: [] };
}

/**
 * 从 DB 配置中提取 API keys
 */
function extractApiKeysFromConfig(extra: Record<string, unknown> | undefined): string[] {
  if (!extra) return [];

  // 支持多种格式：api_key (旧兼容), api_keys (数组), apiKey
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

/**
 * 获取当前有效的 API Key（用于实际 API 调用）
 * 会自动轮询到下一个可用 Key
 */
export function getCurrentApiKey(provider: string): string | undefined {
  const cached = configCache.get(provider);
  if (!cached) return undefined;

  const keys = cached.config.apiKeys;
  if (keys.length === 0) return undefined;

  const currentKey = keys[cached.currentKeyIndex];
  if (!currentKey) return undefined;

  // 轮询到下一个 key
  cached.currentKeyIndex = (cached.currentKeyIndex + 1) % keys.length;
  cached.timestamp = Date.now();

  return currentKey;
}

/**
 * 获取所有启用的 Provider 配置
 */
export async function getAllSearchProviderConfigs(): Promise<SearchProviderConfig[]> {
  const providers = [
    'brave',
    'tavily',
    'anysearch',
    'arxiv',
    'serpapi',
    'duckduckgo',
    'bing',
    'bocha',
  ];
  const configs = await Promise.all(providers.map((p) => getSearchProviderConfig(p)));
  // 返回所有 provider 的配置（不过滤），让前端判断 status
  return configs;
}

const ALWAYS_AVAILABLE_SEARCH_PROVIDERS = new Set(['arxiv', 'duckduckgo']);

/**
 * 各维度 Provider 优先级（选第一个已启用且可用的）
 * AnySearch：垂域（social/academic/finance）优先；general/news 仍以 Tavily 为主（结构化 + 域名白名单）
 */
const DIMENSION_PROVIDER_FALLBACK: Record<string, string[]> = {
  general: ['tavily', 'anysearch', 'bocha', 'brave', 'bing', 'duckduckgo'],
  news: ['tavily', 'anysearch', 'bocha', 'brave', 'bing'],
  academic: ['arxiv', 'anysearch', 'tavily'],
  forum: ['anysearch', 'tavily', 'bocha', 'brave', 'bing'],
  social: ['anysearch', 'brave', 'tavily'],
  video: ['tavily', 'brave', 'bing'],
  official: ['anysearch', 'tavily', 'bocha', 'brave', 'bing'],
  finance: ['anysearch', 'tavily', 'bocha', 'brave', 'bing'],
  all: ['tavily', 'anysearch', 'bocha', 'brave', 'bing', 'duckduckgo'],
};

/** 为指定搜索维度解析第一个可用的 Provider 名称 */
export async function resolveProviderForDimension(dimension: string): Promise<string | null> {
  const chain = DIMENSION_PROVIDER_FALLBACK[dimension] ?? [
    'tavily',
    'anysearch',
    'brave',
    'duckduckgo',
  ];
  for (const name of chain) {
    if (await isSearchProviderUsable(name)) return name;
  }
  return null;
}

/** 是否可用于写作 webSearch 字段（已启用且有密钥配置，或免 key 源） */
export async function isSearchProviderUsable(provider: string): Promise<boolean> {
  const name = provider.trim().toLowerCase();
  const cfg = await getSearchProviderConfig(name);
  if (cfg.enabled === false) return false;
  if (ALWAYS_AVAILABLE_SEARCH_PROVIDERS.has(name)) return true;
  return cfg.apiKeys.length > 0;
}

/** 列出当前可用的搜索 provider 名称 */
export async function listUsableSearchProviderNames(): Promise<string[]> {
  const all = [
    'brave',
    'tavily',
    'anysearch',
    'arxiv',
    'serpapi',
    'duckduckgo',
    'bing',
    'bocha',
  ];
  const usable: string[] = [];
  for (const p of all) {
    if (await isSearchProviderUsable(p)) usable.push(p);
  }
  return usable;
}

/**
 * 清除配置缓存
 */
export function clearSearchConfigCache(): void {
  configCache.clear();
}

/**
 * 保存 Provider 配置到 DB
 */
export async function saveSearchProviderConfig(
  provider: string,
  config: Partial<Omit<SearchProviderConfig, 'name'>>
): Promise<SearchProviderConfig> {
  const repo = RepositoryFactory.createSearchScopeConfigRepository();

  const existing = await repo.findByProvider(provider);

  // 合并 apiKeys
  let apiKeys: string[] = [];
  if (config.apiKeys !== undefined) {
    apiKeys = config.apiKeys.filter((k) => typeof k === 'string' && k.trim().length > 0);
  } else {
    apiKeys = extractApiKeysFromConfig(existing?.extra);
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
    scope: 'search',
    task_key: provider,
    sub_type: 'default',
    provider: provider,
    enabled: config.enabled ?? existing?.enabled ?? true,
    extra,
  });

  // 更新缓存
  const newApiKeys = extractApiKeysFromConfig(upserted.extra);
  const newConfig: SearchProviderConfig = {
    name: provider,
    enabled: upserted.enabled,
    apiKeys: newApiKeys,
    rateLimit: upserted.extra?.rate_limit as number | undefined,
    extra: upserted.extra,
  };
  configCache.set(provider, { config: newConfig, timestamp: Date.now(), currentKeyIndex: 0 });

  return newConfig;
}

// 兼容旧接口
export { extractApiKeysFromConfig as extractApiKeys };
