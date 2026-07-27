import type { WritingTaskItem } from '../api/client';
import { rewriteInternalStorageMediaUrl } from '../components/video-timeline-review/voiceoverTimelineEnrich';

export type AutocutClipPreview = {
  clipId: string;
  kind: 'video' | 'image';
  url: string;
  label: string;
  childTaskId?: string;
  renderStatus?: string;
};

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readVideoEditScript(task: WritingTaskItem): Record<string, unknown> | null {
  const rp = readRecord(task.requestParams) ?? {};
  const rootBps = readRecord(rp.businessPipelineState);
  const fromRoot = readRecord(rootBps?.videoEditScriptJson);
  if (fromRoot) return fromRoot;

  const inner = readRecord(rp.params);
  const innerBps = readRecord(inner?.businessPipelineState);
  return readRecord(innerBps?.videoEditScriptJson);
}

function clipLabel(meta: Record<string, unknown>, _clipId: string, index: number): string {
  const videoPrompt = typeof meta.mxmVideoPrompt === 'string' ? meta.mxmVideoPrompt.trim() : '';
  const imagePrompt = typeof meta.mxmImagePrompt === 'string' ? meta.mxmImagePrompt.trim() : '';
  const legacy = typeof meta.mxmPrompt === 'string' ? meta.mxmPrompt.trim() : '';
  const prompt =
    meta.mxmAiOutputKind === 'image'
      ? imagePrompt || legacy
      : videoPrompt || legacy || imagePrompt;
  if (prompt) {
    return prompt.length > 28 ? `${prompt.slice(0, 28)}…` : prompt;
  }
  const kind = meta.mxmAiOutputKind === 'image' ? 'AI配图' : 'AI视频';
  return `${kind} · 镜头 ${index + 1}`;
}

function readListClipPreviewSummary(task: WritingTaskItem): AutocutClipPreview[] {
  const rp = readRecord(task.requestParams) ?? {};
  const rootBps = readRecord(rp.businessPipelineState);
  const summary = rootBps?.clipPreviewSummary;
  if (!Array.isArray(summary)) return [];
  return summary
    .map((item, index) => {
      const o = readRecord(item);
      if (!o) return null;
      const clipId = typeof o.clipId === 'string' ? o.clipId : `clip-${index}`;
      const kind = o.kind === 'image' || o.kind === 'video' ? o.kind : null;
      const rawUrl = typeof o.url === 'string' ? o.url.trim() : '';
      if (!kind || !rawUrl) return null;
      return {
        clipId,
        kind,
        url: rewriteInternalStorageMediaUrl(rawUrl),
        label:
          typeof o.label === 'string' && o.label.trim()
            ? o.label.trim()
            : kind === 'image'
              ? `AI配图 · ${index + 1}`
              : `AI视频 · ${index + 1}`,
        childTaskId:
          typeof o.childTaskId === 'string' && o.childTaskId.trim()
            ? o.childTaskId.trim()
            : undefined,
      } satisfies AutocutClipPreview;
    })
    .filter((x): x is AutocutClipPreview => Boolean(x));
}

/**
 * 从自动剪辑父任务提取可预览的 AI 视频 / 配图片段。
 * 列表接口走 clipPreviewSummary；详情走完整 videoEditScriptJson。
 */
export function extractAutocutClipPreviews(task: WritingTaskItem | null | undefined): AutocutClipPreview[] {
  if (!task) return [];

  const fromSummary = readListClipPreviewSummary(task);
  if (fromSummary.length > 0) return fromSummary;

  const script = readVideoEditScript(task);
  if (!script) return [];

  const project = readRecord(script.project);
  const timeline = readRecord(project?.timeline);
  const tracks = Array.isArray(timeline?.tracks) ? timeline.tracks : [];
  const out: AutocutClipPreview[] = [];
  let index = 0;

  for (const trackRaw of tracks) {
    const track = readRecord(trackRaw);
    const clips = Array.isArray(track?.clips) ? track.clips : [];
    for (const clipRaw of clips) {
      const clip = readRecord(clipRaw);
      if (!clip) continue;
      const clipId = typeof clip.id === 'string' ? clip.id : `clip-${index}`;
      const meta = readRecord(clip.metadata) ?? {};
      const renderMode = typeof meta.mxmRenderMode === 'string' ? meta.mxmRenderMode : '';
      if (!renderMode) continue;

      const childTaskId =
        typeof meta.mxmAiGenTaskId === 'string' && meta.mxmAiGenTaskId.trim()
          ? meta.mxmAiGenTaskId.trim()
          : undefined;
      const renderedVideo =
        typeof meta.mxmRenderedVideoUrl === 'string' ? meta.mxmRenderedVideoUrl.trim() : '';
      const aiImage =
        typeof meta.mxmAiGeneratedImageUrl === 'string'
          ? meta.mxmAiGeneratedImageUrl.trim()
          : typeof meta.mxmSourceImageUrl === 'string'
            ? meta.mxmSourceImageUrl.trim()
            : '';

      const isAiClip =
        renderMode === 'ai-video-gen' ||
        Boolean(meta.mxmAiOutputKind) ||
        Boolean(childTaskId);

      if (renderedVideo && (isAiClip || meta.mxmRenderStatus === 'ready')) {
        out.push({
          clipId,
          kind: 'video',
          url: rewriteInternalStorageMediaUrl(renderedVideo),
          label: clipLabel(meta, clipId, index),
          childTaskId,
          renderStatus: typeof meta.mxmRenderStatus === 'string' ? meta.mxmRenderStatus : undefined,
        });
        index += 1;
        continue;
      }

      if (aiImage && (isAiClip || renderMode === 'static-image')) {
        out.push({
          clipId,
          kind: 'image',
          url: rewriteInternalStorageMediaUrl(aiImage),
          label: clipLabel(meta, clipId, index),
          childTaskId,
          renderStatus: typeof meta.mxmRenderStatus === 'string' ? meta.mxmRenderStatus : undefined,
        });
        index += 1;
      }
    }
  }

  return out;
}

/** 父任务列表封面：优先 AI 配图 */
export function getAutocutListPosterUrl(task: WritingTaskItem): string | undefined {
  const clips = extractAutocutClipPreviews(task);
  const image = clips.find((c) => c.kind === 'image');
  if (image?.url) return image.url;
  return undefined;
}

/** 无配图时的封面兜底：取第一个已生成片段视频 URL（用于本地截帧，不访问最终成片） */
export function getAutocutFirstClipVideoUrl(task: WritingTaskItem): string | undefined {
  const clips = extractAutocutClipPreviews(task);
  return clips.find((c) => c.kind === 'video')?.url;
}
