import { describe, expect, it } from 'vitest';
import {
  coerceOtherEnumCustomParams,
  coerceSchemaTypedParams,
  normalizeParamsBeforeSchemaValidate,
  sanitizeNumericEnumsInJsonSchema,
} from './form-param-normalize';

describe('coerceSchemaTypedParams', () => {
  it('coerces string numbers from pipeline templates', () => {
    const schema = {
      type: 'object',
      properties: {
        audio_duration_seconds: { type: 'number' },
        parallel_count: { type: 'integer' },
      },
    };
    const out = coerceSchemaTypedParams(schema, {
      audio_duration_seconds: '12.5',
      parallel_count: '2',
      topic: 'x',
    });
    expect(out.audio_duration_seconds).toBe(12.5);
    expect(out.parallel_count).toBe(2);
  });
});

describe('coerceOtherEnumCustomParams', () => {
  const schema = {
    type: 'object',
    properties: {
      industry: { type: 'string', enum: ['金融', '科技', '其他'] },
      industry_custom: { type: 'string' },
      style: { type: 'string', enum: ['客观中性', '其他'] },
      style_custom: { type: 'string' },
    },
  };

  it('maps free-text industry into 其他 + industry_custom', () => {
    const out = coerceOtherEnumCustomParams(schema, { industry: '储能' });
    expect(out.industry).toBe('其他');
    expect(out.industry_custom).toBe('储能');
  });

  it('keeps existing industry_custom when remapping', () => {
    const out = coerceOtherEnumCustomParams(schema, {
      industry: '储能',
      industry_custom: '新能源',
    });
    expect(out.industry).toBe('其他');
    expect(out.industry_custom).toBe('新能源');
  });

  it('leaves allowed enum values unchanged', () => {
    const out = coerceOtherEnumCustomParams(schema, { industry: '金融' });
    expect(out.industry).toBe('金融');
  });

  it('runs inside normalizeParamsBeforeSchemaValidate', () => {
    const out = normalizeParamsBeforeSchemaValidate(schema, {
      industry: '短剧',
      style: '偏口语短句',
    });
    expect(out.industry).toBe('其他');
    expect(out.industry_custom).toBe('短剧');
    expect(out.style).toBe('其他');
    expect(out.style_custom).toBe('偏口语短句');
  });
});

describe('sanitizeNumericEnumsInJsonSchema', () => {
  it('coerces string integer enums back to numbers', () => {
    const schema = {
      type: 'object',
      properties: {
        topic_count: {
          type: 'integer',
          enum: ['5', '8', '10'],
          default: '8',
        },
      },
    };
    sanitizeNumericEnumsInJsonSchema(schema);
    expect(schema.properties.topic_count.enum).toEqual([5, 8, 10]);
    expect(schema.properties.topic_count.default).toBe(8);
  });
});
