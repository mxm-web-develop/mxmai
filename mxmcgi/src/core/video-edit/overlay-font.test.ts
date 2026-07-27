import { describe, expect, it } from 'vitest';
import { resetOverlayFontCache, resolveOverlayFontFile } from './overlay-font';

describe('resolveOverlayFontFile', () => {
  it('prefers a real CJK-capable font over DejaVu', () => {
    resetOverlayFontCache();
    const font = resolveOverlayFontFile();
    expect(font).not.toMatch(/dejavu/i);
    expect(font.length).toBeGreaterThan(0);
  });
});
