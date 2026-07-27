/**
 * 统一任务快照通知 + Redis 发布（节流）
 */
import type { Task, TaskStatus } from './types';
import { buildTaskSnapshot, isTerminalTaskStatus } from './task-snapshot';
import { sendTaskStatusNotification } from './notification-hook';
import { publishTaskEvent } from './task-event-bus';
import { isInternalListTask } from './task-list-visibility';

const PROGRESS_NOTIFY_MIN_MS = Number(process.env.TASK_PROGRESS_NOTIFY_MIN_MS || 5000);
const PROGRESS_NOTIFY_STEP = Number(process.env.TASK_PROGRESS_NOTIFY_STEP || 10);

const progressThrottle = new Map<string, { lastAt: number; lastProgress: number }>();
/** queued/processing 各推一次 */
const statusMilestoneSent = new Map<string, Set<TaskStatus>>();

function milestoneKey(taskId: string): string {
  return taskId;
}

function shouldSendProgressNotify(taskId: string, progress?: number): boolean {
  const p = progress ?? 0;
  const now = Date.now();
  const prev = progressThrottle.get(taskId);
  if (!prev) {
    progressThrottle.set(taskId, { lastAt: now, lastProgress: p });
    return true;
  }
  const elapsed = now - prev.lastAt;
  const stepCrossed =
    Math.floor(p / PROGRESS_NOTIFY_STEP) > Math.floor(prev.lastProgress / PROGRESS_NOTIFY_STEP);
  if (elapsed >= PROGRESS_NOTIFY_MIN_MS || stepCrossed) {
    progressThrottle.set(taskId, { lastAt: now, lastProgress: p });
    return true;
  }
  return false;
}

function shouldSendStatusMilestone(taskId: string, status: TaskStatus): boolean {
  if (status !== 'queued' && status !== 'processing') return true;
  const key = milestoneKey(taskId);
  let set = statusMilestoneSent.get(key);
  if (!set) {
    set = new Set();
    statusMilestoneSent.set(key, set);
  }
  if (set.has(status)) return false;
  set.add(status);
  return true;
}

function statusMessageFor(task: Task, status: TaskStatus, override?: string): string {
  if (override) return override;
  switch (status) {
    case 'pending':
      return '任务已创建';
    case 'queued':
      return '任务已排队';
    case 'processing':
      return task.progress.progress != null
        ? `正在生成中（${task.progress.progress}%）`
        : '正在生成中';
    case 'completed':
      return '任务已完成';
    case 'failed':
      return task.progress.error || '任务失败';
    case 'cancelled':
      return '任务已取消';
    default:
      return `任务状态：${status}`;
  }
}

export type NotifyReason = 'create' | 'status' | 'progress' | 'terminal';

/**
 * 发送任务快照通知（mxmnotify + Redis），带节流
 */
export async function maybeNotifyTaskSnapshot(
  task: Task,
  status: TaskStatus,
  options?: { statusMessage?: string; reason?: NotifyReason; force?: boolean }
): Promise<void> {
  if (!task.metadata?.userId) return;

  if (
    isInternalListTask({
      type: task.type,
      metadata: task.metadata,
      requestParams: task.requestParams as Record<string, unknown> | undefined,
    })
  ) {
    return;
  }

  const reason = options?.reason ?? 'status';
  const force = options?.force === true;

  if (reason === 'progress') {
    if (!force && !shouldSendProgressNotify(task.id, task.progress.progress)) {
      return;
    }
  } else if (status === 'queued' || status === 'processing') {
    if (!force && !shouldSendStatusMilestone(task.id, status)) {
      return;
    }
  }

  if (isTerminalTaskStatus(status)) {
    progressThrottle.delete(task.id);
    statusMilestoneSent.delete(milestoneKey(task.id));
  }

  const statusMessage = statusMessageFor(task, status, options?.statusMessage);
  const snapshot = buildTaskSnapshot(task);

  publishTaskEvent(task.id, snapshot).catch((e) => {
    console.warn('[TaskNotify] Redis publish failed:', e instanceof Error ? e.message : e);
  });

  await sendTaskStatusNotification(task, status, statusMessage, snapshot);
}
