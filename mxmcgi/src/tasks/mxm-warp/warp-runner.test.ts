import { describe, expect, it } from 'vitest';
import {
  assembleZonesFromParams,
  partitionContractSchemaFields,
  readXZone,
} from './contract-from-schema';
import { resolveWarpShape } from './unit-series';
import { runInputAssembleOnly, runInputStage } from './input-stage';
import { runMxmWarp } from './warp-runner';
import type { TaskContext, TaskTemplate } from '../types';

describe('mxm-warp unit-series', () => {
  it('maps canonical + legacy taskKeys to generator|group|series', () => {
    expect(resolveWarpShape('writing', 'generator')).toBe('generator');
    expect(resolveWarpShape('writing', 'group')).toBe('group');
    expect(resolveWarpShape('writing', 'series')).toBe('series');
    expect(resolveWarpShape('video', 'group')).toBe('group');
    // 历史别名
    expect(resolveWarpShape('writing', 'editorial')).toBe('generator');
    expect(resolveWarpShape('writing', 'proposal')).toBe('group');
    expect(resolveWarpShape('video', 'synthesis')).toBe('generator');
    expect(resolveWarpShape('video', 'autocut')).toBe('group');
    expect(resolveWarpShape('graph', 'gallery')).toBe('group');
    expect(resolveWarpShape('audio', 'voiceover')).toBe('generator');
  });
});

describe('mxm-warp contract-from-schema', () => {
  const schema = {
    type: 'object' as const,
    properties: {
      topic: { type: 'string', description: '话题', 'x-zone': 'basic' },
      audience: { type: 'string', 'x-zone': 'basic' },
      shot_list: { type: 'array', description: '分镜', 'x-zone': 'business' },
      untitled: { type: 'string' },
    },
  };

  it('defaults missing x-zone to business', () => {
    expect(readXZone({})).toBe('business');
    const { basicKeys, businessKeys } = partitionContractSchemaFields(schema);
    expect(basicKeys.sort()).toEqual(['audience', 'topic']);
    expect(businessKeys.sort()).toEqual(['shot_list', 'untitled']);
  });

  it('assembles zones from params', () => {
    const z = assembleZonesFromParams(schema, {
      topic: 'AI',
      shot_list: [1],
      ignore_me: true,
    });
    expect(z.basic).toEqual({ topic: 'AI' });
    expect(z.business).toEqual({ shot_list: [1] });
  });
});

