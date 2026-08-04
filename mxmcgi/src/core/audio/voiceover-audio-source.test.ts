import { describe, expect, it } from 'vitest';
import {
  normalizeClientAccessibleMediaUrl,
  parseMinioDirectObjectUrl,
} from './voiceover-audio-source';

describe('parseMinioDirectObjectUrl', () => {
  it('parses internal MinIO URL', () => {
    expect(
      parseMinioDirectObjectUrl(
        'http://127.0.0.1:9000/aigc/user-1/audio/sample.mp3'
      )
    ).toEqual({
      bucket: 'aigc',
      key: 'user-1/audio/sample.mp3',
    });
  });

  it('returns null for public CDN', () => {
    expect(parseMinioDirectObjectUrl('https://cdn.example.com/a.mp3')).toBeNull();
  });

  it('returns null for gateway media URLs on localhost', () => {
    expect(
      parseMinioDirectObjectUrl(
        'http://localhost:3000/api/v1/media/asset?bucket=aigc&key=u1%2Fa.mp3'
      )
    ).toBeNull();
  });
});

describe('normalizeClientAccessibleMediaUrl', () => {
  it('rewrites internal MinIO URL to gateway asset path', () => {
    const raw =
      'http://127.0.0.1:9000/aigc/8ee5db88-b157-4ce5-ab98-fcf7f2880f3b/audio/1783330664325-8rseed.mp3';
    const out = normalizeClientAccessibleMediaUrl(raw);
    expect(out).toContain('/api/v1/media/asset?');
    expect(out).toContain('bucket=aigc');
    expect(out).toContain(
      'key=8ee5db88-b157-4ce5-ab98-fcf7f2880f3b%2Faudio%2F1783330664325-8rseed.mp3'
    );
  });

  it('does not corrupt absolute gateway asset URLs', () => {
    const raw =
      'http://localhost:3000/api/v1/media/asset?bucket=aigc&key=user%2Faudio%2Fx.mp3';
    const out = normalizeClientAccessibleMediaUrl(raw);
    expect(out).toBe('/api/v1/media/asset?bucket=aigc&key=user%2Faudio%2Fx.mp3');
  });
});
