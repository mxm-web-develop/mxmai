/**
 * 搜索引擎配置管理器
 * 从 DB 读取 API key 等配置；多 Key 按优先级串试，成功 Key 置顶
 */

import { RepositoryFactory } from '@mxmai/mxmdata';

export interface SearchProviderConfig {
  name: string;
  enabled: boolean;
  /** API key 数组：下标越小优先级越高；成功调用后会把该 Key 提到 [0] */
  apiKeys: string[];
  rateLimit?: number;
  extra?: Record<string, unknown>;
}

const CACHE_TTL_MS = 60 * 1000; // 1分钟缓存

interface CacheEntry {
  config: SearchProviderConfig;
  timestamp: number;
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
 * apiKeys[0] = 当前最高优先级 Key
 */
export async function getSearchProviderConfig(
  provider: string
): Promise<SearchProviderConfig> {
  const now = Date.now();
  const cached = configCache.get(provider);

  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return {
      ...cached.config,
      apiKeys: [...cached.config.apiKeys],
    };
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
      configCache.set(provider, { config, timestamp: now });
      return { ...config, apiKeys: [...apiKeys] };
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
    configCache.set(provider, { config, timestamp: now });
    return { ...config, apiKeys: [...envKeys] };
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
 * 获取当前最高优先级 API Key（调用前须先 getSearchProviderConfig）
 * 不再副作用轮询；多 Key 串试请用 listApiKeysInPriority + promoteApiKey
 */
export function getCurrentApiKey(provider: string): string | undefined {
  const cached = configCache.get(provider);
  if (!cached) return undefined;
  return cached.config.apiKeys[0];
}

/** 按优先级返回全部 Key 副本（[0] 最高）；调用前须先 getSearchProviderConfig */
export function listApiKeysInPriority(provider: string): string[] {
  const cached = configCache.get(provider);
  return cached?.config.apiKeys?.slice() ?? [];
}

/** 当前缓存中的 Key 数量（调用前须先 getSearchProviderConfig） */
export function getApiKeyCount(provider: string): number {
  const cached = configCache.get(provider);
  return cached?.config.apiKeys?.length ?? 0;
}

/**
 * 将成功的 Key 提升为该 Provider 优先级第一（内存）
 * @returns 是否发生了顺序变更
 */
export function promoteApiKey(provider: string, apiKey: string): boolean {
  const key = typeof apiKey === 'string' ? apiKey.trim() : '';
  if (!key) return false;
  const cached = configCache.get(provider);
  if (!cached) return false;

  const keys = cached.config.apiKeys;
  const idx = keys.indexOf(key);
  if (idx < 0) return false;
  if (idx === 0) return false;

  keys.splice(idx, 1);
  keys.unshift(key);
  cached.timestamp = Date.now();
  return true;
}

/**
 * 成功 Key 置顶：先改内存顺序，再异步落库，保证后续请求与进程重启后仍优先用该 Key
 */
export function promoteApiKeyAndPersist(provider: string, apiKey: string): void {
  if (!promoteApiKey(provider, apiKey)) return;
  const ordered = listApiKeysInPriority(provider);
  console.info(
    `[SearchConfig] ${provider} Key 已置顶（共 ${ordered.length} 个），后续请求优先用此 Key`
  );
  void saveSearchProviderConfig(provider, { apiKeys: ordered }).catch((err) => {
    console.warn(`[SearchConfig] ${provider} Key 优先级落库失败:`, err);
  });
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
 * 各维度 Provider 优先级链（运行时串试：失败/空/超时 → 下一个；限流会短时熔断）
 * AnySearch：垂域（social/academic/finance）优先；general/news 仍以 Tavily 为首选
 */
const DIMENSION_PROVIDER_FALLBACK: Record<string, string[]> = {
  // Tavily 优先；博查可选；额度耗尽后 AnySearch
  general: ['tavily', 'anysearch', 'bocha', 'brave', 'bing', 'duckduckgo'],
  news: ['tavily', 'anysearch', 'bocha', 'brave', 'bing'],
  academic: ['arxiv', 'anysearch', 'tavily'],
  forum: ['anysearch', 'tavily', 'bocha', 'brave', 'bing'],
  social: ['anysearch', 'brave', 'tavily'],
  video: ['tavily', 'brave', 'bing'],
  official: ['bocha', 'anysearch', 'tavily', 'brave', 'bing'],
  finance: ['anysearch', 'tavily', 'bocha', 'brave', 'bing'],
  all: ['tavily', 'bocha', 'anysearch', 'brave', 'bing', 'duckduckgo'],
};

/** Provider 运行失败（限流/额度）短时熔断，避免每维每查询都继续打死源 */
const providerCooldownUntil = new Map<string, number>();
const DEFAULT_PROVIDER_COOLDOWN_MS = 5 * 60 * 1000;

export function isRateLimitSignal(message: string): boolean {
  return /(?:^|\D)(?:429|432)(?:\D|$)|usage limit|rate.?limit|quota|too many requests|plan'?s set usage|insufficient_quota|over.?capacity/i.test(
    message
  );
}

export function markSearchProviderCooldown(
  provider: string,
  reason: string,
  ms: number = DEFAULT_PROVIDER_COOLDOWN_MS
): void {
  const name = provider.trim().toLowerCase();
  if (!name || name === 'timeout') return;
  const until = Date.now() + Math.max(1_000, ms);
  providerCooldownUntil.set(name, until);
  console.warn(
    `[SearchCircuit] ${name} cooldown ${Math.round(ms / 1000)}s — ${reason.slice(0, 160)}`
  );
}

export function isSearchProviderInCooldown(provider: string): boolean {
  const name = provider.trim().toLowerCase();
  const until = providerCooldownUntil.get(name);
  if (until == null) return false;
  if (until <= Date.now()) {
    providerCooldownUntil.delete(name);
    return false;
  }
  return true;
}

/** 测试 / 运维：清熔断 */
export function clearSearchProviderCooldowns(): void {
  providerCooldownUntil.clear();
}

function dimensionProviderChain(dimension: string): string[] {
  return (
    DIMENSION_PROVIDER_FALLBACK[dimension] ?? [
      'tavily',
      'anysearch',
      'brave',
      'duckduckgo',
    ]
  );
}

/**
 * 维度内可用 Provider 全链（已启用+有 key，且未熔断）。
 * 聚合器按此顺序串试，直到有结果。
 */
export async function listUsableProvidersForDimension(dimension: string): Promise<string[]> {
  const out: string[] = [];
  for (const name of dimensionProviderChain(dimension)) {
    if (isSearchProviderInCooldown(name)) continue;
    if (await isSearchProviderUsable(name)) out.push(name);
  }
  return out;
}

/** 为指定搜索维度解析第一个可用的 Provider 名称（兼容旧调用） */
export async function resolveProviderForDimension(dimension: string): Promise<string | null> {
  const chain = await listUsableProvidersForDimension(dimension);
  return chain[0] ?? null;
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

/** 测试用：注入 Provider Key 优先级（不落库） */
export function seedSearchProviderKeysForTest(provider: string, apiKeys: string[]): void {
  configCache.set(provider, {
    config: {
      name: provider,
      enabled: true,
      apiKeys: apiKeys.filter((k) => typeof k === 'string' && k.trim().length > 0),
    },
    timestamp: Date.now(),
  });
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
  configCache.set(provider, { config: newConfig, timestamp: Date.now() });

  return newConfig;
}

// 兼容旧接口
export { extractApiKeysFromConfig as extractApiKeys };
