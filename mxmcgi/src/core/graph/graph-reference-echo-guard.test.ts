import { describe, it, expect } from 'vitest';
import {
  assertGraphOutputNotReferenceEcho,
  collectGraphReferenceHttpUrls,
  filterReferenceEchoUrls,
  normalizeHttpUrlForCompare,
} from './graph-reference-echo-guard';

describe('graph-reference-echo-guard', () => {
  it('normalizes URL for compare', () => {
    expect(normalizeHttpUrlForCompare('HTTPS://CDN.example.com/a.png?x=1')).toBe(
      'https://cdn.example.com/a.png'
    );
  });

  it('collects reference slot URLs', () => {
    const refs = collectGraphReferenceHttpUrls({
      garment_images: [{ content: 'https://cdn.example.com/sku.png', type: 'outfits' }],
      model_images: [],
    });
    expect(refs.has('https://cdn.example.com/sku.png')).toBe(true);
  });

  it('filters echo URLs', () => {
    const refs = new Set(['https://cdn.example.com/sku.png']);
    const out = filterReferenceEchoUrls(
      ['https://cdn.example.com/sku.png?v=2', 'https://cdn.example.com/new.png'],
      refs
    );
    expect(out).toEqual(['https://cdn.example.com/new.png']);
  });

  it('throws when all outputs echo references', () => {
    const refs = collectGraphReferenceHttpUrls({
      garment_images: [{ content: 'https://r2.dev/in.png', type: 'outfits' }],
    });
    expect(() =>
      assertGraphOutputNotReferenceEcho(['https://r2.dev/in.png'], refs, 'taskId=t1')
    ).toThrow(/未返回新图/);
  });
});
