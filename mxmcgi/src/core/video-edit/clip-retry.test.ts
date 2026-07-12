import { describe, expect, it, vi } from 'vitest';
import {
  clipRetryDelayMs,
  parseClipRenderAttempts,
  parseClipUploadAttempts,
  withRetries,
} from './clip-retry';

describe('clip-retry', () => {
  it('defaults render/upload attempts to 3', () => {
    expect(parseClipRenderAttempts({})).toBe(3);
    expect(parseClipUploadAttempts({})).toBe(3);
  });

  it('clamps attempts to 1..5', () => {
    expect(parseClipRenderAttempts({ VIDEO_EDIT_CLIP_RENDER_ATTEMPTS: '0' })).toBe(3);
    expect(parseClipRenderAttempts({ VIDEO_EDIT_CLIP_RENDER_ATTEMPTS: '99' })).toBe(5);
    expect(parseClipUploadAttempts({ VIDEO_EDIT_CLIP_UPLOAD_ATTEMPTS: '2' })).toBe(2);
  });

  it('uses exponential backoff capped at 5s', () => {
    expect(clipRetryDelayMs(0)).toBe(600);
    expect(clipRetryDelayMs(1)).toBe(1200);
    expect(clipRetryDelayMs(2)).toBe(2400);
    expect(clipRetryDelayMs(10)).toBe(5000);
  });

  it('retries until success', async () => {
    vi.useFakeTimers();
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail-1'))
      .mockRejectedValueOnce(new Error('fail-2'))
      .mockResolvedValueOnce('ok');

    const promise = withRetries(3, run);
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe('ok');
    expect(run).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('throws last error after exhausting attempts', async () => {
    vi.useFakeTimers();
    const run = vi.fn().mockRejectedValue(new Error('always'));
    const promise = withRetries(2, run);
    const assertion = expect(promise).rejects.toThrow('always');
    await vi.runAllTimersAsync();
    await assertion;
    expect(run).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
