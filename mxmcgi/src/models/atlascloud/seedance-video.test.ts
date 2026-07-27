import { describe, expect, it } from 'vitest';
import {
  buildSeedanceUpstreamModel,
  buildSeedanceVideoRequestBody,
  isSeedance20Upstream,
  normalizeSeedanceBaseUpstream,
  resolveSeedanceVideoMode,
} from './seedance-video';

describe('seedance-video', () => {
  it('detects seedance 2.0 upstream', () => {
    expect(isSeedance20Upstream('bytedance/seedance-2.0/text-to-video')).toBe(true);
    expect(isSeedance20Upstream('bytedance/seedance-2.0-mini/image-to-video')).toBe(true);
    expect(isSeedance20Upstream('bytedance/seedance-2.0-fast/reference-to-video')).toBe(true);
    expect(isSeedance20Upstream('other/model')).toBe(false);
  });

  it('builds seedance 2.0 mini upstream paths', () => {
    expect(normalizeSeedanceBaseUpstream('bytedance/seedance-2.0-mini/image-to-video')).toBe(
      'bytedance/seedance-2.0-mini',
    );
    expect(buildSeedanceUpstreamModel('bytedance/seedance-2.0-mini', 'reference-to-video')).toBe(
      'bytedance/seedance-2.0-mini/reference-to-video',
    );
  });

  it('normalizes base upstream and builds mode suffix', () => {
    expect(normalizeSeedanceBaseUpstream('bytedance/seedance-2.0/image-to-video')).toBe(
      'bytedance/seedance-2.0',
    );
    expect(buildSeedanceUpstreamModel('bytedance/seedance-2.0', 'reference-to-video')).toBe(
      'bytedance/seedance-2.0/reference-to-video',
    );
  });

  it('defaults to text-to-video without references', () => {
    expect(resolveSeedanceVideoMode({ prompt: 'ocean' })).toBe('text-to-video');
  });

  it('uses image-to-video when single reference image', () => {
    expect(
      resolveSeedanceVideoMode({
        prompt: 'move',
        input_reference: 'https://cdn.example.com/a.jpg',
      }),
    ).toBe('image-to-video');
  });

  it('uses reference-to-video for multiple images or subtype', () => {
    expect(
      resolveSeedanceVideoMode({
        reference_images: ['https://a.jpg', 'https://b.jpg'],
      }),
    ).toBe('reference-to-video');
    expect(resolveSeedanceVideoMode({ videoSubtype: 'shot-r2v' })).toBe('reference-to-video');
  });

  it('maps image-to-video body to image + optional last_frame', () => {
    const body = buildSeedanceVideoRequestBody(
      'bytedance/seedance-2.0/text-to-video',
      'image-to-video',
      {
        prompt: 'cinematic',
        duration: 5,
        reference_images: ['https://first.jpg', 'https://last.jpg'],
      },
    );
    expect(body.model).toBe('bytedance/seedance-2.0/image-to-video');
    expect(body.image).toBe('https://first.jpg');
    expect(body.last_frame).toBe('https://last.jpg');
    expect(body.reference_images).toBeUndefined();
  });

  it('maps reference-to-video body with optional last_frame', () => {
    const body = buildSeedanceVideoRequestBody(
      'bytedance/seedance-2.0',
      'reference-to-video',
      {
        prompt: 'storyboard',
        reference_images: ['https://c0.jpg', 'https://c1.jpg', 'https://c2.jpg'],
        input_reference: 'https://c1.jpg',
        last_frame: 'https://c2.jpg',
        last_frame_image: 'https://c2.jpg',
      },
    );
    expect(body.model).toBe('bytedance/seedance-2.0/reference-to-video');
    expect(body.reference_images).toEqual(['https://c0.jpg', 'https://c1.jpg', 'https://c2.jpg']);
    expect(body.input_reference).toBe('https://c1.jpg');
    expect(body.last_frame).toBe('https://c2.jpg');
  });

  it('strips image fields for text-to-video', () => {
    const body = buildSeedanceVideoRequestBody(
      'bytedance/seedance-2.0',
      'text-to-video',
      {
        prompt: 'sunset',
        reference_images: ['https://should-strip.jpg'],
      },
    );
    expect(body.model).toBe('bytedance/seedance-2.0/text-to-video');
    expect(body.reference_images).toBeUndefined();
    expect(body.image).toBeUndefined();
  });
});
