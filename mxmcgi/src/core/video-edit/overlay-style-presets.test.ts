import { describe, expect, it } from 'vitest';
import {
  pickDefaultOverlayStyle,
  positionForLayout,
  styleForOverlayPreset,
} from './overlay-style-presets';

describe('overlay-style-presets', () => {
  it('yt-headline has large size and stroke', () => {
    const style = styleForOverlayPreset('yt-headline');
    expect(style.fontSize).toBeGreaterThanOrEqual(64);
    expect(style.strokeWidth).toBeGreaterThanOrEqual(4);
    expect(style.color.toLowerCase()).toContain('facc15');
  });

  it('short text maps to bili-keyword on the right', () => {
    const { style, layout } = pickDefaultOverlayStyle('人形机器人');
    expect(style.fontSize).toBeGreaterThanOrEqual(56);
    expect(layout).toBe('center-right');
    expect(positionForLayout(layout).x).toBeGreaterThan(0.5);
  });

  it('price-like text maps to price-tag', () => {
    const { layout } = pickDefaultOverlayStyle('¥99,000');
    expect(layout).toBe('center-right');
  });
});
