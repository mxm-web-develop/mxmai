import { describe, expect, it } from 'vitest';
import { toUserFacingError, PLATFORM_ERROR_USER_MESSAGES } from './platformErrors';

describe('toUserFacingError', () => {
  it('maps Maxplan 529 leaky string for non-admin', () => {
    const raw =
      'Maxplan API 请求失败: 529 Unknown Status {"type":"error","error":{"type":"overloaded_error"}} | proxy=http://127.0.0.1:7897 @ https://api.minimaxi.com/v1/text/chatcompletion_v2';
    const faced = toUserFacingError(raw, { isAdmin: false });
    expect(faced.code).toBe('UPSTREAM_OVERLOADED');
    expect(faced.message).toBe(PLATFORM_ERROR_USER_MESSAGES.UPSTREAM_OVERLOADED);
    expect(faced.debugDetail).toBeUndefined();
  });

  it('exposes debugDetail for admin', () => {
    const raw = 'Maxplan API 请求失败: 529 overloaded_error proxy=http://127.0.0.1:7897';
    const faced = toUserFacingError(raw, { isAdmin: true });
    expect(faced.message).toBe(PLATFORM_ERROR_USER_MESSAGES.UPSTREAM_OVERLOADED);
    expect(faced.debugDetail).toContain('proxy=');
  });

  it('prefers API code field', () => {
    const faced = toUserFacingError(
      { code: 'UPSTREAM_RATE_LIMIT', error: '请求过于频繁，请稍后再试' },
      { isAdmin: false }
    );
    expect(faced.code).toBe('UPSTREAM_RATE_LIMIT');
  });
});
