import { describe, expect, it } from 'vitest';
import {
  buildStepInputSnapshot,
  buildStepOutputSnapshot,
  resolveDeclaredInputs,
  summarizeTraceValue,
} from './pipeline-trace';
import type { PipelineStep, TaskContext } from './types';

function makeCtx(overrides?: Partial<TaskContext>): TaskContext {
  return {
    scope: 'writing',
    taskKey: 'generator',
    taskId: 't1',
    params: {
      topic: 'AI chips',
      article_length: 'standard',
      __adminPipelineDebug: true,
    },
    state: {
      contract: {
        version: 1,
        meta: {},
        basic: { topic: 'AI chips', article_length: 'standard' },
        business: { sections: [{ id: 'keep-me-out-of-unrelated' }] },
        sources: {
          websource: {
            hitCount: 2,
            items: [{ title: 'A' }, { title: 'B' }],
          },
        },
        assets: {},
        enrich_search: {},
      },
      evidence: {
        websource: {
          key: 'websource',
          kind: 'webSearch',
          digestText: 'd',
          hitCount: 2,
          updatedAt: new Date().toISOString(),
          charCount: 10,
          payload: {
            hitCount: 2,
            items: [{ title: 'A' }, { title: 'B' }],
          },
        },
      },
    },
    ...overrides,
  } as unknown as TaskContext;
}

describe('pipeline-trace generic config+resolved', () => {
  it('webSearch resolves queryFrom/scaleFrom/target from node config only', () => {
    const step: PipelineStep = {
      step: 'webSearch',
      params: {
        queryFrom: 'params.topic',
        scaleFrom: 'article_length',
        target: 'sources.websource',
        maxResults: 16,
      },
    };
    const snap = buildStepInputSnapshot(makeCtx(), step) as {
      config: { params: Record<string, unknown> };
      resolved: Record<string, { path?: string; value?: unknown }>;
    };
    expect(snap.config.params.queryFrom).toBe('params.topic');
    expect(snap.resolved['params.queryFrom']?.value).toBe('AI chips');
    expect(snap.resolved['params.scaleFrom']?.value).toBe('standard');
    expect(JSON.stringify(snap)).not.toContain('keep-me-out-of-unrelated');
  });

  it('queryTemplate placeholders resolve without hardcoding field names in tracer', () => {
    const step: PipelineStep = {
      step: 'webSearch',
      params: {
        queryTemplate: '${contract.basic.topic} latest',
        target: 'enrich_search.result',
      },
    };
    const resolved = resolveDeclaredInputs(makeCtx(), step);
    expect(resolved['params.queryTemplate:contract.basic.topic']).toBeTruthy();
    expect(
      (resolved['params.queryTemplate:contract.basic.topic'] as { value: unknown }).value
    ).toBe('AI chips');
  });

  it('nestedText follows inputMapping declaration', () => {
    const step: PipelineStep = {
      step: 'nestedText',
      nestedTextTaskKey: 'text/format/demo',
      inputMapping: { prompt: '${params.topic}' },
      params: { claimPaths: ['basic.topic'] },
    };
    const snap = buildStepInputSnapshot(makeCtx(), step) as {
      resolved: Record<string, unknown>;
    };
    expect(snap.resolved['inputMapping.prompt']).toBeTruthy();
    expect(JSON.stringify(snap.resolved)).not.toContain('keep-me-out-of-unrelated');
  });

  it('output produced tracks params.target writes', () => {
    const step: PipelineStep = {
      step: 'webSearch',
      params: { target: 'sources.websource' },
    };
    const before = makeCtx();
    const after = makeCtx({
      state: {
        ...before.state,
        contract: {
          ...(before.state.contract as object),
          sources: {
            websource: {
              hitCount: 9,
              items: [{ title: 'Z' }],
            },
          },
        },
      },
    } as Partial<TaskContext>);
    const out = buildStepOutputSnapshot(before, after, step) as {
      produced: Record<string, { changed?: boolean }>;
    };
    expect(out.produced['write:contract.sources.websource']?.changed).toBe(true);
  });

  it('summarizeTraceValue collapses large item lists', () => {
    const s = summarizeTraceValue({
      hitCount: 40,
      items: Array.from({ length: 40 }, (_, i) => ({ title: `t${i}` })),
    }) as { itemCount: number; sampleTitles: string[] };
    expect(s.itemCount).toBe(40);
    expect(s.sampleTitles.length).toBe(8);
  });
});
