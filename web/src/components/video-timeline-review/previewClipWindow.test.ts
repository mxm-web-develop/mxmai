import { describe, expect, it } from 'vitest';
import { clipElapsedSeconds, slicePreviewClipWindow } from './previewClipWindow';
import { runWithConcurrency } from './runWithConcurrency';
import type { VisualClipItem } from './timelineClipAtTime';

function clip(id: string, start: number, duration: number): VisualClipItem {
  return {
    id,
    startTime: start,
    duration,
    trackType: 'video',
    trackName: 'V1',
    metadata: { mxmRenderMode: 'static-image' },
  };
}

describe('previewClipWindow', () => {
  it('returns active clip with neighbors', () => {
    const clips = [clip('a', 0, 8), clip('b', 8, 8), clip('c', 16, 8), clip('d', 24, 8)];
    expect(slicePreviewClipWindow(clips, 'c', 1).map((c) => c.id)).toEqual(['b', 'c', 'd']);
  });

  it('computes elapsed within clip bounds', () => {
    const c = clip('a', 10, 8);
    expect(clipElapsedSeconds(c, 14, true)).toBe(4);
    expect(clipElapsedSeconds(c, 30, true)).toBe(8);
    expect(clipElapsedSeconds(c, 14, false)).toBe(0);
  });
});

describe('runWithConcurrency', () => {
  it('runs tasks with limited concurrency', async () => {
    let running = 0;
    let maxRunning = 0;
    const out = await runWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((r) => setTimeout(r, 5));
      running -= 1;
      return n * 2;
    });
    expect(out).toEqual([2, 4, 6, 8, 10]);
    expect(maxRunning).toBeLessThanOrEqual(2);
  });
});
