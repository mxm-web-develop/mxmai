import { describe, expect, it } from 'vitest';
import { planRhythmWindows } from './plan-cut-windows';

describe('planRhythmWindows', () => {
  const subs = [
    { text: '句一', startSeconds: 0, endSeconds: 1.5 },
    { text: '句二', startSeconds: 1.5, endSeconds: 3 },
    { text: '句三', startSeconds: 3, endSeconds: 4.5 },
    { text: '句四', startSeconds: 4.5, endSeconds: 6 },
    { text: '句五', startSeconds: 6, endSeconds: 7.5 },
    { text: '句六', startSeconds: 7.5, endSeconds: 9 },
  ];

  it('merges subtitles into rhythm windows with default cut', () => {
    const plan = planRhythmWindows({
      voiceoverSegmentsRaw: subs,
      totalDurationSeconds: 20,
      cutRhythm: 'default',
    });
    expect(plan.windows.length).toBeGreaterThan(0);
    expect(plan.windows.length).toBeLessThan(subs.length);
    expect(plan.windows[0]?.startSeconds).toBe(0);
    expect(plan.windows[plan.windows.length - 1]?.endSeconds).toBe(20);
    for (const w of plan.windows) {
      expect(w.voiceoverText.length).toBeGreaterThan(0);
      expect(w.durationSeconds).toBeGreaterThanOrEqual(4);
    }
  });

  it('fast rhythm yields more windows than slow', () => {
    const many = Array.from({ length: 24 }, (_, i) => ({
      text: `句${i + 1}`,
      startSeconds: i * 2,
      endSeconds: i * 2 + 1.5,
    }));
    const fast = planRhythmWindows({
      voiceoverSegmentsRaw: many,
      totalDurationSeconds: 48,
      cutRhythm: 'fast',
    });
    const slow = planRhythmWindows({
      voiceoverSegmentsRaw: many,
      totalDurationSeconds: 48,
      cutRhythm: 'slow',
    });
    expect(fast.windows.length).toBeGreaterThan(slow.windows.length);
  });
});
