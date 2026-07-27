/**
 * Task V2 多份子任务：上游失败时自动重试（最多 3 次）
 *
 * 视频 scope 禁止自动重试：Seedance 等按次计费，失败应由用户显式重试。
 */
import { taskExecutor } from '../task/task-executor';
import type { Task } from '../task/types';

export const PARALLEL_CHILD_MAX_RETRIES = 3;

function isVideoTaskType(type: string | undefined): boolean {
  return type === 'video' || type === 'video-batch-parent';
}

export function readParallelChildContext(task: Task): {
  parentTaskId?: string;
  parallelIndex?: number;
  parallelTotal?: number;
  retryCount: number;
} {
  const rp = (task.requestParams ?? {}) as Record<string, unknown>;
  const innerParams =
    rp.params && typeof rp.params === 'object' ? (rp.params as Record<string, unknown>) : {};
  const innerMeta =
    innerParams.metadata && typeof innerParams.metadata === 'object'
      ? (innerParams.metadata as Record<string, unknown>)
      : {};
  const meta = (task.metadata ?? {}) as Record<string, unknown>;

  const parentTaskId =
    (typeof meta.parentTaskId === 'string' && meta.parentTaskId) ||
    (typeof innerMeta.parentTaskId === 'string' && innerMeta.parentTaskId) ||
    (typeof innerMeta.batchId === 'string' && innerMeta.batchId) ||
    undefined;

  const parallelIndex =
    typeof meta.parallelIndex === 'number'
      ? meta.parallelIndex
      : typeof innerMeta.parallelIndex === 'number'
        ? innerMeta.parallelIndex
        : undefined;

  const parallelTotal =
    typeof meta.parallelTotal === 'number'
      ? meta.parallelTotal
      : typeof innerMeta.parallelTotal === 'number'
        ? innerMeta.parallelTotal
        : undefined;

  const retryCount = Number(meta.parallelRetryCount ?? innerMeta.parallelRetryCount ?? 0) || 0;

  return { parentTaskId, parallelIndex, parallelTotal, retryCount };
}

/**
 * 若为批量子任务且未超重试上限，重置为 pending 供 worker 再次领取。
 * @returns true 表示已调度重试，调用方不应再将任务标为终态 failed
 */
export async function maybeScheduleParallelChildRetry(
  taskId: string,
  task: Task,
  errorMessage: string
): Promise<boolean> {
  if (isVideoTaskType(task.type)) {
    console.warn(
      `[ParallelChildRetry] 视频任务禁止自动重试（避免重复计费）: ${taskId} type=${task.type} err=${errorMessage.slice(0, 160)}`
    );
    return false;
  }

  const ctx = readParallelChildContext(task);
  if (!ctx.parentTaskId) return false;
  if (ctx.retryCount >= PARALLEL_CHILD_MAX_RETRIES) {
    console.warn(
      `[ParallelChildRetry] 子任务 ${taskId} 已达重试上限 ${PARALLEL_CHILD_MAX_RETRIES}，不再重试: ${errorMessage}`
    );
    return false;
  }

  const taskManager = taskExecutor.getTaskManager();
  const storage = (taskManager as any).storage;
  const nextRetry = ctx.retryCount + 1;

  await taskManager.updateTaskStatus(taskId, 'pending', {
    progress: 0,
    error: undefined,
  });

  if (storage) {
    const snap = await taskManager.getTask(taskId);
    const existingMeta = (snap?.task?.metadata ?? {}) as Record<string, unknown>;
    await storage.update(taskId, {
      metadata: {
        ...existingMeta,
        parentTaskId: ctx.parentTaskId,
        parallelIndex: ctx.parallelIndex,
        parallelTotal: ctx.parallelTotal,
        batchId: ctx.parentTaskId,
        parallelRetryCount: nextRetry,
        lastParallelRetryError: errorMessage.slice(0, 500),
        lastParallelRetryAt: new Date().toISOString(),
      },
    });
  }

  console.log(
    `[ParallelChildRetry] 子任务 ${taskId} 已调度第 ${nextRetry}/${PARALLEL_CHILD_MAX_RETRIES} 次重试（父任务 ${ctx.parentTaskId}）`
  );
  return true;
}
