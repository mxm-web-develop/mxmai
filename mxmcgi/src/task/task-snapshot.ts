/**
 * 任务列表/WS 推送用最小快照（不含大 base64）
 */
import type { Task, TaskStatus, TaskType } from './types';
import { readProgressUxFromMetadata } from './progress-ux';
import { extractContentPreviewFromResult } from './task-list-summary';

export interface TaskProgressSnapshot {
  status: TaskStatus;
  progress?: number;
  error?: string;
  /** 当前阶段人话，如「检索资讯中…」 */
  message?: string;
  phase?: string;
  phaseIndex?: number;
  phaseTotal?: number;
}

export interface TaskSnapshot {
  id: string;
  type: TaskType;
  status: TaskStatus;
  progress: TaskProgressSnapshot;
  metadata?: {
    label?: string;
    model?: string;
    provider?: string;
    userId?: string;
    [key: string]: unknown;
  };
  createdAt: string;
  updatedAt: string;
  /** 终态：是否有可拉取的结果（文稿预览或媒体） */
  hasResult?: boolean;
  mediaCount?: number;
  /** 写作卡片刊头/摘要（短文本，来自 listContentPreview 或 result） */
  contentPreview?: string;
}

export function buildTaskSnapshot(task: Task): TaskSnapshot {
  const ux =
    readProgressUxFromMetadata(task.metadata as Record<string, unknown> | undefined) ??
    ({
      message: task.progress.message,
      phase: task.progress.phase,
      phaseIndex: task.progress.phaseIndex,
      phaseTotal: task.progress.phaseTotal,
    } as const);

  const snap: TaskSnapshot = {
    id: task.id,
    type: task.type,
    status: task.status,
    progress: {
      status: task.status,
      progress: task.progress.progress,
      error: task.progress.error,
      ...(typeof ux.message === 'string' && ux.message.trim() ? { message: ux.message.trim() } : {}),
      ...(typeof ux.phase === 'string' && ux.phase ? { phase: ux.phase } : {}),
      ...(typeof ux.phaseIndex === 'number' ? { phaseIndex: ux.phaseIndex } : {}),
      ...(typeof ux.phaseTotal === 'number' ? { phaseTotal: ux.phaseTotal } : {}),
    },
    metadata: {
      label: task.metadata?.label,
      model: task.metadata?.model,
      provider: task.metadata?.provider,
      userId: task.metadata?.userId,
    },
    createdAt:
      task.createdAt instanceof Date ? task.createdAt.toISOString() : String(task.createdAt),
    updatedAt:
      task.updatedAt instanceof Date ? task.updatedAt.toISOString() : String(task.updatedAt),
  };

  const meta = task.metadata as Record<string, unknown> | undefined;
  const fromMeta =
    typeof meta?.listContentPreview === 'string' ? meta.listContentPreview.trim() : '';
  const fromResult = extractContentPreviewFromResult(task.result);
  const contentPreview = fromMeta || fromResult;
  if (contentPreview) {
    snap.contentPreview = contentPreview;
    snap.hasResult = true;
  }

  const mediaCount = task.result?.mediaUrls?.length
    ? task.result.mediaUrls.length
    : Array.isArray(task.result?.storageInfo?.keys)
      ? task.result!.storageInfo!.keys!.length
      : 0;
  if (mediaCount > 0) {
    snap.hasResult = true;
    snap.mediaCount = mediaCount;
  }

  return snap;
}

export function isTerminalTaskStatus(status: TaskStatus): boolean {
  return (
    status === 'completed' ||
    status === 'failed' ||
    status === 'cancelled' ||
    status === 'network_error'
  );
}
