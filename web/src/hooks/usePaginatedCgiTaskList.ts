import { useCallback, useEffect, useRef, useState } from 'react';
import type { WritingTaskItem } from '../api/client';
import { invalidateTaskListCache } from '../api/client';
import { mergeTaskItem } from '../utils/mergeTaskItem';

export const TASK_LIST_PAGE_SIZE = 24;

type FetchPageResult = { tasks: WritingTaskItem[]; total: number };

/**
 * 任务列表分页：首屏加载 + 滚动触底加载更多（与图片卡片网格一致）
 */
export function usePaginatedCgiTaskList(options: {
  enabled: boolean;
  pageSize?: number;
  /** 筛选条件变化时重置分页 */
  resetKey: string;
  fetchPage: (offset: number, limit: number) => Promise<FetchPageResult>;
}) {
  const { enabled, pageSize = TASK_LIST_PAGE_SIZE, resetKey, fetchPage } = options;

  const [tasks, setTasks] = useState<WritingTaskItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loadingInitial, setLoadingInitial] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const hasInitialLoadedRef = useRef(false);
  const fetchPageRef = useRef(fetchPage);
  fetchPageRef.current = fetchPage;

  const hasMore = tasks.length < total;

  const mergeTasks = useCallback((prev: WritingTaskItem[], incoming: WritingTaskItem[]) => {
    const map = new Map(prev.map((t) => [t.id, t]));
    for (const next of incoming) {
      const old = map.get(next.id);
      map.set(next.id, old ? mergeTaskItem(old, next) : next);
    }
    return [...map.values()].sort(
      (a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
    );
  }, []);

  const loadInitial = useCallback(async () => {
    if (!enabled) return;
    if (!hasInitialLoadedRef.current) setLoadingInitial(true);
    try {
      const { tasks: pageTasks, total: pageTotal } = await fetchPageRef.current(0, pageSize);
      setTasks((prev) => {
        if (prev.length === 0) return pageTasks;
        const prevMap = new Map(prev.map((t) => [t.id, t]));
        return pageTasks.map((next) => {
          const old = prevMap.get(next.id);
          return old ? mergeTaskItem(old, next) : next;
        });
      });
      setTotal(pageTotal);
    } catch (e) {
      console.error('[usePaginatedCgiTaskList] loadInitial failed', e);
      if (!hasInitialLoadedRef.current) {
        setTasks([]);
        setTotal(0);
      }
    } finally {
      hasInitialLoadedRef.current = true;
      setLoadingInitial(false);
    }
  }, [enabled, pageSize]);

  const loadMore = useCallback(async () => {
    if (!enabled || loadingMore || loadingInitial || !hasMore) return;
    setLoadingMore(true);
    try {
      const { tasks: pageTasks, total: pageTotal } = await fetchPageRef.current(tasks.length, pageSize);
      setTotal(pageTotal);
      setTasks((prev) => mergeTasks(prev, pageTasks));
    } catch (e) {
      console.error('[usePaginatedCgiTaskList] loadMore failed', e);
    } finally {
      setLoadingMore(false);
    }
  }, [enabled, hasMore, loadingInitial, loadingMore, mergeTasks, pageSize, tasks.length]);

  const refresh = useCallback(async () => {
    invalidateTaskListCache();
    hasInitialLoadedRef.current = false;
    await loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    if (!enabled) {
      setTasks([]);
      setTotal(0);
      hasInitialLoadedRef.current = false;
      return;
    }
    hasInitialLoadedRef.current = false;
    void loadInitial();
  }, [enabled, resetKey, loadInitial]);

  return {
    tasks,
    setTasks,
    total,
    hasMore,
    loadingInitial,
    loadingMore,
    loadMore,
    refresh,
  };
}
