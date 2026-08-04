import type { WritingTaskItem } from '../api/client';
import { isTerminalTaskStatus } from '../notifications/task-snapshot';
import i18n from '../i18n/config';

const STATUS_FORWARD = new Set(['pending', 'queued', 'processing', 'awaiting_review']);

/** 非终态下的单调顺序，防止 WS/轮询乱序把 processing 倒回 queued */
const STATUS_RANK: Record<string, number> = {
  pending: 0,
  queued: 1,
  processing: 2,
  awaiting_review: 3,
};

function previewOfResult(result: WritingTaskItem['result'] | undefined): string {
  if (!result) return '';
  const cp = typeof result.contentPreview === 'string' ? result.contentPreview.trim() : '';
  if (cp) return cp;
  const text = result.metadata?.text;
  return typeof text === 'string' ? text.trim() : '';
}

/** 合并 result：保留更丰富的 contentPreview / text，避免 WS 空壳覆盖列表摘要 */
export function mergeTaskResult(
  prev: WritingTaskItem['result'] | undefined,
  next: WritingTaskItem['result'] | undefined
): WritingTaskItem['result'] | undefined {
  if (!next) return prev;
  if (!prev) return next;
  const prevPreview = previewOfResult(prev);
  const nextPreview = previewOfResult(next);
  const contentPreview = nextPreview || prevPreview || undefined;
  const prevText = typeof prev.metadata?.text === 'string' ? prev.metadata.text : '';
  const nextText = typeof next.metadata?.text === 'string' ? next.metadata.text : '';
  const text = nextText || prevText || undefined;
  return {
    ...prev,
    ...next,
    ...(contentPreview ? { contentPreview } : {}),
    hasMedia: next.hasMedia ?? prev.hasMedia,
    mediaCount: next.mediaCount ?? prev.mediaCount,
    metadata: {
      ...prev.metadata,
      ...next.metadata,
      ...(text ? { text } : {}),
    },
  };
}

/** 合并任务行，无变化时返回 prev 引用 */
export function mergeTaskItem(prev: WritingTaskItem, next: WritingTaskItem): WritingTaskItem {
  const mergedStatus = mergeTaskStatus(prev.status, next.status);
  const mergedProgress = mergeTaskProgress(prev.progress, next.progress, mergedStatus);
  const mergedResult = mergeTaskResult(prev.result, next.result);

  const sameStatus = prev.status === mergedStatus;
  const sameCreated = prev.createdAt === next.createdAt;
  const sameProgress =
    prev.progress?.progress === mergedProgress?.progress &&
    prev.progress?.status === mergedProgress?.status &&
    prev.progress?.error === mergedProgress?.error &&
    prev.progress?.message === mergedProgress?.message &&
    prev.progress?.phase === mergedProgress?.phase &&
    prev.progress?.phaseIndex === mergedProgress?.phaseIndex;
  const sameResult =
    previewOfResult(prev.result) === previewOfResult(mergedResult) &&
    prev.result?.hasMedia === mergedResult?.hasMedia &&
    prev.result?.mediaCount === mergedResult?.mediaCount;

  if (sameStatus && sameCreated && sameProgress && sameResult && prev.type === next.type) {
    return prev;
  }

  return {
    ...prev,
    ...next,
    status: mergedStatus,
    progress: mergedProgress,
    metadata: { ...prev.metadata, ...next.metadata },
    result: mergedResult,
    requestParams: next.requestParams ?? prev.requestParams,
  };
}

/** 禁止 WS 增量把已 processing/终态 的任务倒回 awaiting_review */
function mergeTaskStatus(prev?: string, next?: string): string {
  const p = prev ?? 'pending';
  const n = next ?? p;
  if (isTerminalTaskStatus(p)) return p;
  if (isTerminalTaskStatus(n)) return n;
  if (n === 'awaiting_review' && (p === 'processing' || p === 'pending' || p === 'queued')) {
    return p;
  }
  // 审核通过后续跑 post 步骤：awaiting_review → processing
  if (p === 'awaiting_review' && n === 'processing') {
    return n;
  }
  const pRank = STATUS_RANK[p];
  const nRank = STATUS_RANK[n];
  if (pRank != null && nRank != null) {
    return pRank >= nRank ? p : n;
  }
  if (STATUS_FORWARD.has(n)) return n;
  return n || p;
}

