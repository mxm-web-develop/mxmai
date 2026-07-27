import { describe, it, expect } from 'vitest';
import {
  prepareGraphTaskParams,
  repairSanitizedReferenceSlots,
  mergeGraphReferenceImageFromFormSlots,
  cloneFormSchemaWithReferenceImageEnrichment,
} from './graph-reference-slots';
import { validateWithJsonSchema } from './schema-validator';

const formSchema = {
  properties: {
    model_images: { 'x-ui-type': 'referenceImages', title: '模特' },
    clothing_images: { 'x-ui-type': 'referenceImages', title: '服饰' },
  },
};

describe('repairSanitizedReferenceSlots', () => {
  it('restores clothing from referenceImage when slot has sanitize placeholder', () => {
    const params: Record<string, unknown> = {
      clothing_images: [
        {
          type: 'outfits',
          content: '[Base64数据已过滤，大小: 100.00 KB]',
          groupKey: 'clothing_images',
        },
      ],
      referenceImage: [
        {
          type: 'outfits',
          content: 'https://cdn.example.com/dress.jpg',
          groupKey: 'clothing_images',
        },
        {
          type: 'main-subject',
          content: 'https://cdn.example.com/model.jpg',
          groupKey: 'model_images',
        },
      ],
    };
    repairSanitizedReferenceSlots(params as Record<string, any>, formSchema);
    mergeGraphReferenceImageFromFormSlots(params as Record<string, any>, formSchema);
    const clothing = (params.clothing_images as any[])[0];
    expect(clothing.content).toContain('https://');
    const merged = params.referenceImage as any[];
    expect(merged.some((r) => r.groupKey === 'clothing_images' && String(r.content).includes('dress'))).toBe(
      true
    );
  });
});

describe('prepareGraphTaskParams garment_images alias', () => {
  const eshopSchema = {
    properties: {
      garment_images: {
        'x-ui-type': 'referenceImages',
        title: '服装',
        items: { properties: { type: { default: 'outfits' } } },
      },
    },
    required: ['garment_images'],
  };

  it('maps clothing_images to garment_images before validation path', () => {
    const out = prepareGraphTaskParams(
      {
        clothing_images: [{ content: 'https://cdn.example.com/sku.png', type: 'outfits' }],
        shoot_preset: 'studio_soft_gray',
      },
      eshopSchema,
      { taskKey: 'eshop', subtype: 'clothes' }
    );
    expect(Array.isArray(out.garment_images)).toBe(true);
    expect((out.garment_images as any[]).length).toBe(1);
  });

  it('rewrites referenceImage groupKey clothing_images → garment_images', () => {
    const out = prepareGraphTaskParams(
      {
        referenceImage: [
          { content: 'https://cdn.example.com/sku.png', type: 'outfits', groupKey: 'clothing_images' },
        ],
        shoot_preset: 'studio_soft_gray',
      },
      eshopSchema,
      { taskKey: 'eshop', subtype: 'clothes' }
    );
    expect((out.garment_images as any[])?.[0]?.content).toContain('sku.png');
  });

  it('merges garment_images with relative storage object proxy path', () => {
    const out = prepareGraphTaskParams(
      {
        garment_images: [
          {
            type: 'outfits',
            content: '/api/v1/media/object/3d18e7b7-e5cf-4fdc-a97e-bd1582ff3597',
          },
        ],
        output_grid: '2x2',
        shoot_preset: 'studio_white_seamless',
        shoot_focus: 'structure_tailoring',
      },
      eshopSchema,
      { taskKey: 'eshop', subtype: 'clothes-men' }
    );
    const merged = out.referenceImage as any[];
    expect(Array.isArray(merged)).toBe(true);
    expect(merged.length).toBe(1);
    expect(merged[0].content).toContain('/api/v1/media/object/');
    expect(merged[0].groupKey).toBe('garment_images');
    expect(out.output_grid).toBe('2x2');
  });
});

describe('tools-hd referenceImages schema enrichment', () => {
  const toolsHdSchema = {
    type: 'object',
    properties: {
      source_images: {
        'x-ui-type': 'referenceImages',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['content', 'type'],
          properties: {
            content: { type: 'string' },
            type: { type: 'string' },
            purpose: { type: 'string' },
          },
        },
      },
      is_grid: { type: 'boolean', default: false },
    },
  };

  it('accepts groupKey metadata after enrichReferenceImagesFormSchema', () => {
    const enriched = cloneFormSchemaWithReferenceImageEnrichment(toolsHdSchema as any)!;
    const normalized = prepareGraphTaskParams(
      {
        source_images: [{ content: 'https://cdn.example.com/sheet.jpg', type: 'main-subject' }],
        is_grid: false,
      },
      enriched,
      { taskKey: 'tools', subtype: 'hd' }
    );
    expect(() => validateWithJsonSchema(enriched as any, normalized)).not.toThrow();
    expect((normalized.source_images as any[])[0].groupKey).toBe('source_images');
  });
});
