/**
 * mxm-warp + webSearch 管线集成（mock 搜索，不打真实引擎）
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../core/search/search-config', () => ({
  listUsableSearchProviderNames: vi.fn().mockResolvedValue(['tavily']),
}));

vi.mock('../../core/search/search-service', () => ({
  SearchService: class {
    async deepSearch(req: { query: string }) {
      return {
        aggregated: [
          {
            title: `关于 ${req.query}`,
            url: 'https://example.com/a',
            snippet: 'mock snippet',
            domain: 'example.com',
          },
        ],
        dimensionResults: { general: { provider: 'tavily', items: [] } },
      };
    }
  },
}));

import { runMxmWarp } from './warp-runner';
import { registerWarpWebSearchStep } from './web-search-step';
import type { TaskContext, TaskTemplate } from '../types';

describe('mxm-warp + webSearch integration', () => {
  it('pre writes sources.websource; enrich writes enrich_search.result', async () => {
    registerWarpWebSearchStep();
    const template: TaskTemplate = {
      formSchema: { type: 'object', properties: {} },
      contractSchema: {
        type: 'object',
        properties: {
          topic: { type: 'string', 'x-zone': 'basic' },
        },
      },
      prompt: { unifiedTemplate: '根据合同写日报。' },
      pipeline: {
        pre: [
          {
            step: 'webSearch',
            params: {
              queryFrom: 'params.topic',
              target: 'sources.websource',
              depth: 'quick',
              maxResults: 3,
            },
          },
        ],
        enrich: [
          {
            step: 'webSearch',
            params: {
              queryFrom: 'contract.enrich_search.query',
              target: 'enrich_search.result',
              depth: 'standard',
            },
          },
        ],
        post: [],
      },
      extra: { executionMode: 'mxm-warp' },
    };

    const ctx: TaskContext = {
      scope: 'writing',
      taskKey: 'generator',
      subtype: 'warp-demo-daily',
      userId: 'u1',
      taskId: 't-int-1',
      params: { topic: 'mxm-warp 改版' },
      state: {},
    };

    const out = await runMxmWarp({
      ctx,
      template,
      inputLlm: async () =>
        JSON.stringify({
          basic: { topic: 'mxm-warp 改版' },
          enrich_search: { query: 'mxm-warp enrich deep' },
        }),
      outputLlm: async ({ user }) => {
        expect(user).toContain('sources');
        expect(user).toContain('websource');
        expect(user).toContain('enrich_search');
        expect(user).toContain('mxm-warp enrich deep');
        return '# 日报\n集成测试通过';
      },
    });

    const contract = out.state.contract as {
      sources: { websource: { query: string; digest?: string; evidenceKey?: string } };
      enrich_search: { query: string; result: { query: string; evidenceKey?: string } };
    };
    expect(contract.sources.websource.query).toBe('mxm-warp 改版');
    expect(contract.sources.websource.evidenceKey).toBe('websource');
    expect(contract.enrich_search.result.query).toBe('mxm-warp enrich deep');
    const ev = out.state.evidence as {
      websource: { digestText: string };
      enrich_result: { digestText: string };
    };
    expect(ev.websource.digestText).toContain('联网检索');
    expect(ev.enrich_result.digestText.length).toBeGreaterThan(0);
    expect((out.state.coreArtifact as { text: string }).text).toContain('集成测试通过');
  });
});
