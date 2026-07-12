import { describe, expect, it } from 'vitest';
import { snapVisualSegmentsToWholeSeconds, isWholeSecondTimeline } from './timeline-whole-seconds';
import { mergeVoiceoverSegmentsByCutRhythm, resolveTimelineVisualSegments } from './timeline-segment-resolvers';

describe('timeline-whole-seconds', () => {
  it('snapVisualSegmentsToWholeSeconds 连续整秒且无碎秒', () => {
    const snapped = snapVisualSegmentsToWholeSeconds(
      [
        { startSeconds: 0, endSeconds: 3.21, text: 'a' },
        { startSeconds: 3.21, endSeconds: 10.87, text: 'b' },
        { startSeconds: 10.87, endSeconds: 18.44, text: 'c' },
      ],
      18.44
    );
    expect(isWholeSecondTimeline(snapped)).toBe(true);
    expect(snapped[0]?.startSeconds).toBe(0);
    expect(snapped[snapped.length - 1]?.endSeconds).toBe(18);
    for (let i = 0; i < snapped.length - 1; i++) {
      expect(snapped[i]!.endSeconds).toBe(snapped[i + 1]!.startSeconds);
    }
  });

  it('resolveTimelineVisualSegments 输出整秒切镜', () => {
    const subs = Array.from({ length: 20 }, (_, i) => ({
      text: `句${i + 1}`,
      startSeconds: i * 2.37,
      endSeconds: i * 2.37 + 1.8,
    }));
    const merged = resolveTimelineVisualSegments({
      strategy: 'voiceover-subtitles',
      totalDurationSeconds: 47.6,
      segmentsRaw: subs,
      cutRhythm: 'science-promo',
    });
    expect(isWholeSecondTimeline(merged)).toBe(true);
    expect(merged[merged.length - 1]?.endSeconds).toBe(48);
    for (const w of merged) {
      const dur = w.endSeconds - w.startSeconds;
      expect(Number.isInteger(dur)).toBe(true);
      expect(dur).toBeGreaterThanOrEqual(1);
    }
  });

  it('mergeVoiceoverSegmentsByCutRhythm 经 snap 后末镜对齐整秒总时长', () => {
    const subs = Array.from({ length: 15 }, (_, i) => ({
      text: `句${i + 1}`,
      startSeconds: i * 2,
      endSeconds: i * 2 + 1.5,
    }));
    const raw = mergeVoiceoverSegmentsByCutRhythm(subs, 60.3, 8, 15);
    const snapped = snapVisualSegmentsToWholeSeconds(raw, 60.3);
    expect(snapped[snapped.length - 1]?.endSeconds).toBe(60);
    expect(isWholeSecondTimeline(snapped)).toBe(true);
  });
});
