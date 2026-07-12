/**
 * 成片审核：clip 渲染就绪判定（供 API 校验与前端对齐）
 */
import type { MxmClipMetadata, VideoEditScript } from './types';
import { parseManualReviewStepParams } from '../../tasks/manual-review-types';
import type { PipelineStep } from '../../tasks/types';

export type ClipRenderBlockReason = 'failed' | 'pending' | 'rendering' | 'missing';

export type ClipRenderBlock = {
  clipId: string;
  reason: ClipRenderBlockReason;
  error?: string;
};

function isRenderableClip(meta?: MxmClipMetadata | null): boolean {
  return Boolean(meta?.mxmRenderMode);
}

export function isClipRenderReady(meta?: MxmClipMetadata | null): boolean {
  return meta?.mxmRenderStatus === 'ready' && Boolean(meta.mxmRenderedVideoUrl?.trim());
}

/** 列出尚未就绪、会阻塞成片审核通过的 clip */
export function listBlockingClipRenders(script: VideoEditScript): ClipRenderBlock[] {
  const blocks: ClipRenderBlock[] = [];
  for (const track of script.project.timeline.tracks) {
    for (const clip of track.clips) {
      const meta = clip.metadata as MxmClipMetadata | undefined;
      if (!isRenderableClip(meta)) continue;
      if (isClipRenderReady(meta)) continue;

      const status = meta?.mxmRenderStatus;
      let reason: ClipRenderBlockReason = 'missing';
      if (status === 'failed') reason = 'failed';
      else if (status === 'rendering') reason = 'rendering';
      else if (status === 'pending' || !status) reason = 'pending';

      blocks.push({
        clipId: clip.id,
        reason,
        error: meta?.mxmRenderError,
      });
    }
  }
  return blocks;
}

export function assertAllClipsRenderReady(script: VideoEditScript): void {
  const blocks = listBlockingClipRenders(script);
  if (!blocks.length) return;

  const failed = blocks.filter((b) => b.reason === 'failed').length;
  const pending = blocks.filter((b) => b.reason === 'pending' || b.reason === 'rendering').length;
  const sample = blocks
    .slice(0, 3)
    .map((b) => `${b.clipId}(${b.reason}${b.error ? `: ${b.error.slice(0, 80)}` : ''})`)
    .join('；');

  throw new Error(
    `仍有 ${blocks.length} 个片段未渲染完成（失败 ${failed}，待生成 ${pending}）。` +
      `请先在审核页重试失败片段：${sample}${blocks.length > 3 ? '…' : ''}`
  );
}

/** 将指定 clip（或全部失败/待生成）标记为 pending，供 skipReadyClips 重跑 */
export function invalidateClipsForRerender(
  script: VideoEditScript,
  clipIds?: string[]
): { script: VideoEditScript; retriedClipIds: string[] } {
  const next = structuredClone(script) as VideoEditScript;
  const idSet =
    clipIds && clipIds.length > 0 ? new Set(clipIds.map((id) => id.trim()).filter(Boolean)) : null;

  const retriedClipIds: string[] = [];

  for (const track of next.project.timeline.tracks) {
    for (const clip of track.clips) {
      const meta = clip.metadata as MxmClipMetadata | undefined;
      if (!isRenderableClip(meta)) continue;

      const shouldRetry = idSet
        ? idSet.has(clip.id)
        : !isClipRenderReady(meta);

      if (!shouldRetry) continue;

      if (!clip.metadata) clip.metadata = {} as MxmClipMetadata;
      clip.metadata.mxmRenderStatus = 'pending';
      clip.metadata.mxmRenderedVideoUrl = undefined;
      clip.metadata.mxmRenderError = undefined;
      retriedClipIds.push(clip.id);
    }
  }

  if (!retriedClipIds.length) {
    throw new Error('没有需要重新生成的片段（请选中失败或未就绪的 AI/素材段）');
  }

  return { script: next, retriedClipIds };
}

/** 成片审核 approve 前校验 */
export function validateRenderedReviewApproval(
  reviewJson: unknown,
  reviewStep: { params?: Record<string, unknown> } | null
): void {
  const stepParams = reviewStep?.params
    ? parseManualReviewStepParams(reviewStep as PipelineStep)
    : null;
  const isRendered =
    stepParams?.timelinePhase === 'rendered' ||
    (typeof reviewStep?.params?.id === 'string' &&
      String(reviewStep.params.id).includes('render-review'));

  if (!isRendered) return;

  if (
    !reviewJson ||
    typeof reviewJson !== 'object' ||
    !Array.isArray(
      (reviewJson as { project?: { timeline?: { tracks?: unknown } } }).project?.timeline?.tracks
    )
  ) {
    throw new Error('成片审核 reviewJson 无效');
  }

  assertAllClipsRenderReady(reviewJson as VideoEditScript);
}
