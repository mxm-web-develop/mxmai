import { describe, it, expect } from 'vitest';
import { startInputToJsonSchema, startInputTypeToSchemaProperty } from './schema-builder';

describe('startInputTypeToSchemaProperty', () => {
  it('maps business ui types', () => {
    expect(startInputTypeToSchemaProperty('referenceImages')['x-ui-type']).toBe('referenceImages');
    expect(startInputTypeToSchemaProperty('eshopGarmentBatch')['x-ui-type']).toBe('eshopGarmentBatch');
    expect(startInputTypeToSchemaProperty('number').type).toBe('number');
    expect(startInputTypeToSchemaProperty('parallel_count')).toEqual({ type: 'string', 'x-ui-type': 'string' });
  });
});

describe('startInputToJsonSchema', () => {
  it('builds schema with integer default for number type', () => {
    const { schema } = startInputToJsonSchema([
      { name: 'parallel_count', type: 'number', content: 3 },
      { name: 'garments', type: 'eshopGarmentBatch', content: [] },
    ]);
    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.parallel_count.type).toBe('number');
    expect(props.parallel_count.default).toBe(3);
    expect(props.garments['x-ui-type']).toBe('eshopGarmentBatch');
  });
});