function mergeTaskProgress(
  prev: WritingTaskItem['progress'],
  next: WritingTaskItem['progress'],
  topStatus: string
): WritingTaskItem['progress'] {
  const base = next ?? prev;
  if (!base && !prev) return undefined;
  const merged = { ...(prev ?? {}), ...(base ?? {}) } as NonNullable<WritingTaskItem['progress']>;
  merged.status = topStatus as NonNullable<WritingTaskItem['progress']>['status'];
  const prevPct = typeof prev?.progress === 'number' ? prev.progress : 0;
  const nextPct = typeof next?.progress === 'number' ? next.progress : prevPct;
  if (isTerminalTaskStatus(topStatus)) {
    merged.progress =
      topStatus === 'completed' ? Math.max(prevPct, nextPct, 100) : nextPct;
  } else {
    merged.progress = Math.max(prevPct, nextPct);
  }
  if (topStatus !== 'failed' && topStatus !== 'network_error') {
    merged.error = undefined;
  }
  // 阶段文案取较新一侧；百分比仍单调
  if (typeof next?.message === 'string' && next.message.trim()) {
    merged.message = next.message.trim();
  } else if (typeof prev?.message === 'string') {
    merged.message = prev.message;
  }
  if (typeof next?.phase === 'string' && next.phase) {
    merged.phase = next.phase;
  } else if (typeof prev?.phase === 'string') {
    merged.phase = prev.phase;
  }
  // phaseIndex：有明确 next 时跟 next（避免旧高值把五段永久点满）；仅缺 next 时保留 prev
  if (typeof next?.phaseIndex === 'number' && Number.isFinite(next.phaseIndex)) {
    merged.phaseIndex = next.phaseIndex;
  } else if (typeof prev?.phaseIndex === 'number') {
    merged.phaseIndex = prev.phaseIndex;
  }
  if (typeof next?.phaseTotal === 'number') {
    merged.phaseTotal = next.phaseTotal;
  } else if (typeof prev?.phaseTotal === 'number') {
    merged.phaseTotal = prev.phaseTotal;
  }
  return merged;
}

function taskHasMediaOutput(task: WritingTaskItem): boolean {
  const result = task.result as
    | { hasMedia?: boolean; mediaCount?: number; mediaUrls?: string[] }
    | undefined;
  if (result?.hasMedia === true || (result?.mediaCount ?? 0) > 0) return true;
  return Array.isArray(result?.mediaUrls) && result.mediaUrls.length > 0;
}

function hasWritingContentPreview(task: WritingTaskItem): boolean {
  const cp = task.result?.contentPreview;
  if (typeof cp === 'string' && cp.trim().length >= 40) return true;
  const meta = task.metadata as { listContentPreview?: unknown } | undefined;
  return typeof meta?.listContentPreview === 'string' && meta.listContentPreview.trim().length >= 40;
}

function readManualReviewGate(
  task: WritingTaskItem | null
): { gateId?: string; kind?: string; label?: string; index?: number; totalGates?: number } | null {
  if (!task) return null;
  const gate = (
    task.metadata as { manualReviewGate?: { gateId?: string; kind?: string; label?: string; index?: number; totalGates?: number } } | undefined
  )?.manualReviewGate;
  return gate?.gateId ? gate : null;
}

/** pre 交互卡 / 分步表：等用户补信息，不是人工审核 */
export function isUserInputGateKind(kind: string | undefined | null): boolean {
  return kind === 'interactive-card' || kind === 'basic-form';
}

/** 仍挂「真」人工审核闸门、且尚无最终媒体产出（不含交互卡） */
export function hasPendingManualReviewGate(task: WritingTaskItem | null): boolean {
  if (!task) return false;
  const gate = readManualReviewGate(task);
  if (!gate?.gateId) return false;
  if (isUserInputGateKind(gate.kind)) return false;
  if (taskHasMediaOutput(task)) return false;

  const st = task.status ?? '';
  if (st === 'failed' || st === 'cancelled' || st === 'network_error') return false;

  // 文本类业务完成后常残留 manualReviewGate；无 mediaUrls，不能据此再开审核弹窗
  // video-timeline 例外：status 可能已是 completed 但仍需成片审核（尚无媒体）
  if (st === 'completed') {
    return gate.kind === 'video-timeline';
  }

  return true;
}

/** 仍挂交互卡 / basic-form，等用户补全 */
export function hasPendingUserInputGate(task: WritingTaskItem | null): boolean {
  if (!task) return false;
  const gate = readManualReviewGate(task);
  if (!gate?.gateId || !isUserInputGateKind(gate.kind)) return false;
  if (taskHasMediaOutput(task)) return false;
  const st = task.status ?? '';
  if (st === 'failed' || st === 'cancelled' || st === 'network_error' || st === 'completed') {
    return false;
  }
  return true;
}

