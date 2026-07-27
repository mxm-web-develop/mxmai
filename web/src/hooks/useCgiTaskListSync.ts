import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { getTask, type WritingTaskItem } from '../api/client';
import { extractCgiTaskFromApiResponse } from '../notifications/task-snapshot';
import { mergeTaskIntoList } from '../utils/mergeTaskItem';
import { shouldShowInTaskList, type TaskListScope } from '../lib/taskListVisibility';
import { useGatewayTaskListSync } from './useGatewayTaskListSync';

export type CgiTaskListSyncOptions = {
  /** 当前列表页 scope；WS 推送的任务 type 不匹配时不写入列表 */
  listScope: TaskListScope;
  /** 额外过滤（在 listScope 校验之后） */
  shouldIncludeTask?: (task: WritingTaskItem) => boolean;
};

/**
 * 列表页通用：WS 增量 patch + 慢轮询兜底
 */
export function useCgiTaskListSync(
  enabled: boolean,
  setTasks: Dispatch<SetStateAction<WritingTaskItem[]>>,
  loadTasks: () => void,
  options: CgiTaskListSyncOptions
): { fetchTaskIntoList: (taskId: string) => Promise<void> } {
  const { listScope, shouldIncludeTask } = options;

  const includeTask = useCallback(
    (task: WritingTaskItem) => {
      if (!shouldShowInTaskList(task, listScope)) return false;
      if (shouldIncludeTask && !shouldIncludeTask(task)) return false;
      return true;
    },
    [listScope, shouldIncludeTask]
  );

  const fetchTaskIntoList = useCallback(
    async (taskId: string) => {
      const res = await getTask(taskId);
      const full = extractCgiTaskFromApiResponse(res.data);
      if (!full) return;
      if (!includeTask(full)) return;
      setTasks((prev) => mergeTaskIntoList(prev, full));
    },
    [setTasks, includeTask]
  );

  const onTaskPatch = useCallback(
    (patch: WritingTaskItem) => {
      if (!includeTask(patch)) return;
      setTasks((prev) => mergeTaskIntoList(prev, patch));
    },
    [setTasks, includeTask]
  );

  useGatewayTaskListSync({
    enabled,
    onTaskPatch,
    onTaskMissing: fetchTaskIntoList,
    slowPollRefresh: loadTasks,
  });

  return { fetchTaskIntoList };
}
