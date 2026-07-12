/**
 * 第二次成片审核：重试失败/待生成 clip，父任务回到 processing
 */
import type { Task } from '../../task/types';
import type { ReviewCheckpoint } from '../../tasks/manual-review-types';
import type { VideoEditScript } from './types';
import { createVideoTimelineRenderTask } from './pipeline-timeline-render';
import {
  invalidateClipsForRerender,
} from './clip-render-readiness';
import { mergeParamsWithPipelineState } from '../../task/pipeline-retry';
import { enrichVideoTimelineReviewDraft } from '../../tasks/manual-review';
import { setManualReviewDraft } from '../../tasks/manual-review-store';

function isVideoEditProjectFile(raw: unknown): raw is Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return false;
  const pf = raw as { project?: { timeline?: { tracks?: unknown } } };
  return Array.isArray(pf.project?.timeline?.tracks);
}

function findRenderReviewGateId(task: Task): string | undefined {
  const gate = task.metadata?.manualReviewGate as { gateId?: string } | undefined;
  if (gate?.gateId?.includes('render-review')) return gate.gateId;

  const pending = (task.requestParams as Record<string, unknown> | undefined)?.businessPipelineState as
    | { pendingReviewDraft?: { gateId?: string; metadata?: { timelinePhase?: string } } }
    | undefined;
  const draftGate = pending?.pendingReviewDraft?.gateId;
  if (draftGate?.includes('render-review')) return draftGate;
  if (pending?.pendingReviewDraft?.metadata?.timelinePhase === 'rendered') {
    return draftGate;
  }
  return gate?.gateId;
}

export type RetryRenderedReviewClipsInput = {
  task: Task;
  reviewJson: unknown;
  gateId?: string;
  clipIds?: string[];
};

export type RetryRenderedReviewClipsResult = {
  renderTaskId: string;
  retriedClipIds: string[];
  script: VideoEditScript;
};

/** 从成片审核态发起局部 clip 重渲染 */
export async function retryRenderedReviewClips(
  input: RetryRenderedReviewClipsInput
): Promise<RetryRenderedReviewClipsResult> {
  const { task, reviewJson, clipIds } = input;
  if (!isVideoEditProjectFile(reviewJson)) {
    throw new Error('reviewJson 必须是有效的 OpenReel ProjectFile');
  }

  const gateId = input.gateId?.trim() || findRenderReviewGateId(task);
  if (!gateId) {
    throw new Error('无法识别成片审核 gateId');
  }

  const gateMeta = task.metadata?.manualReviewGate as
    | { timelinePhase?: string; phase?: string; stepIndex?: number }
    | undefined;
  const draftMeta = (
    (task.requestParams as Record<string, unknown> | undefined)?.businessPipelineState as
      | { pendingReviewDraft?: { metadata?: { timelinePhase?: string } } }
      | undefined
  )?.pendingReviewDraft?.metadata;

  const isRenderedGate =
    gateId.includes('render-review') ||
    gateMeta?.timelinePhase === 'rendered' ||
    draftMeta?.timelinePhase === 'rendered';
  if (!isRenderedGate) {
    throw new Error('当前审核闸门不是成片精修阶段，无法重试片段渲染');
  }

  const { script, retriedClipIds } = invalidateClipsForRerender(
    reviewJson as VideoEditScript,
    clipIds
  );

  const taskParams = (task.requestParams ?? {}) as Record<string, unknown>;
  const innerParams = (taskParams.params ?? {}) as Record<string, unknown>;
  const bps = {
    ...((taskParams.businessPipelineState ?? innerParams.businessPipelineState ?? {}) as Record<
      string,
      unknown
    >),
  };

  const userId =
    (taskParams.userId as string) ||
    (task.metadata?.userId as string) ||
    (task.metadata?.billingUserId as string);
  if (!userId) throw new Error('缺少 userId');

  const cp = bps.reviewCheckpoint as ReviewCheckpoint | undefined;
  const completedGateIds = Array.isArray(cp?.completedGateIds)
    ? cp!.completedGateIds.filter((id) => typeof id === 'string')
    : [];

  // 回退到 videoTimelineRender 步骤（science-pop: index 1），保留分镜审核 completed
  const renderStepIndex =
    typeof gateMeta?.stepIndex === 'number' && gateMeta.stepIndex > 0
      ? gateMeta.stepIndex - 1
      : 1;

  const renderTaskId = await createVideoTimelineRenderTask({
    userId,
    parentPipelineTaskId: task.id,
    pipelineDepth: 1,
    videoEditScriptJson: script as unknown as Record<string, unknown>,
    renderOptions: {
      concatFinal: false,
      skipReadyClips: true,
      applyOverlays: false,
      applySubtitleBurn: false,
    },
    label: typeof innerParams.topic === 'string' ? innerParams.topic : undefined,
  });

  const { enqueueTaskWake } = await import('../../task/task-queue');
  await enqueueTaskWake(renderTaskId).catch(() => {});

  const nextCheckpoint: ReviewCheckpoint = {
    phase: 'post',
    stepIndex: Math.max(0, renderStepIndex),
    completedGateIds,
  };

  const nextBps: Record<string, unknown> = {
    ...bps,
    videoEditScriptJson: script,
    reviewCheckpoint: nextCheckpoint,
    videoEditRenderTaskId: renderTaskId,
    nestedVideoRenderPending: true,
    businessPipelineAwaitingReview: false,
    businessPipelinePostDeferred: true,
    currentReviewGate: undefined,
    pendingReviewDraft: {
      version: 1,
      gateId,
      phase: 'post',
      kind: 'video-timeline',
      json: script,
      metadata: {
        ...(draftMeta ?? {}),
        timelinePhase: 'rendered',
      },
      editable: true,
    },
  };

  const mergedParams = mergeParamsWithPipelineState(taskParams, nextBps);
  const { taskExecutor } = await import('../../task/task-executor');
  const taskManager = taskExecutor.getTaskManager();
  await taskManager.updateTaskRequestParams(task.id, mergedParams);

  try {
    const storage = (taskManager as { storage?: { update: (id: string, u: unknown) => Promise<void> } })
      .storage;
    if (storage) {
      await storage.update(task.id, {
        metadata: {
          ...(task.metadata ?? {}),
          manualReviewGate: undefined,
          videoEditRenderTaskId: renderTaskId,
          nestedVideoRenderPending: true,
        },
      });
    }
  } catch (metaErr) {
    console.warn('[retryRenderedReviewClips] metadata patch failed:', metaErr);
  }

  await taskManager.updateTaskStatus(task.id, 'processing', {
    progress: 90,
    error: undefined,
    logs: [`正在重新生成 ${retriedClipIds.length} 个片段（${retriedClipIds.join(', ')}）…`],
  });

  const enrichedDraft = await enrichVideoTimelineReviewDraft(
    {
      version: 1,
      gateId,
      phase: 'post',
      kind: 'video-timeline',
      json: script,
      metadata: { timelinePhase: 'rendered' },
      editable: true,
    },
    taskParams
  );
  await setManualReviewDraft(task.id, gateId, enrichedDraft);

  return { renderTaskId, retriedClipIds, script };
}
