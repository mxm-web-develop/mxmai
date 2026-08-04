import { describe, expect, it } from 'vitest';
import { inferCodeFromMessage, mapUpstreamError } from './map-upstream-error';
import { sanitizeProgressError, shapeErrorForViewer } from './shape-error-response';
import { PLATFORM_ERROR_USER_MESSAGES } from './error-codes';

describe('mapUpstreamError', () => {
  it('maps Maxplan 529 overloaded to UPSTREAM_OVERLOADED', () => {
    const raw =
      'Maxplan API 请求失败: 529 Unknown Status {"type":"error","error":{"type":"overloaded_error","message":"当前服务集群负载较高","http_code":"529"},"request_id":"abc"} | proxy=http://127.0.0.1:7897 @ https://api.minimaxi.com/v1/text/chatcompletion_v2';
    const pe = mapUpstreamError(new Error(raw));
    expect(pe.code).toBe('UPSTREAM_OVERLOADED');
    expect(pe.userMessage).toBe(PLATFORM_ERROR_USER_MESSAGES.UPSTREAM_OVERLOADED);
    expect(pe.debugMessage).toContain('proxy=');
  });

  it('maps fetch/proxy network errors', () => {
    expect(inferCodeFromMessage('fetch failed | proxy=http://127.0.0.1:7897 @ https://x')).toBe(
      'NETWORK_ERROR'
    );
  });
});

describe('shapeErrorForViewer', () => {
  it('hides debugDetail for non-admin', () => {
    const { body } = shapeErrorForViewer(
      new Error('Maxplan API 请求失败: 529 overloaded_error proxy=http://127.0.0.1:7897'),
      { isAdmin: false }
    );
    expect(body.code).toBe('UPSTREAM_OVERLOADED');
    expect(body.error).toBe(PLATFORM_ERROR_USER_MESSAGES.UPSTREAM_OVERLOADED);
    expect(body.debugDetail).toBeUndefined();
  });

  it('includes debugDetail for admin', () => {
    const { body } = shapeErrorForViewer(
      new Error('Maxplan API 请求失败: 529 overloaded_error proxy=http://127.0.0.1:7897'),
      { isAdmin: true }
    );
    expect(body.debugDetail).toMatch(/proxy=/);
  });
});

describe('sanitizeProgressError', () => {
  it('replaces leaky progress.error for non-admin', () => {
    const out = sanitizeProgressError(
      {
        status: 'failed',
        error:
          'Maxplan API 请求失败: 529 {"type":"error","error":{"type":"overloaded_error"}} proxy=http://127.0.0.1:7897',
      },
      false
    );
    expect(out?.error).toBe(PLATFORM_ERROR_USER_MESSAGES.UPSTREAM_OVERLOADED);
    expect(out?.errorCode).toBe('UPSTREAM_OVERLOADED');
    expect((out as { errorDebug?: string })?.errorDebug).toBeUndefined();
  });

  it('keeps errorDebug for admin', () => {
    const raw = 'Maxplan API 请求失败: 529 overloaded_error proxy=http://127.0.0.1:7897';
    const out = sanitizeProgressError({ status: 'failed', error: raw }, true);
    expect(out?.error).toBe(PLATFORM_ERROR_USER_MESSAGES.UPSTREAM_OVERLOADED);
    expect((out as { errorDebug?: string })?.errorDebug).toBe(raw);
  });

  it('preserves actionable Chinese config errors instead of INTERNAL_ERROR', () => {
    const raw = 'extractHotTopics：证据缓存 / sources.websource 无检索条目，请先跑联网检索';
    const out = sanitizeProgressError({ status: 'failed', error: raw }, false);
    expect(out?.error).toContain('创作素材尚未就绪');
    expect(out?.error).not.toContain('extractHotTopics');
    expect(out?.error).not.toContain('sources.websource');
  });
});
