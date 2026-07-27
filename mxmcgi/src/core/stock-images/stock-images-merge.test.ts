import { describe, expect, it } from 'vitest';
import {
  interleaveStockImageItems,
  mergeStockImageSearchResults,
  normalizeStockImageUrl,
} from './stock-images-merge';
import type { StockImageItem } from './stock-image-types';

function item(id: string, url: string, provider?: StockImageItem['provider']): StockImageItem {
  return {
    id,
    title: id,
    thumbnailUrl: url,
    imageUrl: url,
    sourcePageUrl: url,
    creator: null,
    license: 'test',
    width: null,
    height: null,
    provider,
  };
}

describe('stock-images-merge', () => {
  it('normalizeStockImageUrl strips query', () => {
    expect(normalizeStockImageUrl('https://cdn.example.com/a.jpg?x=1')).toBe('cdn.example.com/a.jpg');
  });

  it('interleaveStockImageItems round-robins and dedupes', () => {
    const merged = interleaveStockImageItems([
      { source: 'pexels', items: [item('p1', 'https://a.com/1.jpg'), item('p2', 'https://a.com/2.jpg')] },
      { source: 'unsplash', items: [item('u1', 'https://b.com/1.jpg'), item('u2', 'https://a.com/1.jpg')] },
    ]);
    expect(merged.map((row) => row.id)).toEqual(['p1', 'u1', 'p2']);
    expect(merged[0]?.provider).toBe('pexels');
    expect(merged[1]?.provider).toBe('unsplash');
  });

  it('mergeStockImageSearchResults caps page size', () => {
    const data = mergeStockImageSearchResults(
      [
        {
          source: 'pexels',
          data: {
            items: [item('p1', 'https://a.com/1.jpg'), item('p2', 'https://a.com/2.jpg')],
            total: 100,
            page: 1,
            pageSize: 2,
            pageCount: 50,
          },
        },
        {
          source: 'unsplash',
          data: {
            items: [item('u1', 'https://b.com/1.jpg')],
            total: 80,
            page: 1,
            pageSize: 1,
            pageCount: 80,
          },
        },
      ],
      1,
      2
    );
    expect(data.items).toHaveLength(2);
    expect(data.total).toBe(180);
  });
});
