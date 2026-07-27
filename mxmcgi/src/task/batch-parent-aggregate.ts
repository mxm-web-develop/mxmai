/**
 * 批量父任务（video-batch-parent / task-v2-batch-parent）子任务状态聚合
 */
import type { Task } from './types';
import type { TaskManager } from './task-manager';

export const BATCH_PARENT_TASK_TYPES = new Set(['video-batch-parent', 'task-v2-batch-parent']);

export function getChildTaskIdsFromBatchParent(task: Task): string[] {
  const ids = task.metadata?.childTaskIds || task.result?.metadata?.childTaskIds;
  return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string' && x.length > 0) : [];
}

export async function summarizeBatchChildStatuses(
  taskManager: TaskManager,
  childTaskIds: string[]
): Promise<{ completedCount: number; failedCount: number; processingCount: number }> {
  let completedCount = 0;
  let failedCount = 0;
  let processingCount = 0;
  for (const childTaskId of childTaskIds) {
    try {
      const childTaskResponse = await taskManager.getTask(childTaskId);
      if (childTaskResponse?.task) {
        const childStatus = childTaskResponse.task.status;
        if (childStatus === 'completed') completedCount++;
        else if (childStatus === 'failed' || childStatus === 'cancelled' || childStatus === 'network_error') {
          failedCount++;
        } else if (childStatus === 'processing' || childStatus === 'queued' || childStatus === 'pending') {
          processingCount++;
        }
      }
    } catch {
      /* ignore per-child lookup errors */
    }
  }
  return { completedCount, failedCount, processingCount };
}

export async function tryCompleteBatchParentIfChildrenTerminal(
  taskManager: TaskManager,
  task: Task,
  childTaskIds: string[]
): Promise<boolean> {
  const { completedCount, failedCount, processingCount } = await summarizeBatchChildStatuses(
    taskManager,
    childTaskIds
  );
  const allTerminal = completedCount + failedCount === childTaskIds.length;
  if (!allTerminal) {
    if (processingCount > 0) return false;
    return false;
  }
  const storage = (taskManager as any).storage;
  if (!storage) return false;
  await storage.update(task.id, {
    status: 'completed',
    metadata: { ...task.metadata, childTaskIds },
    progress: { status: 'completed', progress: 100, completedAt: new Date(), error: undefined },
    result: task.result || { mediaUrls: [], metadata: { childTaskIds } },
  });
  return true;
}
