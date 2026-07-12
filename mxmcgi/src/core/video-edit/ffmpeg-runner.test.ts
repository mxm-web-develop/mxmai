import { describe, expect, it } from 'vitest';
import { buildImageFitFilter, buildImageMotionFilter } from './ffmpeg-runner';

describe('buildImageMotionFilter', () => {
  it('falls back to fit filter when motion is none', () => {
    expect(buildImageMotionFilter('none', 1920, 1080, 5, 30)).toBe(
      buildImageFitFilter('cover', 1920, 1080)
    );
  });

  it('uses zoompan for zoom-in', () => {
    const vf = buildImageMotionFilter('zoom-in', 1920, 1080, 4, 30);
    expect(vf).toContain('zoompan=');
    expect(vf).toContain('s=1920x1080');
    expect(vf).toContain('fps=30');
    expect(vf).toContain('on/119');
  });

  it('maps motion progress to full clip duration', () => {
    const vf = buildImageMotionFilter('zoom-in', 1920, 1080, 5, 30);
    expect(vf).toContain('d=150');
    expect(vf).toContain('on/149');
  });

  it('uses zoompan for pan-left', () => {
    const vf = buildImageMotionFilter('pan-left', 1080, 1920, 6, 24);
    expect(vf).toContain('zoompan=');
    expect(vf).toContain('s=1080x1920');
  });
});
