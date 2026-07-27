import { describe, expect, it } from 'vitest';
import {
  assertNestedTextInputMappingKeys,
  assertTextV2TaskKey,
  buildExpertFieldSpecs,
  getTextV2FixedFormSchema,
  parseValidationResult,
  pickTextV2ParamsForSchemaValidate,
  TEXT_V2_INPUT_KEYS,
} from './text-v2';
import { validateWithJsonSchema } from './schema-validator';

describe('text-v2', () => {
  it('rejects legacy taskKeys', () => {
    expect(() => assertTextV2TaskKey('format')).toThrow(/废止/);
    expect(assertTextV2TaskKey('transform')).toBe('transform');
  });

  it('pins input keys per type', () => {
    expect([...TEXT_V2_INPUT_KEYS.expert]).toEqual(['contract', 'field_specs']);
    expect(Object.keys(getTextV2FixedFormSchema('plan').properties ?? {}).sort()).toEqual([
      'contract',
      'goal',
    ]);
  });

  it('picks only pinned keys for schema validate (ignores platform extras)', () => {
    const picked = pickTextV2ParamsForSchemaValidate('expert', {
      contract: { basic: { topic: 'x' } },
      field_specs: [{ name: 'title' }],
      _pipelineDepth: 1,
      metadata: { parentPipelineTaskId: 'p1' },
      logicalModel: 'MiniMax-M3',
    });
    expect(picked).toEqual({
      contract: { basic: { topic: 'x' } },
      field_specs: [{ name: 'title' }],
    });
    expect(() =>
      validateWithJsonSchema(getTextV2FixedFormSchema('expert'), picked)
    ).not.toThrow();
    expect(() =>
      validateWithJsonSchema(getTextV2FixedFormSchema('expert'), {
        ...picked,
        _pipelineDepth: 1,
        metadata: {},
      })
    ).toThrow(/additional properties/);
  });

  it('validates nestedText mapping keys', () => {
    expect(() =>
      assertNestedTextInputMappingKeys('text/transform/demo', { prompt: '${x}' })
    ).toThrow(/非法键/);
    expect(() =>
      assertNestedTextInputMappingKeys('text/transform/demo', {
        input: '${state.x}',
        instruction: 'compress',
      })
    ).not.toThrow();
  });

  it('builds field_specs for empty business fields', () => {
    const specs = buildExpertFieldSpecs({
      contract: { business: { title: '已有', body: '' } },
      contractSchema: {
        type: 'object',
        properties: {
          topic: { type: 'string', 'x-zone': 'basic' },
          title: { type: 'string', 'x-zone': 'business', description: '标题' },
          body: { type: 'string', description: '正文' },
        },
      },
    });
    expect(specs.map((s) => s.name)).toEqual(['body']);
  });

  it('parses validation result', () => {
    expect(parseValidationResult('{"ok":false,"errors":["缺 title"]}')).toEqual({
      ok: false,
      errors: ['缺 title'],
    });
  });
});
