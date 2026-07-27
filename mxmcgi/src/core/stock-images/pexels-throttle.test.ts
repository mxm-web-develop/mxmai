import { afterEach, describe, expect, it } from 'vitest';
import {
  clearPexelsCooldown,
  getCachedPexelsResult,
  isPexelsInCooldown,
  isPexelsRateLimitError,
  markPexelsCooldown,
  setCachedPexelsResult,
} from './pexels-throttle';

describe('pexels-throttle', () => {
  afterEach(() => {
    clearPexelsCooldown();
  });

  it('detects 429-style errors', () => {
    expect(isPexelsRateLimitError(new Error('Pexels 搜索失败 (429): Throttle limit exceeded'))).toBe(
      true
    );
    expect(isPexelsRateLimitError(new Error('network down'))).toBe(false);
  });

  it('marks cooldown window', () => {
    expect(isPexelsInCooldown()).toBe(false);
    markPexelsCooldown(30_000);
    expect(isPexelsInCooldown()).toBe(true);
    clearPexelsCooldown();
    expect(isPexelsInCooldown()).toBe(false);
  });

  it('caches search payloads', () => {
    setCachedPexelsResult('img:robot:1:12', { items: [{ id: '1' }], total: 1 });
    expect(getCachedPexelsResult<{ items: unknown[] }>('img:robot:1:12')?.items).toHaveLength(1);
  });
});
