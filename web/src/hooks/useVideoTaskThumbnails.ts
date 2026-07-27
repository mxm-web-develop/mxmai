import { useCallback, useEffect, useRef, useState } from 'react';
import type { WritingTaskItem } from '../api/client';
import { fetchMediaBlobUrl } from '../api/client';
import { captureVideoPosterBlobUrl } from '../lib/captureVideoPoster';
import { getVideoTaskStaticPosterUrl } from '../lib/videoTaskPosterSource';
import { getAutocutFirstClipVideoUrl } from '../lib/autocutClipPreviews';
import { isTaskMediaReady } from '../utils/mergeTaskItem';
import {
  getCachedMediaBlobUrl,
  mediaBlobCacheKey,
  removeCachedMediaBlobUrl,
  setCachedMediaBlobUrl,
} from '../lib/mediaBlobCache';

const THUMB_ERROR = '__thumb_error__';
const MAX_CONCURRENT = 2;

type ThumbMap = Record<string, string>;

let globalInFlight = 0;
const globalQueue: Array<{ taskId: string; task: WritingTaskItem }> = [];
const globalPending = new Set<string>();
const waitersByTask = new Map<string, Array<(result: { ok: boolean; url?: string }) => void>>();

function flushWaiters(taskId: string, result: { ok: boolean; url?: string }) {
  const waiters = waitersByTask.get(taskId) ?? [];
  waitersByTask.delete(taskId);
  waiters.forEach((resolve) => resolve(result));
}

function pumpGlobalQueue() {
  while (globalInFlight < MAX_CONCURRENT && globalQueue.length > 0) {
    const item = globalQueue.shift();
    if (!item) break;
    const { taskId, task } = item;
    const cacheKey = mediaBlobCacheKey('video', taskId, 'preview');
    globalInFlight += 1;

    (async () => {
      const staticPoster = getVideoTaskStaticPosterUrl(task);
      if (staticPoster) {
        setCachedMediaBlobUrl(cacheKey, staticPoster);
        flushWaiters(taskId, { ok: true, url: staticPoster });
        return;
      }
      // 自动剪辑等未出成片的任务：用已生成片段视频本地截帧，避免请求最终成片导致 500
      const clipVideoUrl = getAutocutFirstClipVideoUrl(task);
      if (clipVideoUrl) {
        const posterUrl = await captureVideoPosterBlobUrl(clipVideoUrl);
        setCachedMediaBlobUrl(cacheKey, posterUrl);
        flushWaiters(taskId, { ok: true, url: posterUrl });
        return;
      }
      // 仅当最终媒体确实就绪时才请求成片流
      if (!isTaskMediaReady(task)) {
        flushWaiters(taskId, { ok: false });
        return;
      }
      const videoBlobUrl = await fetchMediaBlobUrl(taskId, 'video', {
        timeoutMs: 45000,
        useCache: true,
      });
      const posterUrl = await captureVideoPosterBlobUrl(videoBlobUrl);
      setCachedMediaBlobUrl(cacheKey, posterUrl);
      flushWaiters(taskId, { ok: true, url: posterUrl });
    })()
      .catch(() => {
        flushWaiters(taskId, { ok: false });
      })
      .finally(() => {
        globalInFlight -= 1;
        globalPending.delete(taskId);
        pumpGlobalQueue();
      });
  }
}

function enqueueThumbnail(taskId: string, task: WritingTaskItem): Promise<{ ok: boolean; url?: string }> {
  const cacheKey = mediaBlobCacheKey('video', taskId, 'preview');
  const cached = getCachedMediaBlobUrl(cacheKey);
  if (cached) return Promise.resolve({ ok: true, url: cached });

  const staticPoster = getVideoTaskStaticPosterUrl(task);
  if (staticPoster) {
    setCachedMediaBlobUrl(cacheKey, staticPoster);
    return Promise.resolve({ ok: true, url: staticPoster });
  }

  return new Promise((resolve) => {
    const list = waitersByTask.get(taskId) ?? [];
    list.push(resolve);
    waitersByTask.set(taskId, list);

    if (!globalPending.has(taskId)) {
      globalPending.add(taskId);
      globalQueue.push({ taskId, task });
      pumpGlobalQueue();
    }
  });
}

function buildThumbMapFromCache(taskIds: string[], taskById: Record<string, WritingTaskItem>): ThumbMap {
  const next: ThumbMap = {};
  for (const id of taskIds) {
    const cacheKey = mediaBlobCacheKey('video', id, 'preview');
    const hit = getCachedMediaBlobUrl(cacheKey);
    if (hit) {
      next[id] = hit;
      continue;
    }
    const task = taskById[id];
    if (task) {
      const staticPoster = getVideoTaskStaticPosterUrl(task);
      if (staticPoster) {
        setCachedMediaBlobUrl(cacheKey, staticPoster);
        next[id] = staticPoster;
      }
    }
  }
  return next;
}

export function useVideoTaskThumbnails(
  completedTaskIds: string[],
  taskById: Record<string, WritingTaskItem>
) {
  const [thumbMap, setThumbMap] = useState<ThumbMap>(() =>
    buildThumbMapFromCache(completedTaskIds, taskById)
  );
  const requestedRef = useRef<Set<string>>(new Set());

  const syncFromCache = useCallback(
    (ids: string[]) => {
      setThumbMap((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const id of ids) {
          const hit = getCachedMediaBlobUrl(mediaBlobCacheKey('video', id, 'preview'));
          if (hit && next[id] !== hit) {
            next[id] = hit;
            changed = true;
            continue;
          }
          const task = taskById[id];
          if (task && !next[id]) {
            const staticPoster = getVideoTaskStaticPosterUrl(task);
            if (staticPoster) {
              setCachedMediaBlobUrl(mediaBlobCacheKey('video', id, 'preview'), staticPoster);
              next[id] = staticPoster;
              changed = true;
            }
          }
        }
        return changed ? next : prev;
      });
    },
    [taskById]
  );

  const requestThumbnail = useCallback(
    async (taskId: string) => {
      if (requestedRef.current.has(taskId)) return;
      const cacheKey = mediaBlobCacheKey('video', taskId, 'preview');
      const cached = getCachedMediaBlobUrl(cacheKey);
      if (cached) {
        setThumbMap((prev) => (prev[taskId] === cached ? prev : { ...prev, [taskId]: cached }));
        return;
      }
      const task = taskById[taskId];
      if (!task) return;

      requestedRef.current.add(taskId);
      const result = await enqueueThumbnail(taskId, task);
      if (!result.ok) {
        setThumbMap((prev) =>
          prev[taskId] === THUMB_ERROR ? prev : { ...prev, [taskId]: THUMB_ERROR }
        );
        return;
      }
      const url = result.url ?? getCachedMediaBlobUrl(cacheKey);
      if (url) {
        setThumbMap((prev) => (prev[taskId] === url ? prev : { ...prev, [taskId]: url }));
      }
    },
    [taskById]
  );

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
          const cached = getCachedMediaBlobUrl(mediaBlobCacheKey('video', id, 'preview'));
          if (cached?.startsWith('blob:')) {
            try {
              URL.revokeObjectURL(cached);
            } catch {
              // ignore
            }
          }
          removeCachedMediaBlobUrl(mediaBlobCacheKey('video', id, 'preview'));
          delete next[id];
          requestedRef.current.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [completedTaskIds]);

  return { thumbMap, requestThumbnail };
}

export { THUMB_ERROR as VIDEO_THUMB_ERROR };
