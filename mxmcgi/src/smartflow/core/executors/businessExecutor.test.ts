import { describe, it, expect } from 'vitest';
import { resolveSmartflowParams } from './resolve-smartflow-params';
import type { ExecutionContext } from '../models/types';

function ctx(vars: Record<string, unknown>): ExecutionContext {
  return {
    execution: { user_id: 'u1', input_data: {}, smartflow_id: 'sf1' } as ExecutionContext['execution'],
    variables: vars,
    nodeOutputs: {},
    smartflow: { schema: { version: '1', nodes: [], edges: [] } } as ExecutionContext['smartflow'],
  };
}

describe('resolveSmartflowParams', () => {
  it('parses JSON array after variable resolve', () => {
    const garment = [{ content: 'https://cdn/sku.png', type: 'outfits' }];
    const result = resolveSmartflowParams(
      { garment_images: '{{variables.task.garment_images}}' },
      ctx({
        input: {},
        task: { garment_images: garment },
      })
    ) as Record<string, unknown>;
    expect(Array.isArray(result.garment_images)).toBe(true);
    expect((result.garment_images as any[])[0].content).toContain('sku.png');
  });

  it('resolves nested object strings', () => {
    const result = resolveSmartflowParams(
      {
        nested: {
          prompt: '{{input.prompt}}',
        },
      },
      ctx({ input: { prompt: 'hello' } })
    ) as Record<string, unknown>;
    expect((result.nested as any).prompt).toBe('hello');
  });

  it('leaves plain strings unchanged', () => {
    const result = resolveSmartflowParams(
      { shoot_preset: 'studio_soft_gray' },
      ctx({ input: {} })
    ) as Record<string, unknown>;
    expect(result.shoot_preset).toBe('studio_soft_gray');
  });

  it('preserves number type for single-variable ref (parallel_count)', () => {
    const result = resolveSmartflowParams(
      { parallel_count: '{{variables.task.parallel_count}}' },
      ctx({ input: {}, task: { parallel_count: 3 } })
    ) as Record<string, unknown>;
    expect(result.parallel_count).toBe(3);
    expect(typeof result.parallel_count).toBe('number');
  });
});
