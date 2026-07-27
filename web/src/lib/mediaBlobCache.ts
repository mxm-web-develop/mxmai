/** 会话级媒体 Blob 缓存：切换路由不丢缩略图，避免重复拉取 */

const MAX_ENTRIES = 1000;

type CacheEntry = {
  blobUrl: string;
  at: number;
};

const store = new Map<string, CacheEntry>();

function touch(key: string, entry: CacheEntry) {
  store.delete(key);
  store.set(key, { ...entry, at: Date.now() });
}

function evictIfNeeded() {
  while (store.size > MAX_ENTRIES) {
    const oldestKey = store.keys().next().value as string | undefined;
    if (!oldestKey) break;
    const old = store.get(oldestKey);
    if (old?.blobUrl.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(old.blobUrl);
      } catch {
        // ignore
      }
    }
    store.delete(oldestKey);
  }
}

export function mediaBlobCacheKey(
  type: string,
  taskId: string,
  variant: 'full' | 'preview' = 'full',
  index = 0
): string {
  return index > 0 ? `${type}:${variant}:${taskId}:${index}` : `${type}:${variant}:${taskId}`;
}

/** 鉴权媒体预览稳定键（仅 pathname+search，避免 baseUrl / 绝对地址重复拉取） */
export function mediaPreviewCacheKey(urlOrPath: string): string {
  const path = normalizeMediaPreviewPath(urlOrPath);
  return path ? `preview:${path}` : 'preview:';
}

/** 用户上传对象预览：按 objectId 稳定缓存（presigned / 绝对 URL 变参也不失效） */
export function storageObjectPreviewCacheKey(objectId: string): string {
  return `preview:object:${objectId}`;
}

function normalizeMediaPreviewPath(urlOrPath: string): string {
  const raw = urlOrPath.trim();
  if (!raw) return raw;
  try {
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      const u = new URL(raw);
      if (u.pathname.startsWith('/api/')) return `${u.pathname}${u.search}`;
    }
  } catch {
    // ignore
  }
  if (raw.startsWith('/api/')) return raw;
  if (typeof window !== 'undefined') {
    const base = (window.localStorage.getItem('api_base_url') || '').replace(/\/$/, '');
    if (base && raw.startsWith(base)) {
      const rest = raw.slice(base.length);
      return rest.startsWith('/') ? rest : `/${rest}`;
    }
  }
  return raw;
}

export function removeCachedMediaBlobByObjectId(objectId: string): void {
  removeCachedMediaBlobUrl(storageObjectPreviewCacheKey(objectId));
  const needle = `/media/object/${objectId}`;
  for (const key of [...store.keys()]) {
    if (key.includes(needle)) removeCachedMediaBlobUrl(key);
  }
}

export function getCachedMediaBlobUrl(key: string): string | undefined {
  const hit = store.get(key);
  if (!hit) return undefined;
  touch(key, hit);
  return hit.blobUrl;
}

export function setCachedMediaBlobUrl(key: string, blobUrl: string): string {
  const prev = store.get(key);
  if (prev && prev.blobUrl !== blobUrl && prev.blobUrl.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(prev.blobUrl);
    } catch {
      // ignore
    }
  }
  touch(key, { blobUrl, at: Date.now() });
  evictIfNeeded();
  return blobUrl;
}

export function removeCachedMediaBlobUrl(key: string) {
  const hit = store.get(key);
  if (hit?.blobUrl.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(hit.blobUrl);
    } catch {
      // ignore
    }
  }
  store.delete(key);
}

export function clearMediaBlobCache() {
  for (const entry of store.values()) {
    if (entry.blobUrl.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(entry.blobUrl);
      } catch {
        // ignore
      }
    }
  }
  store.clear();
}

/** 清除带 JWT 的媒体直链缓存（token 轮换后避免 401 黑屏） */
export function invalidateAuthenticatedMediaStreamCache(): void {
  for (const key of [...store.keys()]) {
    const hit = store.get(key);
    if (hit && !hit.blobUrl.startsWith('blob:')) {
      store.delete(key);
    }
  }
}