describe('mxm-warp input/output runner', () => {
  const contractSchema = {
    type: 'object' as const,
    properties: {
      topic: { type: 'string', description: '主题', 'x-zone': 'basic' },
      body_spec: { type: 'string', 'x-zone': 'business' },
    },
  };

  const baseTpl: TaskTemplate = {
    formSchema: { type: 'object', properties: {} },
    contractSchema,
    prompt: { unifiedTemplate: '你是作者。根据合同写日报。' },
    pipeline: { pre: [], enrich: [], post: [] },
  };

  it('assembles contract without llm', () => {
    const ctx: TaskContext = {
      scope: 'writing',
      taskKey: 'editorial',
      subtype: 'work-daily',
      taskId: 't1',
      params: { topic: '知识库改名' },
      state: {},
    };
    const next = runInputAssembleOnly(ctx, contractSchema);
    const c = next.state.contract as { basic: { topic: string }; business: Record<string, unknown> };
    expect(c.basic.topic).toBe('知识库改名');
    expect(c.business).toEqual({});
  });

  it('runs full warp with mock llm', async () => {
    const ctx: TaskContext = {
      scope: 'writing',
      taskKey: 'editorial',
      subtype: 'work-daily',
      userId: 'u1',
      taskId: 't1',
      params: { topic: '改版' },
      state: {},
    };
    const out = await runMxmWarp({
      ctx,
      template: baseTpl,
      inputLlm: async () =>
        JSON.stringify({
          basic: { topic: '改版-回填' },
          enrich_search: { query: 'mxm-warp', mode: 'deep' },
        }),
      outputLlm: async ({ user }) => {
        expect(user).toContain('"topic": "改版-回填"');
        expect(user).toContain('enrich_search');
        return '# 日报\n完成改版对齐';
      },
    });
    const artifact = out.state.coreArtifact as { text: string };
    expect(artifact.text).toContain('完成改版对齐');
    const c = out.state.contract as { enrich_search: { query: string } };
    expect(c.enrich_search.query).toBe('mxm-warp');
  });

  it('input llm only fills basic keys', async () => {
    const ctx: TaskContext = {
      scope: 'writing',
      taskKey: 'editorial',
      taskId: 't1',
      params: {},
      state: {},
    };
    const next = await runInputStage({
      ctx,
      contractSchema,
      llm: async () =>
        JSON.stringify({
          basic: { topic: 'ok', body_spec: 'should-ignore' },
          body_spec: 'also-ignore',
        }),
    });
    const c = next.state.contract as { basic: Record<string, unknown>; business: Record<string, unknown> };
    expect(c.basic.topic).toBe('ok');
    expect(c.basic.body_spec).toBeUndefined();
    expect(c.business.body_spec).toBeUndefined();
  });

  it('requires enrich_search.query and synthesizes when LLM omits it', async () => {
    const ctx: TaskContext = {
      scope: 'writing',
      taskKey: 'editorial',
      subtype: 'industry-daily',
      taskId: 't1',
      params: {
        industry: '科技',
        core_topic: '美国禁售含中国高风险企业关键硬件设备',
        sources: {
          websource: {
            query: '科技行业 2026年7月22日 要闻 头条 新闻',
            hitCount: 6,
            items: [{ title: 'a' }],
          },
        },
      },
      state: {},
    };
    const next = await runInputStage({
      ctx,
      contractSchema: {
        type: 'object',
        properties: {
          industry: { type: 'string', 'x-zone': 'basic' },
          core_topic: { type: 'string', 'x-zone': 'basic' },
        },
      },
      requireEnrichSearchPlan: true,
      llm: async () => JSON.stringify({ basic: { industry: '科技' } }),
    });
    const c = next.state.contract as { enrich_search: { query: string }; basic: { core_topic?: string } };
    expect(c.enrich_search.query).toBeTruthy();
    expect(c.enrich_search.query).toContain('美国禁售');
    expect(c.enrich_search.query).toContain('科技');
  });

  it('keeps LLM enrich_search.query when provided', async () => {
    const ctx: TaskContext = {
      scope: 'writing',
      taskKey: 'editorial',
      taskId: 't1',
      params: { industry: '科技', core_topic: '芯片' },
      state: {},
    };
    const next = await runInputStage({
      ctx,
      contractSchema: {
        type: 'object',
        properties: {
          industry: { type: 'string', 'x-zone': 'basic' },
          core_topic: { type: 'string', 'x-zone': 'basic' },
        },
      },
      requireEnrichSearchPlan: true,
      llm: async () =>
        JSON.stringify({
          enrich_search: { query: '美国对华硬件禁令 供应链影响', mode: 'deep' },
        }),
    });
    const c = next.state.contract as { enrich_search: { query: string; mode: string } };
    expect(c.enrich_search.query).toBe('美国对华硬件禁令 供应链影响');
    expect(c.enrich_search.mode).toBe('deep');
  });
});

describe('enrichPipelineNeedsSearchPlan', () => {
  it('detects enrich webSearch targeting enrich_search', async () => {
    const { enrichPipelineNeedsSearchPlan } = await import('./input-stage');
    expect(
      enrichPipelineNeedsSearchPlan([
        {
          step: 'webSearch',
          params: { queryFrom: 'contract.enrich_search.query', target: 'enrich_search.result' },
        },
      ])
    ).toBe(true);
    expect(enrichPipelineNeedsSearchPlan([{ step: 'nestedText' }])).toBe(false);
    expect(
      enrichPipelineNeedsSearchPlan([
        { step: 'webSearch', params: { queryBuilder: 'industryTrend', target: 'sources.websource' } },
      ])
    ).toBe(false);
  });
});
