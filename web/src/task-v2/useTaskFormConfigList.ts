import { useEffect, useState } from 'react';
import { getTaskFormConfigList, type TaskFormConfigListItem } from '../api/client';
import type { TaskV2Scope } from './useTaskV2FormConfig';

export type UseTaskFormConfigListOptions = {
  scope: TaskV2Scope;
  enabled?: boolean;
};

/** 仅拉取 form-config/list，不维护表单状态（列表筛选/标签展示用） */
export function useTaskFormConfigList(options: UseTaskFormConfigListOptions) {
  const { scope, enabled = true } = options;
  const [taskOptions, setTaskOptions] = useState<TaskFormConfigListItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await getTaskFormConfigList({ scope });
        const data =
          (res.data as { data?: { items: TaskFormConfigListItem[] } })?.data ??
          (res.data as { items?: TaskFormConfigListItem[] } | undefined);
        const items = Array.isArray(data?.items) ? data!.items! : [];
        if (!cancelled) setTaskOptions(items);
      } catch {
        if (!cancelled) setTaskOptions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, scope]);

  return { taskOptions, loading };
}
