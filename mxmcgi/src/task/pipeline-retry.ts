/**
 * 业务管线失败快照与断点重试：保留前置/后置已完成节点数据，避免整任务重来。
 */
import type { Task } from './types';
import type { ReviewCheckpoint } from '../tasks/manual-review-types';

export type PipelineRetryPrepared = {
  updatedParams: Record<string, unknown>;
  retryMessage: string;
  resumeProgress: number;
  resumeDeferredPost: boolean;
};

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function mergeBusinessPipelineState(
  taskParams: Record<string, unknown>,
  nestedParams?: Record<string, unknown>,
  taskMeta?: Record<string, unknown>
): Record<string, unknown> {
  const inner = (nestedParams?.businessPipelineState ?? {}) as Record<string, unknown>;
  const root = (taskParams.businessPipelineState ?? {}) as Record<string, unknown>;
  const meta = (taskMeta?.businessPipelineState ?? {}) as Record<string, unknown>;
  return { ...inner, ...meta, ...root };
}

export function getMergedPipelineState(task: Task): Record<string, unknown> {
  const rp = (task.requestParams ?? {}) as Record<string, unknown>;
  const inner = readRecord(rp.params) ?? {};
  const meta = (task.metadata ?? {}) as Record<string, unknown>;
  const merged = mergeBusinessPipelineState(rp, inner, meta);

  // nested render 指针历史写在 metadata 根级；仅当 businessPipelineState 未声明时才回退到 meta，
  // 避免 bps 已清掉 pending 后仍被陈旧 meta.nestedVideoRenderPending=true 盖回去。
  const rootBps = (rp.businessPipelineState ?? {}) as Record<string, unknown>;
  const innerBps = (inner.businessPipelineState ?? {}) as Record<string, unknown>;
  if (
    meta.nestedVideoRenderPending !== undefined &&
    rootBps.nestedVideoRenderPending === undefined &&
    innerBps.nestedVideoRenderPending === undefined
  ) {
    merged.nestedVideoRenderPending = meta.nestedVideoRenderPending;
  }
  if (
    meta.videoEditRenderTaskId !== undefined &&
    rootBps.videoEditRenderTaskId === undefined &&
    innerBps.videoEditRenderTaskId === undefined
  ) {
    merged.videoEditRenderTaskId = meta.videoEditRenderTaskId;
  }
  if (
    meta.videoEditRenderStepIndex !== undefined &&
    rootBps.videoEditRenderStepIndex === undefined &&
    innerBps.videoEditRenderStepIndex === undefined
  ) {
    merged.videoEditRenderStepIndex = meta.videoEditRenderStepIndex;
  }

  return merged;
}

/** 估算断点重试时应恢复的进度（避免 UI 回到 0%） */
export function estimatePipelineRetryProgress(
  bps: Record<string, unknown>,
  taskType?: string
): number {
  if (bps.businessPipelineAwaitingReview === true) return taskType === 'video' ? 85 : 35;

  const cp = bps.reviewCheckpoint as ReviewCheckpoint | undefined;
  if (cp?.phase === 'post') {
    if (bps.nestedVideoRenderPending === true || bps.videoEditRenderTaskId) return 92;
    if (bps.businessPipelinePostDeferred === true) return 88;
    return 86;
  }
  if (cp?.phase === 'pre') {
    const base = taskType === 'video' ? 18 : 15;
    return Math.min(34, base + Math.max(0, cp.stepIndex) * 4);
  }
  if (bps.businessPipelinePreDone === true) return taskType === 'video' ? 45 : 40;
  if (bps.businessPipelinePreDeferred === true) return taskType === 'video' ? 22 : 18;
  return 5;
}

/**
 * 失败时合并并标记可断点重试（写入 requestParams.businessPipelineState）
 */
export function buildPipelineFailureSnapshot(
  task: Task,
  partialState?: Record<string, unknown>
): Record<string, unknown> {
  const rp = { ...((task.requestParams ?? {}) as Record<string, unknown>) };
  const inner = { ...(readRecord(rp.params) ?? {}) };
  const bps = {
    ...getMergedPipelineState(task),
    ...(partialState ?? {}),
    pipelineRetryEligible: true,
    pipelineLastFailedAt: new Date().toISOString(),
  };

  return {
    ...rp,
    params: { ...inner, businessPipelineState: { ...(readRecord(inner.businessPipelineState) ?? {}), ...bps } },
    businessPipelineState: bps,
  };
}

