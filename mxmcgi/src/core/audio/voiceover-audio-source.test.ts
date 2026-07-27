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

  it('parses private IP MinIO :9000 URL', () => {
    expect(
      parseMinioDirectObjectUrl('http://10.0.0.8:9000/generated/user-1/clip.mp4')
    ).toEqual({
      bucket: 'generated',
      key: 'user-1/clip.mp4',
    });
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
});
