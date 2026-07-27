import { describe, it, expect } from 'vitest';
import type { JsonSchemaV2 } from '../tasks/types';
import { summarizeInputSchema } from './schema-summary';

describe('summarizeInputSchema reference images', () => {
  it('extracts referenceImageSlots with itemTypeDefault and paramsExample', () => {
    const schema = {
      type: 'object',
      required: ['garment_images'],
      properties: {
        model_images: {
          type: 'array',
          title: '模特参考',
          'x-ui-type': 'referenceImages',
          minItems: 0,
          maxItems: 4,
          items: {
            type: 'object',
            properties: {
              content: { type: 'string' },
              type: { type: 'string', default: 'main-subject' },
            },
          },
        },
        garment_images: {
          type: 'array',
          title: '服装 SKU 参考',
          'x-agent-hint': '服装平铺图，非模特',
          'x-ui-type': 'referenceImages',
          minItems: 1,
          items: {
            type: 'object',
            properties: {
              content: { type: 'string' },
              type: { type: 'string', default: 'outfits' },
            },
          },
        },
        prompt: { type: 'string', title: '补充说明' },
      },
    } as JsonSchemaV2;

    const summary = summarizeInputSchema(schema);

    expect(summary.fields.find((f) => f.name === 'model_images')).toMatchObject({
      uiType: 'referenceImages',
      itemTypeDefault: 'main-subject',
    });

    expect(summary.referenceImageSlots).toHaveLength(2);
    expect(summary.referenceImageSlots[0]).toMatchObject({
      field: 'model_images',
      itemTypeDefault: 'main-subject',
      required: false,
    });
    expect(summary.referenceImageSlots[1]).toMatchObject({
      field: 'garment_images',
      itemTypeDefault: 'outfits',
      required: true,
      agentHint: '服装平铺图，非模特',
    });

    const garment = summary.paramsExample.garment_images as Array<{ content: string; type: string }>;
    expect(Array.isArray(garment)).toBe(true);
    expect(garment[0]).toMatchObject({
      content: 'https://example.com/uploaded-image.jpg',
      type: 'outfits',
    });
    const model = summary.paramsExample.model_images as Array<{ type: string }>;
    expect(Array.isArray(model)).toBe(true);
    expect(model[0]?.type).toBe('main-subject');
  });
});
