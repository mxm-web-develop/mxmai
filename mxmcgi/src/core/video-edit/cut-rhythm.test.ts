import { describe, expect, it } from 'vitest';
import {
  normalizeCutRhythmId,
  reflowSegmentsByModeDuration,
  resolveAutoCutRhythmBounds,
  resolveCutRhythmBounds,
  RENDER_MODE_DURATION,
} from './cut-rhythm';

describe('cut-rhythm', () => {
  it('normalizes legacy rhythm ids', () => {
    expect(normalizeCutRhythmId('science-promo')).toBe('default');
    expect(normalizeCutRhythmId('comic-drama')).toBe('fast');
    expect(normalizeCutRhythmId('slow')).toBe('slow');
  });

  it('auto resolves from subtitle density', () => {
    const fastSubs = Array.from({ length: 20 }, (_, i) => ({
      text: '短句',
      startSeconds: i * 2,
      endSeconds: i * 2 + 1.5,
    }));
    const fast = resolveAutoCutRhythmBounds(fastSubs, 40);
    expect(fast.resolved).toBe('fast');
    expect(fast.maxCutSeconds).toBeLessThanOrEqual(8);

    const slowSubs = [{ text: '这是一段比较长的口播解说内容', startSeconds: 0, endSeconds: 6 }];
    const slow = resolveAutoCutRhythmBounds(slowSubs, 60);
    expect(slow.resolved).toBe('slow');
    expect(slow.maxCutSeconds).toBe(15);
  });

  it('resolveCutRhythmBounds caps slow at 15s', () => {
    const b = resolveCutRhythmBounds({ cutRhythm: 'slow' });
    expect(b?.maxCutSeconds).toBe(15);
  });

  it('reflow splits long static-image segment at mode max', () => {
    const segs = reflowSegmentsByModeDuration(
      [
        {
          startSeconds: 0,
          endSeconds: 20,
          text: '长素材段',
          mxmRenderMode: 'static-image',
        },
      ],
      20,
      [
        { text: '句1', startSeconds: 0, endSeconds: 5 },
        { text: '句2', startSeconds: 5, endSeconds: 10 },
        { text: '句3', startSeconds: 10, endSeconds: 20 },
      ]
    );
    expect(segs.length).toBeGreaterThan(1);
    for (const s of segs) {
      expect(s.endSeconds - s.startSeconds).toBeLessThanOrEqual(12);
    }
    expect(segs[segs.length - 1]?.endSeconds).toBe(20);
  });

  it('render mode duration bounds', () => {
    expect(RENDER_MODE_DURATION['static-image'].maxSeconds).toBe(12);
    expect(RENDER_MODE_DURATION['ai-video-gen'].maxSeconds).toBe(12);
  });
});
