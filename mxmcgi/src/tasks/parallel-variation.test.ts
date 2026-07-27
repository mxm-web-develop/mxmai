import { describe, it, expect } from 'vitest';
import {
  allocateVariationParams,
  buildParallelVariationSuffix,
  parallelContextVars,
} from './parallel-variation';
import { stripPlatformFields, PARALLEL_COUNT_KEY } from './platform-fields';
import type { JsonSchemaV2 } from './types';

describe('parallel-variation', () => {
  const schema: JsonSchemaV2 = {
    type: 'object',
    properties: {
      scenes: { type: 'string', enum: ['a', 'b', 'c'] },
      output_grid: { type: 'string', enum: ['1x1', '2x2', '3x3'] },
      aspect_ratio: { type: 'string', enum: ['3:4', '9:16'] },
      prompt: { type: 'string' },
      parallel_count: { type: 'integer', minimum: 1, maximum: 99 },
    },
  };

  it('stripPlatformFields removes parallel_count', () => {
    const out = stripPlatformFields({ foo: 1, [PARALLEL_COUNT_KEY]: 5 });
    expect(out).toEqual({ foo: 1 });
    expect((out as Record<string, unknown>)[PARALLEL_COUNT_KEY]).toBeUndefined();
  });

  it('keeps production params identical across parallel copies', () => {
    const base = {
      scenes: 'b',
      output_grid: '2x2',
      aspect_ratio: '9:16',
      prompt: 'hello',
      parallel_count: 3,
    };
    const p0 = allocateVariationParams({ formSchema: schema, baseParams: base, parallelIndex: 0, parallelTotal: 3 });
    const p1 = allocateVariationParams({ formSchema: schema, baseParams: base, parallelIndex: 1, parallelTotal: 3 });
    const p2 = allocateVariationParams({ formSchema: schema, baseParams: base, parallelIndex: 2, parallelTotal: 3 });
    for (const p of [p0, p1, p2]) {
      expect(p.scenes).toBe('b');
      expect(p.output_grid).toBe('2x2');
      expect(p.aspect_ratio).toBe('9:16');
      expect(p.parallel_count).toBeUndefined();
    }
    expect(String(p0.prompt)).toContain('Generation set 1/3');
    expect(String(p1.prompt)).toContain('Generation set 2/3');
    expect(String(p2.prompt)).toContain('Generation set 3/3');
  });

  it('parallelContextVars uses 1-based index', () => {
    expect(
      parallelContextVars({ parentTaskId: 'p1', parallelIndex: 0, parallelTotal: 5 })
    ).toEqual({ parallel_index: 1, parallel_total: 5, parent_task_id: 'p1' });
  });

  it('buildParallelVariationSuffix includes set index', () => {
    expect(buildParallelVariationSuffix(2, 10)).toContain('3/10');
  });
});
