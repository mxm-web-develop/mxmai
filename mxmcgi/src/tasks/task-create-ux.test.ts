import { describe, expect, it } from 'vitest';
import { pipelineHasInteractiveGates, resolveTaskCreateUx } from './task-create-ux';

describe('task-create-ux', () => {
  it('detects interactiveCard in pre', () => {
    const pipe = {
      pre: [{ step: 'interactiveCard', params: { kind: 'interactive-card' } }],
    };
    expect(pipelineHasInteractiveGates(pipe)).toBe(true);
    expect(resolveTaskCreateUx(pipe)).toBe('warp-gates');
  });

  it('detects basic-form manualReview', () => {
    const pipe = {
      enrich: [{ step: 'manualReview', params: { kind: 'basic-form' } }],
    };
    expect(resolveTaskCreateUx(pipe)).toBe('warp-gates');
  });

  it('defaults to schema-form', () => {
    expect(resolveTaskCreateUx({ pre: [{ step: 'webSearch' }] })).toBe('schema-form');
    expect(resolveTaskCreateUx(null)).toBe('schema-form');
  });

  it('detects industry-daily schema signature', () => {
    expect(
      resolveTaskCreateUx(null, {
        type: 'object',
        properties: {
          industry: { type: 'string' },
          date_mode: { type: 'string' },
          core_topic: { type: 'string' },
        },
      })
    ).toBe('warp-gates');
  });
});
