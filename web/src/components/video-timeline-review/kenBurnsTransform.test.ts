import { describe, expect, it } from 'vitest';
import { kenBurnsTransform } from './kenBurnsTransform';

describe('kenBurnsTransform', () => {
  it('returns undefined for none', () => {
    expect(kenBurnsTransform('none', 0.5)).toBeUndefined();
  });

  it('interpolates zoom-in', () => {
    expect(kenBurnsTransform('zoom-in', 0)).toBe('scale(1.0000)');
    expect(kenBurnsTransform('zoom-in', 1)).toBe('scale(1.1400)');
  });

  it('interpolates pan-down endpoints', () => {
    expect(kenBurnsTransform('pan-down', 0)).toBe('scale(1.12) translateY(-2.0000%)');
    expect(kenBurnsTransform('pan-down', 1)).toBe('scale(1.12) translateY(2.0000%)');
  });

  it('clamps progress', () => {
    expect(kenBurnsTransform('zoom-in', -1)).toBe('scale(1.0000)');
    expect(kenBurnsTransform('zoom-in', 2)).toBe('scale(1.1400)');
  });
});
