/**
 * 自动剪辑 post 步骤：videoTimelineRender（兼容 legacy nestedVideo）
 * 异步子任务 + 父任务 checkpoint 续跑
 */
import type { PipelineStep, TaskContext } from './types';
import { ConfigurationError } from './errors';
import type { Task } from '../task/types';
import {
  PIPELINE_NODE_VIDEO_TIMELINE_RENDER,
  createVideoTimelineRenderTask,
  isVideoTimelineRenderPipelineStep,
  resolveVideoTimelineRenderInput,
} from '../core/video-edit/pipeline-timeline-render';

export { isVideoTimelineRenderPipelineStep, PIPELINE_NODE_VIDEO_TIMELINE_RENDER };

/** @deprecated 仅兼容旧 metadata；新管线使用 pipelineNode */
export const LEGACY_NESTED_VIDEO_RENDER_KEYS = new Set([
  'video/autocut/render',
  'video/edit/render',
]);

/** 提交异步 render 子任务（不阻塞父 worker） */
export async function startNestedVideoRenderAsync(
  ctx: TaskContext,
  step: PipelineStep,
  opts?: { stepIndex?: number }
): Promise<TaskContext> {
  if (!isVideoTimelineRenderPipelineStep(step)) {
    throw new ConfigurationError(`非时间轴渲染步骤：${step.step}`);
  }

  const userId = ctx.userId;
  if (!userId) throw new ConfigurationError('videoTimelineRender 需要 userId');

  const depth = Number((ctx.params as Record<string, unknown>)._pipelineDepth ?? 0);
  const { videoEditScriptJson, renderOptions } = resolveVideoTimelineRenderInput(ctx, step);
  const stepIndex = opts?.stepIndex;

  const existingId = String(ctx.state.videoEditRenderTaskId ?? '').trim();
  if (existingId) {
    const existingStepRaw = ctx.state.videoEditRenderStepIndex;
    const existingStep =
      typeof existingStepRaw === 'number'
        ? existingStepRaw
        : typeof existingStepRaw === 'string' && existingStepRaw.trim()
          ? Number(existingStepRaw)
          : undefined;
    const ownedByThisStep =
      stepIndex === undefined ||
      existingStep === undefined ||
      existingStep === stepIndex;

    if (ownedByThisStep) {
      const { taskExecutor } = await import('../task/task-executor');
      const snap = await taskExecutor.getTaskManager().getTask(existingId);
      const child = snap?.task;
      const status = child?.status;
      // 仅复用仍在跑的子任务；已 completed 的不得复用（否则第二次拼片会卡在旧片段结果上）
      const inFlight =
        status === 'pending' ||
        status === 'queued' ||
        status === 'processing' ||
        status === 'awaiting_review';
      if (child && inFlight) {
        return {
          ...ctx,
          state: {
            ...ctx.state,
            videoEditRenderTaskId: existingId,
            videoEditRenderStepIndex: stepIndex ?? existingStep,
            nestedVideoRenderPending: true,
            pipelineVideoTimelineRenderNode: PIPELINE_NODE_VIDEO_TIMELINE_RENDER,
          },
        };
      }
    }
  }

  const renderTaskId = await createVideoTimelineRenderTask({
    userId,
    parentPipelineTaskId: ctx.taskId,
    pipelineDepth: depth + 1,
    videoEditScriptJson,
    renderOptions,
  });

  const { enqueueTaskWake } = await import('../task/task-queue');
  await enqueueTaskWake(renderTaskId).catch(() => {});

  return {
    ...ctx,
    state: {
      ...ctx.state,
      videoEditRenderTaskId: renderTaskId,
      videoEditRenderStepIndex: stepIndex,
      nestedVideoRenderPending: true,
      pipelineVideoTimelineRenderNode: PIPELINE_NODE_VIDEO_TIMELINE_RENDER,
    },
  };
}

export function extractNestedVideoRenderFromTask(task: Task): {
  mediaUrls: string[];
  renderedScript: unknown;
  metadata: Record<string, unknown>;
} {
  const resultMeta = (task.result?.metadata ?? {}) as {
    renderedScript?: unknown;
    videoEditRender?: { script?: unknown };
  };
  const renderedScript =
    resultMeta.renderedScript ?? resultMeta.videoEditRender?.script ?? undefined;
  const mediaUrls = Array.isArray(task.result?.mediaUrls)
    ? task.result!.mediaUrls!.filter((u): u is string => typeof u === 'string')
    : [];

  return {
    mediaUrls,
    renderedScript,
    metadata: {
      nestedTaskId: task.id,
      pipelineNode: PIPELINE_NODE_VIDEO_TIMELINE_RENDER,
      failedClipCount: (resultMeta as { failedClipCount?: number }).failedClipCount,
    },
  };
}

/** render 子任务完成后合并结果到父 pipeline state */
export function applyNestedVideoRenderResult(
  ctx: TaskContext,
  childTask: Task
): TaskContext {
  const { mediaUrls, renderedScript, metadata } = extractNestedVideoRenderFromTask(childTask);

  const finalArtifact = {
    kind: 'video' as const,
    mediaUrls,
    text: ctx.state.finalArtifact
      ? (ctx.state.finalArtifact as { text?: string }).text
      : undefined,
    metadata: {
      pipelineNode: PIPELINE_NODE_VIDEO_TIMELINE_RENDER,
      ...metadata,
    },
  };

  return {
    ...ctx,
    state: {
      ...ctx.state,
      finalArtifact,
      coreArtifact: finalArtifact,
      videoEditRenderTaskId: childTask.id,
      nestedVideoRenderPending: false,
      videoEditScriptJson: renderedScript ?? ctx.state.videoEditScriptJson,
    },
  };
}

export function readParentPipelineTaskId(task: Task): string | undefined {
  const rp = task.requestParams as Record<string, unknown> | undefined;
  const inner = (rp?.params as Record<string, unknown> | undefined) ?? {};
  const meta =
    (inner.metadata as Record<string, unknown> | undefined) ??
    (rp?.metadata as Record<string, unknown> | undefined);
  const fromMeta = meta?.parentPipelineTaskId;
  if (typeof fromMeta === 'string' && fromMeta.trim()) return fromMeta.trim();
  return undefined;
}

export async function notifyParentPipelineAfterRenderTask(renderTask: Task): Promise<void> {
  const parentId = readParentPipelineTaskId(renderTask);
  if (!parentId) return;
  const { taskExecutor } = await import('../task/task-executor');
  await taskExecutor.resumeParentPipelineAfterNestedRender(parentId, renderTask.id);
}

export async function syncParentProgressFromRenderTask(
  renderTaskId: string,
  renderProgress: number,
  log?: string
): Promise<void> {
  const { taskExecutor } = await import('../task/task-executor');
  const snap = await taskExecutor.getTaskManager().getTask(renderTaskId);
  const renderTask = snap?.task;
  if (!renderTask) return;
  const parentId = readParentPipelineTaskId(renderTask);
  if (!parentId) return;

  const parentProgress = Math.min(94, 90 + Math.round((renderProgress / 100) * 4));
  await taskExecutor.getTaskManager().updateTaskProgress(parentId, {
    progress: parentProgress,
    logs: log ? [log] : undefined,
  });
}
