import { describe, it, expect } from 'vitest';
import { normalizeEshopBatchInputData, buildPlanningImages } from './eshop-batch-input-normalize';

describe('normalizeEshopBatchInputData', () => {
  it('derives _planning_images and coerces parallel_count', () => {
    const out = normalizeEshopBatchInputData({
      model_images: [{ content: 'https://m.png', type: 'main-subject' }],
      garments: [{ label: 'A', images: [{ content: 'https://g.png', type: 'outfits' }] }],
      parallel_count: '2',
    });
    expect(out.parallel_count).toBe(2);
    expect(Array.isArray(out._planning_images)).toBe(true);
    expect((out._planning_images as unknown[]).length).toBe(2);
  });
});

describe('buildPlanningImages', () => {
  it('returns empty when no images', () => {
    expect(buildPlanningImages({ garments: [] })).toEqual([]);
  });
});
