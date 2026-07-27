import type { TFunction } from 'i18next';

const STATUS_KEYS: Record<string, string> = {
  pending: 'common.task.status.pending',
  queued: 'common.task.status.queued',
  processing: 'common.task.status.processing',
  completed: 'common.task.status.completed',
  failed: 'common.task.status.failed',
  cancelled: 'common.task.status.cancelled',
  awaiting_review: 'common.task.status.awaiting_review',
};

/** 任务列表状态徽章文案 */
export function getTaskStatusLabel(status: string | undefined, t: TFunction): string {
  const key = STATUS_KEYS[status ?? ''];
  if (key) return t(key);
  return status ?? t('common.task.status.pending');
}

export const TASK_STATUS_FILTER_KEYS = Object.keys(STATUS_KEYS);
