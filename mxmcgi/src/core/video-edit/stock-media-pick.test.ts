import { describe, expect, it } from 'vitest';
import { markStockUrlUsed, pickBestStockHit } from './stock-media-pick';

type Hit = { imageUrl?: string; title?: string; sourcePageUrl?: string };

describe('pickBestStockHit', () => {
  const items: Hit[] = [
    { imageUrl: 'https://cdn/1.jpg', title: 'commercial airplane flight sky', sourcePageUrl: 'https://x/airplane' },
    { imageUrl: 'https://cdn/2.jpg', title: 'humanoid robot in modern factory', sourcePageUrl: 'https://x/humanoid-robot' },
    { imageUrl: 'https://cdn/3.jpg', title: 'city street traffic', sourcePageUrl: 'https://x/city' },
  ];

  it('picks the item most relevant to the query, not the first', () => {
    const res = pickBestStockHit(items, undefined, 'imageUrl', ['humanoid', 'robot', 'factory']);
    expect(res?.scored).toBe(true);
    expect(res?.hit.imageUrl).toBe('https://cdn/2.jpg');
  });

  it('falls back to first unused when nothing scores', () => {
    const res = pickBestStockHit(items, undefined, 'imageUrl', ['spaceship', 'galaxy']);
    expect(res?.scored).toBe(false);
    expect(res?.hit.imageUrl).toBe('https://cdn/1.jpg');
  });

  it('skips already-used urls', () => {
    const usedUrls = new Set<string>();
    const first = pickBestStockHit(items, { usedUrls }, 'imageUrl', ['humanoid', 'robot']);
    // 标记已用后，重排应跳过它
    markStockUrlUsed({ usedUrls }, first!.hit.imageUrl!);
    const second = pickBestStockHit(items, { usedUrls }, 'imageUrl', ['humanoid', 'robot']);
    expect(second?.hit.imageUrl).not.toBe(first?.hit.imageUrl);
  });
});
