import type { VisualClipItem } from './timelineClipAtTime';

/** 仅渲染播放头附近片段，避免 dozens 个 <video> 同时解码 */
export function slicePreviewClipWindow<T extends { id: string }>(
  clips: T[],
  activeClipId?: string | null,
  radius = 1
): T[] {
  if (!clips.length) return [];
  if (!activeClipId) return clips.slice(0, Math.min(2, clips.length));

  const idx = clips.findIndex((c) => c.id === activeClipId);
  if (idx < 0) return clips.slice(0, Math.min(2, clips.length));

  const start = Math.max(0, idx - radius);
  const end = Math.min(clips.length, idx + radius + 1);
  return clips.slice(start, end);
}

export function clipElapsedSeconds(
  clip: VisualClipItem,
  currentTime: number,
  active: boolean
): number {
  if (!active) return 0;
  return Math.max(0, Math.min(clip.duration, currentTime - clip.startTime));
}
