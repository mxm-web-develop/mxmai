import type { MxmClipMetadata, VideoEditScript } from './types';

/** 成片阶段：该片段是否已有可播放的渲染结果 */
export function isClipRenderReady(meta?: MxmClipMetadata | null): boolean {
  return meta?.mxmRenderStatus === 'ready' && Boolean(meta.mxmRenderedVideoUrl?.trim());
}

export type ClipRenderBlockReason = 'failed' | 'pending' | 'rendering' | 'missing';

export type ClipRenderBlock = {
  clipId: string;
  reason: ClipRenderBlockReason;
  error?: string;
};

function isRenderableClip(meta?: MxmClipMetadata | null): boolean {
  return Boolean(meta?.mxmRenderMode);
}

/** 列出尚未就绪、会阻塞成片审核通过的 clip */
export function listBlockingClipRenders(script: VideoEditScript): ClipRenderBlock[] {
  const blocks: ClipRenderBlock[] = [];
  for (const track of script.project.timeline.tracks) {
    for (const clip of track.clips) {
      const meta = clip.metadata;
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

export function countFailedClipRenders(script: VideoEditScript): number {
  return listBlockingClipRenders(script).filter((b) => b.reason === 'failed').length;
}
