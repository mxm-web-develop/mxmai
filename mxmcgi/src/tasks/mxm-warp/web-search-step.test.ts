import { describe, expect, it } from 'vitest';
import {
  resolveWebSearchQuery,
  resolveWebSearchTarget,
  runWebSearchStep,
} from './web-search-step';
import type { TaskContext, PipelineStep } from '../types';
import { withContract } from './input-stage';
import { emptyContract, MXM_WARP_CONTRACT_VERSION } from './contract-types';

function baseCtx(overrides?: Partial<TaskContext>): TaskContext {
  return {
    scope: 'writing',
    taskKey: 'editorial',
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
        taskKey: 'editorial',
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

  it('writes sources.websource with truncated text', async () => {
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
      sources: { websource: { query: string; text: string; hitCount: number; providers: string[] } };
    };
    expect(contract.sources.websource.query).toBe('知识库改名');
    expect(contract.sources.websource.providers).toEqual(['tavily']);
    expect(contract.sources.websource.hitCount).toBeGreaterThan(0);
    expect(contract.sources.websource.text).toContain('联网检索');
  });

  it('writes enrich_search.result', async () => {
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
      enrich_search: { result: { query: string; text: string } };
    };
    expect(contract.enrich_search.result.query).toBe('enrich-q');
    expect(contract.enrich_search.result.text).toContain('enrich-q');
  });
});
