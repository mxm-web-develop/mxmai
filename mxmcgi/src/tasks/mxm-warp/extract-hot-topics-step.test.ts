import { describe, expect, it } from 'vitest';
import { resolveHotTopicsContext } from './extract-hot-topics-step';

describe('resolveHotTopicsContext', () => {
  it('skips date resolution when no date fields', () => {
    const ctx = resolveHotTopicsContext(
      { industry: '足球' },
      { step: 'extractHotTopics', params: {} }
    );
    expect(ctx.sector).toBe('足球');
    expect(ctx.ymd).toBe('');
    expect(ctx.dateLabel).toBe('');
  });

  it('resolves date when date_mode present', () => {
    const ctx = resolveHotTopicsContext(
      { industry: '股票', date_mode: 'today' },
      { step: 'extractHotTopics', params: {} }
    );
    expect(ctx.sector).toBe('股票');
    expect(ctx.ymd).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(ctx.dateLabel).toBeTruthy();
  });

  it('honors sectorFrom mapping', () => {
    const ctx = resolveHotTopicsContext(
      { niche: '网球', industry: '体育' },
      { step: 'extractHotTopics', params: { sectorFrom: 'niche' } }
    );
    expect(ctx.sector).toBe('网球');
  });
});
