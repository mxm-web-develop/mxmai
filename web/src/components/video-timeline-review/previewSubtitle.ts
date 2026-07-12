import type { TimelineSubtitle } from './types';

const SUBTITLE_TIME_EPS = 0.05;

export function findSubtitleAtTime(
  subs: TimelineSubtitle[],
  time: number
): TimelineSubtitle | null {
  const t = Math.max(0, time);
  return (
    subs.find(
      (s) => t >= s.startTime - SUBTITLE_TIME_EPS && t < s.endTime + SUBTITLE_TIME_EPS
    ) ?? null
  );
}
