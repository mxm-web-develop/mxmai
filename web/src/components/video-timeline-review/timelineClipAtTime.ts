import type { TimelineClip } from './types';

export type VisualClipItem = TimelineClip & { trackType: string; trackName: string };

/** 播放头落在哪个视觉片段上（含片段尾端浮点边界） */
export function findVisualClipAtTime(
  clips: VisualClipItem[],
  time: number
): VisualClipItem | null {
  if (!clips.length) return null;
  const sorted = [...clips].sort((a, b) => a.startTime - b.startTime);
  const found = sorted.find(
    (c) => time >= c.startTime && time < c.startTime + c.duration
  );
  if (found) return found;
  for (const c of sorted) {
    const end = c.startTime + c.duration;
    if (Math.abs(time - end) < 0.05) return c;
  }
  return null;
}
