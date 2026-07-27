import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchMediaBlobUrl } from '../api/client';
import {
  getCachedMediaBlobUrl,
  mediaBlobCacheKey,
  removeCachedMediaBlobUrl,
  setCachedMediaBlobUrl,
} from '../lib/mediaBlobCache';

const THUMB_ERROR = '__thumb_error__';
const MAX_CONCURRENT = 4;
const PREVIEW_WIDTH = 240;
/** 图集叠放最多再拉几张辅图（封面另算） */
const ALBUM_EXTRA_THUMBS = 2;

type ThumbMap = Record<string, string>;
/** taskId → index → blob url（不含 0，0 在 thumbMap） */
type AlbumThumbsMap = Record<string, string[]>;

type QueueItem = { taskId: string; index: number };

let globalInFlight = 0;
const globalQueue: QueueItem[] = [];
const globalPending = new Set<string>();
const waitersByKey = new Map<string, Array<(result: { ok: boolean }) => void>>();

function queueKey(taskId: string, index: number) {
  return `${taskId}#${index}`;
}

function flushWaiters(key: string, result: { ok: boolean }) {
  const waiters = waitersByKey.get(key) ?? [];
  waitersByKey.delete(key);
  waiters.forEach((resolve) => resolve(result));
}

function pumpGlobalQueue() {
  while (globalInFlight < MAX_CONCURRENT && globalQueue.length > 0) {
    const item = globalQueue.shift();
    if (!item) break;
    const { taskId, index } = item;
    const key = queueKey(taskId, index);
    const cacheKey = mediaBlobCacheKey('graph', taskId, 'preview', index);
    globalInFlight += 1;
    fetchMediaBlobUrl(taskId, 'graph', {
      preview: true,
      previewWidth: PREVIEW_WIDTH,
      index,
    })
      .then((url) => {
        setCachedMediaBlobUrl(cacheKey, url);
        flushWaiters(key, { ok: true });
      })
      .catch(() => {
        flushWaiters(key, { ok: false });
      })
      .finally(() => {
        globalInFlight -= 1;
        globalPending.delete(key);
        pumpGlobalQueue();
      });
  }
}

function enqueueThumbnail(taskId: string, index = 0): Promise<{ ok: boolean }> {
  const cacheKey = mediaBlobCacheKey('graph', taskId, 'preview', index);
  if (getCachedMediaBlobUrl(cacheKey)) return Promise.resolve({ ok: true });

  const key = queueKey(taskId, index);
  return new Promise((resolve) => {
    const list = waitersByKey.get(key) ?? [];
    list.push(resolve);
    waitersByKey.set(key, list);

    if (!globalPending.has(key)) {
      globalPending.add(key);
      globalQueue.push({ taskId, index });
      pumpGlobalQueue();
    }
  });
}

function buildThumbMapFromCache(taskIds: string[]): ThumbMap {
  const next: ThumbMap = {};
  for (const id of taskIds) {
    const hit = getCachedMediaBlobUrl(mediaBlobCacheKey('graph', id, 'preview', 0));
    if (hit) next[id] = hit;
  }
  return next;
}

function buildAlbumThumbsFromCache(taskIds: string[], counts: Record<string, number>): AlbumThumbsMap {
  const next: AlbumThumbsMap = {};
  for (const id of taskIds) {
    const mediaCount = counts[id] ?? 1;
    const extras: string[] = [];
    const maxExtra = Math.min(ALBUM_EXTRA_THUMBS, Math.max(0, mediaCount - 1));
    for (let i = 1; i <= maxExtra; i++) {
      const hit = getCachedMediaBlobUrl(mediaBlobCacheKey('graph', id, 'preview', i));
      if (hit) extras.push(hit);
    }
    if (extras.length) next[id] = extras;
  }
  return next;
}

export type GraphThumbRequestOptions = {
  /** 媒体张数；>1 时额外预取叠放辅图 */
  mediaCount?: number;
};

/**
 * 图片任务列表缩略图：会话缓存 + 懒加载 + 并发限制 + preview 小图
 * 图集可同时拿到封面 + 最多 2 张辅图用于叠放
 */
