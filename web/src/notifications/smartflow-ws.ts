import type { SmartflowExecutionItem } from '../api/client';

export function isSmartflowWsTask(task: Record<string, unknown>): boolean {
  const type = task.type ?? task.task_type;
  if (type === 'smartflow') return true;
  const meta = task.metadata;
  if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
    return (meta as Record<string, unknown>).task_type === 'smartflow';
  }
  return false;
}

/** 将 CGI/WS task 载荷转为 Smartflow 执行记录增量 */
export function wsPayloadToSmartflowExecutionPatch(
  task: Record<string, unknown>
): Partial<SmartflowExecutionItem> | null {
  if (!isSmartflowWsTask(task)) return null;

  const id = typeof task.id === 'string' ? task.id : '';
  if (!id) return null;

  const status = typeof task.status === 'string' ? task.status : 'pending';

  let progress: number | undefined;
  const progressRaw = task.progress;
  if (typeof progressRaw === 'number') {
    progress = progressRaw;
  } else if (progressRaw && typeof progressRaw === 'object' && !Array.isArray(progressRaw)) {
    const p = progressRaw as Record<string, unknown>;
    if (typeof p.progress === 'number') progress = p.progress;
  }

  const metaRaw = task.metadata;
  const metadata =
    metaRaw && typeof metaRaw === 'object' && !Array.isArray(metaRaw)
      ? (metaRaw as Record<string, unknown>)
      : {};

  const smartflowId =
    typeof metadata.smartflow_id === 'string'
      ? metadata.smartflow_id
      : typeof task.smartflow_id === 'string'
        ? task.smartflow_id
        : undefined;

  const errorMessage =
    typeof task.error === 'string'
      ? task.error
      : typeof metadata.error === 'string'
        ? metadata.error
        : undefined;

  return {
    id,
    status,
    progress,
    smartflow_id: smartflowId,
    user_id: typeof task.user_id === 'string' ? task.user_id : undefined,
    error_message: errorMessage,
    updated_at:
      typeof task.updatedAt === 'string'
        ? task.updatedAt
        : typeof task.updated_at === 'string'
          ? task.updated_at
          : undefined,
  };
}

export function mergeSmartflowExecution(
  prev: SmartflowExecutionItem,
  patch: Partial<SmartflowExecutionItem>
): SmartflowExecutionItem {
  return { ...prev, ...patch };
}
