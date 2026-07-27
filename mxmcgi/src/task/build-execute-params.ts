/**
 * 从 cgi_tasks 落库字段还原 TaskExecutor.executeTask 所需 params
 */

import type { Task } from './types';
import type { ExecuteTaskOptions } from './task-executor';

const BATCH_PARENT_TYPES = new Set(['video-batch-parent', 'task-v2-batch-parent']);

export function buildExecuteOptionsFromTask(task: Task): ExecuteTaskOptions | null {
  if (BATCH_PARENT_TYPES.has(task.type)) {
    return null;
  }
  const rp = task.requestParams as Record<string, unknown> | undefined;
  if (!rp || typeof rp !== 'object') {
    return null;
  }

  const userId =
    (typeof rp.userId === 'string' && rp.userId) ||
    (typeof task.metadata?.userId === 'string' ? task.metadata.userId : undefined);
  const provider =
    (typeof rp.provider === 'string' && rp.provider) ||
    (typeof task.metadata?.provider === 'string' ? task.metadata.provider : undefined);
  const modelName =
    (typeof task.metadata?.model === 'string' && task.metadata.model) ||
    (typeof rp.model === 'string' ? rp.model : '');

  if (!userId || !modelName) {
    return null;
  }

  const storeToMinio = task.metadata?.storeToMinio !== false;

  return {
    taskId: task.id,
    modelName,
    provider: provider as ExecuteTaskOptions['provider'],
    params: { ...rp } as Record<string, any>,
    userId,
    storeToMinio,
  };
}
