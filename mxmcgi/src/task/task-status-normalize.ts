/**
 * 修正「已有产出但 status 仍为 awaiting_review」的陈旧任务行
 */
import type { Task, TaskStatus } from './types';

function hasTaskMedia(task: Task): boolean {
  const urls = task.result?.mediaUrls;
  if (Array.isArray(urls) && urls.length > 0) return true;
  const summary = task.result as { hasMedia?: boolean; mediaCount?: number } | undefined;
  return summary?.hasMedia === true || (summary?.mediaCount ?? 0) > 0;
}

export type GateKind =
  | 'text'
  | 'json'
  | 'image'
  | 'media'
  | 'composite'
  | 'video-timeline'
  | 'interactive-card'
  | 'basic-form'
  | 'writing-chat';

function readGateKind(task: Task): GateKind | undefined {
  const gate = task.metadata?.manualReviewGate as { kind?: string } | undefined;
  if (!gate?.kind) return undefined;
  return gate.kind as GateKind;
}

/** 仍挂人工审核闸门、且尚无最终媒体产出 */
export function hasPendingManualReviewGate(task: Task): boolean {
  const gate = task.metadata?.manualReviewGate as { gateId?: string } | undefined;
  if (!gate?.gateId) return false;
  return !hasTaskMedia(task);
}

/** 闸门是「引导用户补字段」（pre interactive-card / basic-form），不是真审核 */
export function hasPendingUserInputGate(task: Task): boolean {
  const gate = task.metadata?.manualReviewGate as { gateId?: string } | undefined;
  if (!gate?.gateId) return false;
  if (hasTaskMedia(task)) return false;
  const kind = readGateKind(task);
  return kind === 'interactive-card' || kind === 'basic-form';
}

/** 列表/详情展示用有效状态 */
export function effectiveTaskStatus(task: Task): TaskStatus {
  const raw = task.status;

  if (hasPendingUserInputGate(task)) {
    return 'awaiting_user_input';
  }

  if (hasPendingManualReviewGate(task)) {
    return 'awaiting_review';
  }

  if (raw !== 'awaiting_review' && raw !== 'awaiting_user_input') return raw;

  const hasMedia = hasTaskMedia(task);
  if (hasMedia) {
    return 'completed';
  }

  const pct = task.progress?.progress ?? 0;
  const completedAt = task.progress?.completedAt;
  if (pct >= 100 || completedAt != null) {
    return 'completed';
  }

  return raw;
}

export function normalizeStaleTaskStatus(task: Task): { task: Task; repaired: boolean } {
  const nextStatus = effectiveTaskStatus(task);
  if (nextStatus === task.status) {
    return { task, repaired: false };
  }

  const pct = task.progress?.progress ?? 0;
  return {
    task: {
      ...task,
      status: nextStatus,
      progress: {
        ...task.progress,
        status: nextStatus,
        progress: nextStatus === 'completed' ? Math.max(pct, 100) : pct,
        ...(nextStatus === 'completed' && !task.progress?.completedAt
          ? { completedAt: new Date() }
          : {}),
        ...(nextStatus === 'awaiting_review' || nextStatus === 'awaiting_user_input'
          ? { completedAt: null }
          : {}),
      },
    },
    repaired: true,
  };
}
