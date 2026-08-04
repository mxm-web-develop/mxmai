import { describe, expect, it } from 'vitest';
import {
  resolveWebSearchQuery,
  resolveWebSearchTarget,
  resolveQueriesFromList,
  runWebSearchStep,
} from './web-search-step';
import type { TaskContext, PipelineStep } from '../types';
import { withContract } from './input-stage';
import { emptyContract, MXM_WARP_CONTRACT_VERSION } from './contract-types';

function baseCtx(overrides?: Partial<TaskContext>): TaskContext {
  return {
    scope: 'writing',
    taskKey: 'generator',
    subtype: 'warp-demo-daily',
    taskId: 't1',
    params: { topic: '知识库改名' },
    state: {},
    ...overrides,
  };
}

describe('mxm-warp webSearch step', () => {
  it('resolves query from params.query and queryFrom', () => {
    const ctx = baseCtx();
    expect(
      resolveWebSearchQuery(ctx, {
        step: 'webSearch',
        params: { query: '固定查询' },
      })
    ).toBe('固定查询');
    expect(
      resolveWebSearchQuery(ctx, {
        step: 'webSearch',
        params: { queryFrom: 'params.topic' },
      })
    ).toBe('知识库改名');
  });

  it('resolves enrich_search plan query when targeting enrich result', () => {
    let ctx = baseCtx();
    ctx = withContract(
      ctx,
      emptyContract({
        version: MXM_WARP_CONTRACT_VERSION,
        scope: 'writing',
        taskKey: 'generator',
        subtype: null,
        taskId: 't1',
      })
    );
    const c = (ctx.state.contract as any);
    c.enrich_search = { query: '深搜：日报素材', mode: 'deep' };
    ctx = { ...ctx, state: { ...ctx.state, contract: c } };
    expect(
      resolveWebSearchQuery(ctx, {
        step: 'webSearch',
        params: { target: 'enrich_search.result' },
      })
    ).toBe('深搜：日报素材');
  });

  it('defaults target to sources.websource', () => {
    expect(resolveWebSearchTarget({ step: 'webSearch', params: {} })).toBe('sources.websource');
    expect(
      resolveWebSearchTarget({
        step: 'webSearch',
        params: { target: 'enrich_search.result' },
      })
    ).toBe('enrich_search.result');
  });

  it('scaleFrom maps article_length to depth and maxResults', async () => {
    const { resolveWebSearchRequest, resolveScaledSearchKnobs } = await import('./web-search-step');
    const step = {
      step: 'webSearch' as const,
      params: {
        query: 'test',
        depth: 'standard',
        maxResults: 100,
        scaleFrom: 'article_length',
        depthByScale: { brief: 'quick', standard: 'standard', in_depth: 'deep' },
        maxResultsByScale: { brief: 48, standard: 100, in_depth: 200 },
      },
    };
    const brief = baseCtx({ params: { article_length: 'brief' } });
    expect(resolveScaledSearchKnobs(brief, step.params)).toEqual({ depth: 'quick', maxResults: 48 });
    const deep = baseCtx({ params: { article_length: 'in_depth' } });
    const req = resolveWebSearchRequest(deep, step, 'test');
    expect(req.depth).toBe('deep');
    expect(req.numResults).toBe(200);
  });

  it('writes sources.websource pointer + evidence payload', async () => {
    const step: PipelineStep = {
      step: 'webSearch',
      params: {
        queryFrom: 'params.topic',
        resultMaxChars: 400,
        maxResults: 2,
      },
    };
    const out = await runWebSearchStep(baseCtx(), step, {
      search: async () => ({
        providers: ['tavily'],
        items: [
          { title: 'A', url: 'https://a.example', snippet: 'aaa', domain: 'a.example' },
          { title: 'B', url: 'https://b.example', snippet: 'bbb', domain: 'b.example' },
        ],
      }),
    });
    const contract = out.state.contract as {
      sources: {
        websource: { query: string; digest?: string; hitCount: number; providers: string[]; evidenceKey: string };
      };
    };
    expect(contract.sources.websource.query).toBe('知识库改名');
    expect(contract.sources.websource.providers).toEqual(['tavily']);
    expect(contract.sources.websource.hitCount).toBeGreaterThan(0);
    expect(contract.sources.websource.evidenceKey).toBe('websource');
    expect((contract.sources.websource as { text?: string }).text).toBeUndefined();
    const ev = (out.state.evidence as { websource: { digestText: string; payload?: { text?: string } } })
      .websource;
    expect(ev.digestText).toContain('联网检索');
    expect(ev.payload?.text).toContain('联网检索');
  });

  it('writes enrich_search.result pointer + evidence', async () => {
    const step: PipelineStep = {
      step: 'webSearch',
      params: {
        query: 'enrich-q',
        target: 'enrich_search.result',
      },
    };
    const out = await runWebSearchStep(baseCtx(), step, {
      search: async () => ({
        providers: ['duckduckgo'],
        items: [{ title: 'X', url: 'https://x', snippet: 'y', domain: 'x' }],
      }),
    });
    const contract = out.state.contract as {
      enrich_search: { result: { query: string; digest?: string; evidenceKey: string } };
    };
    expect(contract.enrich_search.result.query).toBe('enrich-q');
    expect(contract.enrich_search.result.evidenceKey).toBe('enrich_result');
    const ev = (out.state.evidence as { enrich_result: { digestText: string } }).enrich_result;
    expect(ev.digestText).toContain('enrich-q');
  });

  it('writes enrich_search.result_supplement without touching result', async () => {
    expect(
      resolveWebSearchTarget({
        step: 'webSearch',
        params: { target: 'enrich_search.result_supplement' },
      })
    ).toBe('enrich_search.result_supplement');

    const seeded = withContract(
      baseCtx(),
      emptyContract({
        version: MXM_WARP_CONTRACT_VERSION,
        scope: 'writing',
        taskKey: 'generator',
        subtype: null,
        taskId: 't1',
      })
    );
    const c = seeded.state.contract as any;
    c.enrich_search = { result: { query: 'main-q', hitCount: 1 } };
    const step: PipelineStep = {
      step: 'webSearch',
      params: {
        query: 'supplement-q',
        target: 'enrich_search.result_supplement',
      },
    };
    const out = await runWebSearchStep(seeded, step, {
      search: async () => ({
        providers: ['duckduckgo'],
        items: [{ title: 'S', url: 'https://s', snippet: 'sup', domain: 's' }],
      }),
    });
    const contract = out.state.contract as {
      enrich_search: {
        result: { query: string };
        result_supplement: { query: string; evidenceKey: string };
      };
    };
    expect(contract.enrich_search.result.query).toBe('main-q');
    expect(contract.enrich_search.result_supplement.query).toBe('supplement-q');
    expect(contract.enrich_search.result_supplement.evidenceKey).toBe('enrich_supplement');
    const ev = (out.state.evidence as { enrich_supplement: { digestText: string } }).enrich_supplement;
    expect(ev.digestText).toContain('supplement-q');
  });

  it('skips search when sources.websource already present', async () => {
    let searched = false;
    const seeded = withContract(
      baseCtx(),
      emptyContract({
        version: MXM_WARP_CONTRACT_VERSION,
        scope: 'writing',
        taskKey: 'generator',
        subtype: 'warp-demo-daily',
        taskId: 't1',
      })
    );
    const withSource = withContract(seeded, {
      ...(seeded.state.contract as object),
      sources: {
        websource: {
          query: 'preview',
          hitCount: 2,
          items: [{ title: '预览话题一' }, { title: '预览话题二' }],
        },
      },
    } as never);
    const out = await runWebSearchStep(
      withSource,
      { step: 'webSearch', params: { query: 'should-not-run' } },
      {
        search: async () => {
          searched = true;
          return { providers: [], items: [] };
        },
      }
    );
    expect(searched).toBe(false);
    const web = (out.state.contract as { sources: { websource: { query: string } } }).sources
      .websource;
    expect(web.query).toBe('preview');
  });

  it('resolves industryTrend queryBuilder with industry + date', () => {
    const ctx = baseCtx({
      params: { industry: '金融', date_mode: 'today' },
    });
    const q = resolveWebSearchQuery(ctx, {
      step: 'webSearch',
      params: { queryBuilder: 'industryTrend' },
    });
    expect(q).toContain('finance');
    expect(q).toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(q).toMatch(/market news/i);
  });

  it('industryTrend cn region keeps chinese query and domains', async () => {
    const { resolveWebSearchRequest } = await import('./web-search-step');
    const ctx = baseCtx({
      params: { industry: '科技', date_mode: 'yesterday', search_region: 'cn' },
    });
    const step = { step: 'webSearch' as const, params: { queryBuilder: 'industryTrend', maxResults: 8 } };
    const q = resolveWebSearchQuery(ctx, step);
    expect(q).toContain('科技');
    expect(q).toMatch(/\d{4}年\d{1,2}月\d{1,2}日/);
    const req = resolveWebSearchRequest(ctx, step, q);
    expect(req.includeDomains?.some((d) => d.includes('36kr'))).toBe(true);
    expect(req.language).toBe('all');
  });

  it('industryTrend tech query uses tech suffix not 财经', async () => {
    const { resolveWebSearchRequest } = await import('./web-search-step');
    const ctx = baseCtx({
      params: { industry: '科技', date_mode: 'yesterday' },
    });
    const step = { step: 'webSearch' as const, params: { queryBuilder: 'industryTrend', maxResults: 8 } };
    const q = resolveWebSearchQuery(ctx, step);
    expect(q).toContain('technology');
    expect(q).not.toMatch(/财经|要闻|头条/);
    const req = resolveWebSearchRequest(ctx, step, q);
    expect(req.dimensions).toEqual(['news', 'general']);
    // 默认全球：不强制大陆域名白名单
    expect(req.includeDomains).toBeUndefined();
    expect(req.language).toBe('all');
    expect(req.timeRange).toBe('day');
    expect(req.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(req.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('industryTrend this_week uses week window and query token', async () => {
    const { resolveWebSearchRequest } = await import('./web-search-step');
    const ctx = baseCtx({
      params: { industry: '足球', date_mode: 'this_week' },
    });
    const step = { step: 'webSearch' as const, params: { queryBuilder: 'industryTrend', maxResults: 8 } };
    const q = resolveWebSearchQuery(ctx, step);
    expect(q).toMatch(/football|soccer/i);
    expect(q).toMatch(/this week/i);
    const req = resolveWebSearchRequest(ctx, step, q);
    expect(req.timeRange).toBe('week');
    expect(req.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(req.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('industryTrend this_month uses month window', async () => {
    const { resolveWebSearchRequest } = await import('./web-search-step');
    const ctx = baseCtx({
      params: { industry: '股票', date_mode: '本月' },
    });
    const step = { step: 'webSearch' as const, params: { queryBuilder: 'industryTrend', maxResults: 8 } };
    const q = resolveWebSearchQuery(ctx, step);
    expect(q).toMatch(/stock|equit/i);
    expect(q).toMatch(/this month/i);
    const req = resolveWebSearchRequest(ctx, step, q);
    expect(req.timeRange).toBe('month');
  });

  it('industryTrend omitTopic ignores core_topic for period overview', () => {
    const ctx = baseCtx({
      params: {
        industry: '股票',
        date_mode: 'this_week',
        core_topic: '长鑫科技将被纳入MSCI；A股周线收红',
      },
    });
    const withTopic = resolveWebSearchQuery(ctx, {
      step: 'webSearch',
      params: { queryBuilder: 'industryTrend' },
    });
    expect(withTopic).toContain('长鑫');
    const omit = resolveWebSearchQuery(ctx, {
      step: 'webSearch',
      params: { queryBuilder: 'industryTrend', omitTopic: true },
    });
    expect(omit).not.toContain('长鑫');
    expect(omit).toMatch(/stock|equit|this week/i);
  });

  it('generic path passes timeRange and dimensions from node params', async () => {
    const { resolveWebSearchRequest, buildGenericWebSearchRequest } = await import('./web-search-step');
    const ctx = baseCtx({ params: { topic: 'AI chips' } });
    const step = {
      step: 'webSearch' as const,
      params: {
        query: 'AI chips news',
        timeRange: 'week',
        dimensions: ['news', 'finance'],
        language: 'en',
        includeDomains: 'reuters.com,bloomberg.com',
        startDate: '2026-07-01',
        endDate: '2026-07-24',
        maxResults: 10,
      },
    };
    const q = resolveWebSearchQuery(ctx, step);
    expect(q).toBe('AI chips news');
    const req = resolveWebSearchRequest(ctx, step, q);
    expect(req.timeRange).toBe('week');
    expect(req.dimensions).toEqual(['news', 'finance']);
    expect(req.language).toBe('en');
    expect(req.includeDomains).toEqual(['reuters.com', 'bloomberg.com']);
    expect(req.startDate).toBe('2026-07-01');
    expect(req.endDate).toBe('2026-07-24');
    const generic = buildGenericWebSearchRequest(step, q, { depth: 'standard', maxResults: 10 });
    expect(generic.timeRange).toBe('week');
  });

  it('multiQuery builds N+1 sub-queries and merges results across providers', async () => {
    const { runWebSearchStep } = await import('./web-search-step');
    const seenQueries: string[] = [];
    const out = await runWebSearchStep(
      baseCtx(),
      {
        step: 'webSearch',
        params: {
          query: 'AI 创始人',
          multiQuery: { enabled: true, extra: 2, maxQueries: 4 },
          extractContent: false,
        },
      },
      {
        search: async (args) => {
          seenQueries.push(args.query);
          return {
            providers: [args.query.includes('争议') ? 'tavily' : 'brave'],
            items: [
              {
                title: `${args.query}-A`,
                url: `https://e.example/${encodeURIComponent(args.query)}/a`,
                snippet: 'aa',
                domain: 'e.example',
              },
            ],
          };
        },
      }
    );
    expect(seenQueries.length).toBeGreaterThan(1);
    expect(seenQueries[0]).toBe('AI 创始人');
    const pointer = (out.state.contract as { sources: { websource: { hitCount: number; evidenceKey: string } } })
      .sources.websource;
    expect(pointer.evidenceKey).toBe('websource');
    expect(pointer.hitCount).toBeGreaterThan(0);
    const payload = (out.state.evidence as { websource: { payload?: { queries?: string[]; providers: string[] } } })
      .websource.payload;
    expect(payload?.queries).toBeDefined();
    expect(payload!.queries!.length).toBe(seenQueries.length);
    expect(payload!.providers.length).toBeGreaterThanOrEqual(1);
  });

  it('default extractContent true threads extracted[] into evidence payload', async () => {
    const { runWebSearchStep } = await import('./web-search-step');
    const out = await runWebSearchStep(
      baseCtx(),
      {
        step: 'webSearch',
        params: { query: 'AI', extractContent: true, maxResults: 1 },
      },
      {
        search: async () => ({
          providers: ['tavily'],
          items: [
            {
              title: 'A',
              url: 'https://a.example',
              snippet: 'snippet',
              domain: 'a.example',
            },
          ],
          extractedContent: [
            {
              url: 'https://a.example',
              title: 'A',
              summary: 'summary-A',
              keyPoints: ['k1'],
            },
          ],
        }),
      }
    );
    const payload = (out.state.evidence as { websource: { payload?: { extracted?: unknown[] } } }).websource
      .payload;
    expect(Array.isArray(payload?.extracted)).toBe(true);
    expect(payload!.extracted!.length).toBe(1);
    expect((payload!.extracted![0] as { summary: string }).summary).toBe('summary-A');
  });

  it('resolveQueriesFromList excludes main topic and applies suffix', () => {
    const ctx = withContract(baseCtx(), {
      ...emptyContract({
        version: MXM_WARP_CONTRACT_VERSION,
        scope: 'writing',
        taskKey: 'generator',
        subtype: 'industry-daily',
        taskId: 't1',
      }),
      basic: { main_topic: '主线A' },
      selection: { topics: ['主线A', '副线B', '副线C'] },
    });
    const qs = resolveQueriesFromList(ctx, {
      step: 'webSearch',
      params: {
        queriesFrom: 'contract.selection.topics',
        excludeQueryFrom: 'contract.basic.main_topic',
        querySuffix: '简讯',
        maxQueries: 3,
      },
    });
    expect(qs).toEqual(['副线B 简讯', '副线C 简讯']);
  });

  it('queriesFrom with only main topic no-ops without search', async () => {
    const ctx = withContract(baseCtx(), {
      ...emptyContract({
        version: MXM_WARP_CONTRACT_VERSION,
        scope: 'writing',
        taskKey: 'generator',
        subtype: 'industry-daily',
        taskId: 't1',
      }),
      basic: { main_topic: '仅主线' },
      selection: { topics: ['仅主线'] },
    });
    let called = 0;
    const out = await runWebSearchStep(
      ctx,
      {
        step: 'webSearch',
        params: {
          queriesFrom: 'contract.selection.topics',
          excludeQueryFrom: 'contract.basic.main_topic',
          target: 'enrich_search.result_side',
        },
      },
      {
        search: async () => {
          called += 1;
          return { providers: [], items: [] };
        },
      }
    );
    expect(called).toBe(0);
    expect((out.state.evidence as Record<string, unknown> | undefined)?.enrich_result_side).toBeUndefined();
  });
});
