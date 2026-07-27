/** 会话级 API 响应缓存：切换路由复用列表数据，减少重复请求 */

type CacheEntry = {
  data: unknown;
  at: number;
};

const store = new Map<string, CacheEntry>();

export const DEFAULT_SESSION_CACHE_TTL_MS = 600_000;
export const STORAGE_LIST_CACHE_TTL_MS = 600_000;

export function getSessionCache<T>(key: string, ttlMs = DEFAULT_SESSION_CACHE_TTL_MS): T | undefined {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > ttlMs) {
    store.delete(key);
    return undefined;
  }
  return hit.data as T;
}

export function setSessionCache<T>(key: string, data: T): void {
  store.set(key, { data, at: Date.now() });
}

export function invalidateSessionCachePrefix(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

export function clearSessionCache(): void {
  store.clear();
}