export function useGraphTaskThumbnails(completedTaskIds: string[]) {
  const [thumbMap, setThumbMap] = useState<ThumbMap>(() => buildThumbMapFromCache(completedTaskIds));
  const [albumThumbsMap, setAlbumThumbsMap] = useState<AlbumThumbsMap>({});
  const requestedRef = useRef<Set<string>>(new Set());
  const mediaCountRef = useRef<Record<string, number>>({});

  const syncFromCache = useCallback((ids: string[]) => {
    setThumbMap((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const id of ids) {
        const hit = getCachedMediaBlobUrl(mediaBlobCacheKey('graph', id, 'preview', 0));
        if (hit && next[id] !== hit) {
          next[id] = hit;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    setAlbumThumbsMap((prev) => {
      const fromCache = buildAlbumThumbsFromCache(ids, mediaCountRef.current);
      let changed = false;
      const next = { ...prev };
      for (const id of ids) {
        const urls = fromCache[id];
        if (!urls?.length) continue;
        const cur = next[id] ?? [];
        if (urls.join('|') !== cur.join('|')) {
          next[id] = urls;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  const requestThumbnail = useCallback(async (taskId: string, options?: GraphThumbRequestOptions) => {
    const mediaCount = Math.max(1, options?.mediaCount ?? mediaCountRef.current[taskId] ?? 1);
    mediaCountRef.current[taskId] = mediaCount;

    const indices = [0];
    const extra = Math.min(ALBUM_EXTRA_THUMBS, mediaCount - 1);
    for (let i = 1; i <= extra; i++) indices.push(i);

    for (const index of indices) {
      const reqKey = queueKey(taskId, index);
      if (requestedRef.current.has(reqKey)) continue;

      const cacheKey = mediaBlobCacheKey('graph', taskId, 'preview', index);
      const cached = getCachedMediaBlobUrl(cacheKey);
      if (cached) {
        if (index === 0) {
          setThumbMap((prev) => (prev[taskId] === cached ? prev : { ...prev, [taskId]: cached }));
        } else {
          setAlbumThumbsMap((prev) => {
            const cur = prev[taskId] ?? [];
            const nextArr = [...cur];
            nextArr[index - 1] = cached;
            return { ...prev, [taskId]: nextArr.filter(Boolean) };
          });
        }
        requestedRef.current.add(reqKey);
        continue;
      }

      requestedRef.current.add(reqKey);
      const result = await enqueueThumbnail(taskId, index);
      if (!result.ok) {
        if (index === 0) {
          setThumbMap((prev) =>
            prev[taskId] === THUMB_ERROR ? prev : { ...prev, [taskId]: THUMB_ERROR }
          );
        }
        continue;
      }
      const url = getCachedMediaBlobUrl(cacheKey);
      if (!url) continue;
      if (index === 0) {
        setThumbMap((prev) => (prev[taskId] === url ? prev : { ...prev, [taskId]: url }));
      } else {
        setAlbumThumbsMap((prev) => {
          const cur = [...(prev[taskId] ?? [])];
          cur[index - 1] = url;
          return { ...prev, [taskId]: cur.filter(Boolean) };
        });
      }
    }
  }, []);

  useEffect(() => {
    syncFromCache(completedTaskIds);
  }, [completedTaskIds, syncFromCache]);

  useEffect(() => {
    const alive = new Set(completedTaskIds);
    setThumbMap((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const id of Object.keys(prev)) {
        if (!alive.has(id)) {
          removeCachedMediaBlobUrl(mediaBlobCacheKey('graph', id, 'preview', 0));
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    setAlbumThumbsMap((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const id of Object.keys(prev)) {
        if (!alive.has(id)) {
          for (let i = 1; i <= ALBUM_EXTRA_THUMBS; i++) {
            removeCachedMediaBlobUrl(mediaBlobCacheKey('graph', id, 'preview', i));
            requestedRef.current.delete(queueKey(id, i));
          }
          requestedRef.current.delete(queueKey(id, 0));
          delete next[id];
          delete mediaCountRef.current[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [completedTaskIds]);

  return { thumbMap, albumThumbsMap, requestThumbnail };
}

export { THUMB_ERROR as GRAPH_THUMB_ERROR };
