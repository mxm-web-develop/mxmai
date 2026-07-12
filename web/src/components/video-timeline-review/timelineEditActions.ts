import type { TextClip, TimelineClip, VideoEditScript } from './types';
import {
  collectVisualClipRefs,
  MIN_CLIP_DURATION_SEC,
  type VisualClipRef,
} from './timelineClipResize';

export type TimelineEditResult = {
  script: VideoEditScript;
  /** split 时第二段新 clip id */
  newClipId?: string;
  /** delete / merge 后建议选中的 clip id */
  focusClipId?: string;
  error?: string;
};

function roundSec(v: number): number {
  return Math.round(v * 100) / 100;
}

function newVisualClipId(): string {
  return `clip-vis-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function invalidateClipRender(clip: TimelineClip): void {
  if (!clip.metadata) clip.metadata = {};
  clip.metadata.mxmUserEdited = true;
  clip.metadata.mxmRenderStatus = 'pending';
  clip.metadata.mxmRenderedVideoUrl = undefined;
  clip.metadata.mxmRenderError = undefined;
}

function cloneMetadata(source: TimelineClip): TimelineClip['metadata'] {
  return source.metadata ? structuredClone(source.metadata) : { mxmUserEdited: true };
}

function removeTextClipsInRange(textClips: TextClip[], start: number, end: number): TextClip[] {
  return textClips.filter((tc) => {
    const tcEnd = tc.startTime + tc.duration;
    return !(tc.startTime >= start - 0.001 && tcEnd <= end + 0.001);
  });
}

function findRef(refs: VisualClipRef[], clipId: string): VisualClipRef | undefined {
  return refs.find((r) => r.clip.id === clipId);
}

export function canSplitVisualClip(
  refs: VisualClipRef[],
  clipId: string,
  splitTime: number,
  minDuration = MIN_CLIP_DURATION_SEC
): boolean {
  const ref = findRef(refs, clipId);
  if (!ref) return false;
  const clip = ref.clip;
  const left = splitTime - clip.startTime;
  const right = clip.startTime + clip.duration - splitTime;
  return left >= minDuration && right >= minDuration;
}

export function canDeleteVisualClip(refs: VisualClipRef[]): boolean {
  return refs.length > 1;
}

export function canMergeVisualClipWithNext(refs: VisualClipRef[], clipId: string): boolean {
  const idx = refs.findIndex((r) => r.clip.id === clipId);
  return idx >= 0 && idx < refs.length - 1;
}

/** 在播放头位置切分视觉片段（连续时间轴，无黑场） */
export function splitVisualClipInScript(
  script: VideoEditScript,
  clipId: string,
  splitTime: number,
  minDuration = MIN_CLIP_DURATION_SEC
): TimelineEditResult {
  const next = structuredClone(script);
  const refs = collectVisualClipRefs(next);
  const ref = findRef(refs, clipId);
  if (!ref) return { script, error: '未找到片段' };

  const clip = ref.clip;
  const clipEnd = clip.startTime + clip.duration;
  const leftDur = roundSec(splitTime - clip.startTime);
  const rightDur = roundSec(clipEnd - splitTime);

  if (leftDur < minDuration || rightDur < minDuration) {
    return { script, error: `切分后每段至少 ${minDuration} 秒` };
  }
  if (splitTime <= clip.startTime || splitTime >= clipEnd) {
    return { script, error: '播放头须在片段内部' };
  }

  const track = next.project.timeline.tracks[ref.trackIndex]!;
  const newId = newVisualClipId();
  const newClip: TimelineClip = {
    id: newId,
    trackId: clip.trackId,
    startTime: roundSec(splitTime),
    duration: rightDur,
    type: clip.type,
    metadata: cloneMetadata(clip),
  };
  invalidateClipRender(clip);
  invalidateClipRender(newClip);
  clip.duration = leftDur;

  track.clips.splice(ref.clipIndex + 1, 0, newClip);

  return { script: next, newClipId: newId, focusClipId: newId };
}

/** 删除视觉片段：时长并入前一段（或后一段），保持连续铺满 */
export function deleteVisualClipInScript(
  script: VideoEditScript,
  clipId: string
): TimelineEditResult {
  const next = structuredClone(script);
  const refs = collectVisualClipRefs(next);
  if (refs.length <= 1) {
    return { script, error: '至少保留一个片段' };
  }

  const idx = refs.findIndex((r) => r.clip.id === clipId);
  if (idx < 0) return { script, error: '未找到片段' };

  const ref = refs[idx]!;
  const clip = ref.clip;
  const deletedStart = clip.startTime;
  const deletedEnd = clip.startTime + clip.duration;
  const track = next.project.timeline.tracks[ref.trackIndex]!;

  let focusClipId = clipId;

  if (idx > 0) {
    const prev = refs[idx - 1]!.clip;
    prev.duration = roundSec(prev.duration + clip.duration);
    invalidateClipRender(prev);
    focusClipId = prev.id;
  } else {
    const nextRef = refs[idx + 1]!;
    const right = nextRef.clip;
    right.startTime = clip.startTime;
    right.duration = roundSec(right.duration + clip.duration);
    invalidateClipRender(right);
    focusClipId = right.id;
  }

  track.clips.splice(ref.clipIndex, 1);

  if (next.project.textClips?.length) {
    next.project.textClips = removeTextClipsInRange(
      next.project.textClips,
      deletedStart,
      deletedEnd
    );
  }

  return { script: next, focusClipId };
}

/** 与下一段合并 */
export function mergeVisualClipWithNextInScript(
  script: VideoEditScript,
  clipId: string
): TimelineEditResult {
  const next = structuredClone(script);
  const refs = collectVisualClipRefs(next);
  const idx = refs.findIndex((r) => r.clip.id === clipId);
  if (idx < 0) return { script, error: '未找到片段' };
  if (idx >= refs.length - 1) return { script, error: '没有可合并的下一段' };

  const leftRef = refs[idx]!;
  const rightRef = refs[idx + 1]!;
  const left = leftRef.clip;
  const right = rightRef.clip;
  const mergedEnd = right.startTime + right.duration;
  const track = next.project.timeline.tracks[leftRef.trackIndex]!;

  left.duration = roundSec(mergedEnd - left.startTime);
  invalidateClipRender(left);

  if (next.project.textClips?.length) {
    next.project.textClips = removeTextClipsInRange(
      next.project.textClips,
      right.startTime,
      mergedEnd
    );
  }

  track.clips.splice(rightRef.clipIndex, 1);

  return { script: next, focusClipId: left.id };
}
