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
  it('maps proposal/autocut to series', () => {
    expect(resolveWarpShape('writing', 'proposal')).toBe('series');
    expect(resolveWarpShape('video', 'autocut')).toBe('series');
    expect(resolveWarpShape('writing', 'editorial')).toBe('unit');
    expect(resolveWarpShape('video', 'synthesis')).toBe('unit');
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
});