/**
 * 重试前整理 requestParams：清错误态标记，必要时重置失败的 render 子任务指针以便重跑该步。
 */
export function preparePipelineRetryExecute(task: Task): PipelineRetryPrepared {
  const rp = { ...((task.requestParams ?? {}) as Record<string, unknown>) };
  const inner = { ...(readRecord(rp.params) ?? {}) };
  const bps = { ...getMergedPipelineState(task) };

  let retryMessage = '正在从上次进度重试…';
  let resumeDeferredPost = false;

  if (bps.businessPipelinePostDeferred === true && bps.pendingPostResult) {
    resumeDeferredPost = true;
    retryMessage = '正在从后置管线断点续跑…';
  } else if (bps.businessPipelinePreDone === true) {
    retryMessage = '前置步骤已完成，正在重试生成…';
  } else if (bps.businessPipelinePreDeferred === true) {
    const cp = bps.reviewCheckpoint as ReviewCheckpoint | undefined;
    if (cp?.phase === 'pre' && cp.stepIndex > 0) {
      retryMessage = `正在从前置步骤第 ${cp.stepIndex + 1} 步续跑…`;
    } else {
      retryMessage = '正在从前置管线断点续跑…';
    }
  }

  // 逐段渲染子任务失败：清子任务指针，保留 pendingPostResult + 分镜脚本，重跑 videoTimelineRender
  if (
    bps.businessPipelinePostDeferred === true &&
    bps.pendingPostResult &&
    (bps.nestedVideoRenderPending === true ||
      bps.videoEditRenderTaskId ||
      bps.pipelineRenderRetry === true)
  ) {
    delete bps.nestedVideoRenderPending;
    delete bps.videoEditRenderTaskId;
    bps.pipelineRenderRetry = true;
    retryMessage = '正在重新逐段渲染（保留已审核分镜）…';
    resumeDeferredPost = true;

    const cp = bps.reviewCheckpoint as ReviewCheckpoint | undefined;
    if (cp?.phase === 'post' && cp.stepIndex >= 2) {
      const completedGateIds = Array.isArray(cp.completedGateIds)
        ? cp.completedGateIds.filter((id) => id === 'voiceover-science-pop-review')
        : ['voiceover-science-pop-review'];
      bps.reviewCheckpoint = {
        phase: 'post',
        stepIndex: 1,
        completedGateIds: completedGateIds.length ? completedGateIds : ['voiceover-science-pop-review'],
      };
    }
  }

  bps.pipelineRetryEligible = true;
  bps.pipelineRetryCount = Number(bps.pipelineRetryCount ?? 0) + 1;
  delete bps.businessPipelineAwaitingReview;
  delete bps.currentReviewGate;

  const updatedParams: Record<string, unknown> = {
    ...rp,
    params: { ...inner, businessPipelineState: { ...(readRecord(inner.businessPipelineState) ?? {}), ...bps } },
    businessPipelineState: bps,
  };

  const resumeProgress = estimatePipelineRetryProgress(bps, task.type);

  return {
    updatedParams,
    retryMessage,
    resumeProgress,
    resumeDeferredPost,
  };
}

export function buildStepCheckpoint(
  phase: ReviewCheckpoint['phase'],
  stepIndex: number,
  completedGateIds: string[] = []
): ReviewCheckpoint {
  return { phase, stepIndex, completedGateIds: [...completedGateIds] };
}

/** 将管线 ctx.state 合并写回 requestParams（失败/断点重试用） */
export function mergeParamsWithPipelineState(
  baseParams: Record<string, unknown>,
  pipelineState: Record<string, unknown>
): Record<string, unknown> {
  const inner = readRecord(baseParams.params) ?? {};
  const innerBps = readRecord(inner.businessPipelineState) ?? {};
  const rootBps = readRecord(baseParams.businessPipelineState) ?? {};
  const mergedBps = { ...innerBps, ...rootBps, ...pipelineState };
  return {
    ...baseParams,
    businessPipelineState: mergedBps,
    params: { ...inner, businessPipelineState: mergedBps },
  };
}