/** 列表展示用：修正陈旧行；交互卡不得显示成「待审核」 */
export function resolveTaskListStatus(task: WritingTaskItem): string {
  const raw = task.status ?? 'pending';

  if (hasPendingUserInputGate(task)) {
    return 'awaiting_user_input';
  }

  if (hasPendingManualReviewGate(task)) {
    return 'awaiting_review';
  }

  // 本地列表未收到终态推送，但产出已齐全（写作 mediaUrls / 摘要）
  if (
    (raw === 'processing' || raw === 'pending' || raw === 'queued') &&
    (taskHasMediaOutput(task) || hasWritingContentPreview(task))
  ) {
    const pct = task.progress?.progress ?? 0;
    if (pct >= 100 || Boolean(task.progress?.completedAt)) {
      return 'completed';
    }
  }

  if (raw !== 'awaiting_review') return raw;

  const result = task.result as
    | {
        hasMedia?: boolean;
        mediaCount?: number;
        metadata?: { hasResult?: boolean };
        mediaUrls?: string[];
      }
    | undefined;

  if (result?.hasMedia === true || (result?.mediaCount ?? 0) > 0) {
    return 'completed';
  }

  const pct = task.progress?.progress ?? 0;
  const hasResult =
    result?.metadata?.hasResult === true ||
    (Array.isArray(result?.mediaUrls) && result.mediaUrls.length > 0);

  if (pct >= 100 || hasResult || task.progress?.completedAt) {
    return 'completed';
  }

  return raw;
}

/** 列表状态徽章用短文案，避免撑破卡片；完整说明见 formatManualReviewProgressDetail */
export function formatManualReviewProgressLabel(task: WritingTaskItem): string | null {
  if (resolveTaskListStatus(task) !== 'awaiting_review') return null;
  const gate = (task.metadata as { manualReviewGate?: { label?: string; index?: number; totalGates?: number } })
    ?.manualReviewGate;
  if (gate?.index && gate.totalGates) {
    return i18n.t('common.task.status.awaiting_review_progress', {
      index: gate.index,
      total: gate.totalGates,
    });
  }
  return i18n.t('common.task.status.awaiting_review');
}

/** 悬浮提示用完整审核阶段说明 */
export function formatManualReviewProgressDetail(task: WritingTaskItem): string | null {
  if (resolveTaskListStatus(task) !== 'awaiting_review') return null;
  const gate = (task.metadata as { manualReviewGate?: { label?: string; index?: number; totalGates?: number } })
    ?.manualReviewGate;
  if (!gate?.label) return i18n.t('common.task.status.awaiting_review');
  const idx =
    gate.index && gate.totalGates ? ` (${gate.index}/${gate.totalGates})` : '';
  return i18n.t('common.task.status.awaiting_review_detail', {
    label: gate.label,
    index: idx,
  });
}

export function isTaskEligibleForManualReview(task: WritingTaskItem | null): boolean {
  if (!task) return false;
  // interactive-card / basic-form：仅创建前引导，创建后不应再弹审核/填表
  if (hasPendingUserInputGate(task)) return false;
  if (hasPendingManualReviewGate(task)) return true;
  if (resolveTaskListStatus(task) !== 'awaiting_review') return false;
  const pct = task.progress?.progress ?? 0;
  if (pct >= 100 || task.progress?.completedAt) return false;
  const result = task.result as { hasMedia?: boolean; mediaCount?: number } | undefined;
  if (result?.hasMedia || (result?.mediaCount ?? 0) > 0) return false;
  return task.status === 'awaiting_review';
}

export function isTaskMediaReady(task: WritingTaskItem): boolean {
  if (hasPendingManualReviewGate(task)) return false;
  if (resolveTaskListStatus(task) !== 'completed') return false;
  return taskHasMediaOutput(task);
}

export function mergeTaskIntoList(
  prev: WritingTaskItem[],
  patch: WritingTaskItem
): WritingTaskItem[] {
  const idx = prev.findIndex((t) => t.id === patch.id);
  if (idx < 0) {
    return [patch, ...prev];
  }
  const merged = mergeTaskItem(prev[idx], patch);
  if (merged === prev[idx]) {
    return prev;
  }
  const copy = [...prev];
  copy[idx] = merged;
  return copy;
}
