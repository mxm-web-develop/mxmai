import type { TimelineClip, VideoEditScript } from './types';

export const MIN_CLIP_DURATION_SEC = 0.5;

export type VisualClipRef = {
  clip: TimelineClip;
  trackIndex: number;
  clipIndex: number;
};

export function collectVisualClipRefs(script: VideoEditScript): VisualClipRef[] {
  const refs: VisualClipRef[] = [];
  script.project.timeline.tracks.forEach((track, trackIndex) => {
    track.clips.forEach((clip, clipIndex) => {
      if (clip.metadata?.mxmRenderMode) {
        refs.push({ clip, trackIndex, clipIndex });
      }
    });
  });
  return refs.sort((a, b) => a.clip.startTime - b.clip.startTime);
}

export function resizeClipBoundaryInScript(
  script: VideoEditScript,
  clipId: string,
  edge: 'start' | 'end',
  newSec: number,
  totalDuration: number
): VideoEditScript {
  const next = structuredClone(script);
  const refs = collectVisualClipRefs(next);
  const idx = refs.findIndex((r) => r.clip.id === clipId);
  if (idx < 0) return script;

  const cur = refs[idx]!;
  const clip = cur.clip;
  const clipEnd = clip.startTime + clip.duration;
  const dur = Math.max(totalDuration, 0.01);

  if (edge === 'end') {
    const nextRef = refs[idx + 1];
    const maxEnd = nextRef
      ? nextRef.clip.startTime + nextRef.clip.duration - MIN_CLIP_DURATION_SEC
      : dur;
    const newEnd = clamp(newSec, clip.startTime + MIN_CLIP_DURATION_SEC, maxEnd);
    clip.duration = roundSec(newEnd - clip.startTime);
    if (nextRef) {
      const nextEnd = nextRef.clip.startTime + nextRef.clip.duration;
      nextRef.clip.startTime = roundSec(newEnd);
      nextRef.clip.duration = roundSec(nextEnd - newEnd);
    }
  } else {
    const prevRef = refs[idx - 1];
    const minStart = prevRef
      ? prevRef.clip.startTime + MIN_CLIP_DURATION_SEC
      : 0;
    const newStart = clamp(newSec, minStart, clipEnd - MIN_CLIP_DURATION_SEC);
    if (prevRef) {
      prevRef.clip.duration = roundSec(newStart - prevRef.clip.startTime);
    }
    clip.duration = roundSec(clipEnd - newStart);
    clip.startTime = roundSec(newStart);
  }

  return next;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function roundSec(v: number): number {
  return Math.round(v * 100) / 100;
}
