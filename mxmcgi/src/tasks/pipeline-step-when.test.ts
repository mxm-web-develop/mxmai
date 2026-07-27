import { describe, expect, it } from 'vitest';
import type { TaskContext } from './types';
import { evaluatePipelineStepWhen, shouldRunPipelineStep } from './pipeline-step-when';

function ctx(params: Record<string, unknown>): TaskContext {
  return {
    scope: 'music',
    taskKey: 'compose',
    subtype: 'maxplan-test',
    taskId: 't1',
    params,
    state: {},
  };
}

describe('pipeline-step-when', () => {
  it('runs when no when config', () => {
    expect(shouldRunPipelineStep(ctx({}), { step: 'nestedText' })).toBe(true);
  });

  it('skips lyrics step when make_instrumental is true', () => {
    const when = {
      all: [
        { field: 'params.make_instrumental', op: 'falsy' as const },
        { field: 'params.lyrics', op: 'empty' as const },
      ],
    };
    expect(evaluatePipelineStepWhen(ctx({ make_instrumental: true }), when)).toBe(false);
    expect(evaluatePipelineStepWhen(ctx({ make_instrumental: false }), when)).toBe(true);
    expect(evaluatePipelineStepWhen(ctx({}), when)).toBe(true);
  });

  it('skips when user already provided lyrics', () => {
    const when = {
      all: [{ field: 'params.lyrics', op: 'empty' as const }],
    };
    expect(evaluatePipelineStepWhen(ctx({ lyrics: '已有歌词' }), when)).toBe(false);
    expect(evaluatePipelineStepWhen(ctx({ lyrics: '' }), when)).toBe(true);
  });

  it('supports eq and neq', () => {
    expect(
      evaluatePipelineStepWhen(ctx({ music_style: 'pop' }), {
        all: [{ field: 'params.music_style', op: 'eq', value: 'pop' }],
      })
    ).toBe(true);
    expect(
      evaluatePipelineStepWhen(ctx({ music_style: 'folk' }), {
        all: [{ field: 'params.music_style', op: 'neq', value: 'pop' }],
      })
    ).toBe(true);
  });
});
