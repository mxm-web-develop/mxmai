import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  buildWritingPptxOfficeEmbedSrc,
  signWritingPptxPublicAccess,
  verifyWritingPptxPublicAccess,
} from './writing-office-preview-sign';

describe('writing-office-preview-sign', () => {
  const prev = { ...process.env };

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-sign-secret-for-office-preview';
    process.env.PUBLIC_GATEWAY_ORIGIN = 'https://mxm-ai.com';
  });

  afterEach(() => {
    process.env = { ...prev };
  });

  it('signs and verifies', () => {
    const now = Math.floor(Date.now() / 1000);
    const { exp, sig } = signWritingPptxPublicAccess('task-1', { nowSec: now, ttlSec: 3600 });
    expect(verifyWritingPptxPublicAccess('task-1', exp, sig)).toBe(true);
    expect(verifyWritingPptxPublicAccess('task-2', exp, sig)).toBe(false);
    expect(verifyWritingPptxPublicAccess('task-1', exp - 1, sig)).toBe(false);
  });

  it('rejects expired', () => {
    const now = Math.floor(Date.now() / 1000);
    const { exp, sig } = signWritingPptxPublicAccess('task-1', { nowSec: now - 10_000, ttlSec: 60 });
    expect(exp).toBeLessThan(now);
    expect(verifyWritingPptxPublicAccess('task-1', exp, sig)).toBe(false);
  });

  it('builds https office src', () => {
    const url = buildWritingPptxOfficeEmbedSrc('abc');
    expect(url).toMatch(/^https:\/\/mxm-ai\.com\/api\/v1\/media\/public\/writing\/abc\?exp=\d+&sig=[a-f0-9]{64}$/);
  });

  it('returns null without https gateway', () => {
    process.env.PUBLIC_GATEWAY_ORIGIN = 'http://localhost:3000';
    expect(buildWritingPptxOfficeEmbedSrc('abc')).toBeNull();
  });
});
