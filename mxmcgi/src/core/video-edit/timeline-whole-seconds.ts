/**
 * 分镜时间轴整秒对齐 — 便于 Seedance 等 AI 视频接口（不支持 3.21s 这类碎秒）
 */
import type { TimelineVisualSegment } from './timeline-segment-types';

/** 四舍五入到整秒 */
export function roundToWholeSeconds(n: number): number {
  return Math.round(n);
}

/**
 * 将可视分镜段对齐为整秒切分：连续无黑场、总和 = round(totalDuration)
 */
export function snapVisualSegmentsToWholeSeconds(
  segments: TimelineVisualSegment[],
  totalDuration: number
): TimelineVisualSegment[] {
  const total = Math.max(1, roundToWholeSeconds(totalDuration));
  if (!segments.length) {
    return [{ startSeconds: 0, endSeconds: total, text: '' }];
  }
  if (segments.length === 1) {
    const only = segments[0]!;
    return [{ ...only, startSeconds: 0, endSeconds: total }];
  }

  const weights = segments.map((s) => Math.max(0.05, s.endSeconds - s.startSeconds));
  const weightSum = weights.reduce((a, b) => a + b, 0);

  const exact = weights.map((w) => (w / weightSum) * total);
  const durations = exact.map((e) => Math.floor(e));
  let leftover = total - durations.reduce((a, b) => a + b, 0);

  const order = exact
    .map((e, i) => ({ i, frac: e - Math.floor(e) }))
    .sort((a, b) => b.frac - a.frac);

  for (let k = 0; k < leftover; k++) {
    durations[order[k % order.length]!.i]! += 1;
  }

  for (let i = 0; i < durations.length; i++) {
    if (durations[i]! >= 1) continue;
    const donor = durations.indexOf(Math.max(...durations));
    if (donor === i || durations[donor]! <= 1) continue;
    durations[donor]! -= 1;
    durations[i]! += 1;
  }

  let cursor = 0;
  const out = segments.map((s, i) => {
    const dur = Math.max(1, durations[i] ?? 1);
    const seg: TimelineVisualSegment = {
      ...s,
      startSeconds: cursor,
      endSeconds: cursor + dur,
    };
    cursor += dur;
    return seg;
  });

  const last = out[out.length - 1]!;
  if (last.endSeconds !== total) {
    last.endSeconds = total;
  }

  if (last.endSeconds - last.startSeconds < 1 && out.length > 1) {
    const prev = out[out.length - 2]!;
    prev.text = `${prev.text} ${last.text}`.trim();
    prev.endSeconds = total;
    out.pop();
  }

  return out.filter((s) => s.endSeconds > s.startSeconds);
}

export function isWholeSecondTimeline(segments: TimelineVisualSegment[]): boolean {
  return segments.every((s) => {
    const start = s.startSeconds;
    const end = s.endSeconds;
    const dur = end - start;
    return Number.isInteger(start) && Number.isInteger(end) && Number.isInteger(dur);
  });
}
