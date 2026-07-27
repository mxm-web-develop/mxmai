import { describe, expect, it } from 'vitest';
import { resolveTimelineReviewHint, sanitizeReviewHint } from './manualReviewUserCopy';

describe('manualReviewUserCopy', () => {
  it('strips internal config terms from gate hints', () => {
    const raw =
      '按切镜节奏检查各段模式与素材：可切换 mxmRenderMode、选静态图、生成 GSAP。开启自动配视频时优先使用 Pexels 视频素材（需服务端配置 PEXELS_API_KEY）。';
    const out = sanitizeReviewHint(raw);
    expect(out).not.toContain('mxmRenderMode');
    expect(out).not.toContain('PEXELS_API_KEY');
    expect(out).not.toContain('Pexels');
  });

  it('falls back to user-facing default hint', () => {
    expect(resolveTimelineReviewHint({ isRenderedReview: false })).toMatch(/分镜|storyboard|Edit storyboard/i);
  });
});
