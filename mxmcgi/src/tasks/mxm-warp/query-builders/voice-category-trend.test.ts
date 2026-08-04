import { describe, expect, it } from 'vitest';
import { listWebSearchQueryBuilderNames, resolveWebSearchQueryBuilder } from './index';
import { buildVoiceCategoryTrendQueries } from '../voice-style-topics';
import type { TaskContext } from '../../types';

describe('voiceCategoryTrend queryBuilder', () => {
  it('is registered alongside industryTrend', () => {
    const names = listWebSearchQueryBuilderNames();
    expect(names).toContain('voiceCategoryTrend');
    expect(names).toContain('industryTrend');
  });

  it('buildQuery uses voice_category from params', () => {
    const builder = resolveWebSearchQueryBuilder('voiceCategoryTrend');
    expect(builder).toBeTruthy();
    const ctx = {
      params: { voice_category: 'self_media', language: 'zh' },
      state: {},
    } as TaskContext;
    const q = builder!.buildQuery(ctx, { step: 'webSearch', params: {} });
    const expected = buildVoiceCategoryTrendQueries({
      voiceCategory: 'self_media',
      language: 'zh',
    });
    expect(q).toBe(expected.primary);
  });

  it('with voice_id uses style search_angles without show names', async () => {
    const builder = resolveWebSearchQueryBuilder('voiceCategoryTrend');
    expect(builder).toBeTruthy();
    const ctx = {
      params: {
        voice_category: 'talk_brief',
        voice_id: 'talk_yuanzhuo',
        language: 'zh',
      },
      state: {},
    } as TaskContext;
    const step = { step: 'webSearch' as const, params: {} };
    const primary = builder!.buildQuery(ctx, step);
    expect(primary).toMatch(/热议|新闻|社会|经济|公共|议题/);
    expect(primary).not.toMatch(/圆桌派|锵锵|鲁豫/);

    const searchFn = async (req: { query: string }) => ({
      items: [{ title: req.query, url: `https://ex.test/${encodeURIComponent(req.query)}`, snippet: '' }],
      providers: ['mock'],
    });
    const multi = await builder!.runMultiQuery!({
      ctx,
      step,
      searchRequest: { query: primary, dimensions: ['web'], depth: 'standard', numResults: 9 },
      searchFn,
      maxResults: 9,
      primaryQuery: primary,
    });
    expect(multi.queryLabel).toMatch(/多切面|代际|机制/);
    expect(multi.queryLabel).not.toMatch(/圆桌派|鲁豫/);
  });
});
