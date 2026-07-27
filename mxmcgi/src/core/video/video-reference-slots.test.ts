import { describe, expect, it } from 'vitest';
import {
  flattenVideoReferenceUrlsForProvider,
  prepareVideoTaskParams,
  validateVideoHeroOrStoryboard,
} from './video-reference-slots';

describe('video-reference-slots', () => {
  it('prefers hero still as first frame', () => {
    const p: Record<string, unknown> = {
      hero_still_images: [{ content: 'https://cdn.example.com/hero.jpg', type: 'main-subject' }],
      garment_images: [{ content: 'https://cdn.example.com/sku.jpg', type: 'main-subject' }],
    };
    flattenVideoReferenceUrlsForProvider(p);
    expect(p.input_reference).toBe('https://cdn.example.com/hero.jpg');
    expect(p.reference_images).toEqual([
      'https://cdn.example.com/hero.jpg',
      'https://cdn.example.com/sku.jpg',
    ]);
  });

  it('flattens referenceImages slot objects on reference_images', () => {
    const p: Record<string, unknown> = {
      reference_images: [{ content: 'https://cdn.example.com/logo.png', type: 'logo' }],
    };
    flattenVideoReferenceUrlsForProvider(p);
    expect(p.input_reference).toBe('https://cdn.example.com/logo.png');
    expect(p.reference_images).toEqual(['https://cdn.example.com/logo.png']);
  });

  it('falls back to garment when no hero', () => {
    const p: Record<string, unknown> = {
      garment_images: [{ content: 'https://cdn.example.com/sku.jpg', type: 'main-subject' }],
    };
    flattenVideoReferenceUrlsForProvider(p);
    expect(p.input_reference).toBe('https://cdn.example.com/sku.jpg');
  });

  it('works with hero still only (typical graph → video flow)', () => {
    const p: Record<string, unknown> = {
      hero_still_images: [{ content: 'https://cdn.example.com/listing.jpg', type: 'main-subject' }],
    };
    flattenVideoReferenceUrlsForProvider(p);
    expect(p.input_reference).toBe('https://cdn.example.com/listing.jpg');
    expect(p.reference_images).toEqual(['https://cdn.example.com/listing.jpg']);
  });

  it('validateVideoHeroOrStoryboard rejects empty hero and grid', () => {
    expect(() =>
      validateVideoHeroOrStoryboard({
        motion_preset: 'gentle_turn',
      }),
    ).toThrow(/首帧|宫格/);
  });

  it('validateVideoHeroOrStoryboard allows text-only when x-video-reference-optional', () => {
    expect(() =>
      validateVideoHeroOrStoryboard(
        { prompt: 'opening motion graphics', fragment_role: 'opening' },
        { 'x-video-reference-optional': true },
      ),
    ).not.toThrow();
  });

  it('prepareVideoTaskParams syncs platform_preset to ratio', () => {
    const p = prepareVideoTaskParams(
      {
        prompt: 'test',
        fragment_role: 'opening',
        platform_preset: 'douyin_9_16',
        uid: 'u1',
      },
      { 'x-video-reference-optional': true, properties: {} },
    );
    expect(p.ratio).toBe('9:16');
  });

  it('prepareVideoTaskParams sets storyboard_prompt when grid enabled', () => {
    const p = prepareVideoTaskParams(
      {
        prompt: 'test',
        storyboard_grid: {
          enabled: true,
          layout: '2x2',
          source_image: { content: 'https://cdn.example.com/grid.jpg' },
          cells: [
            { index: 0, purpose: 'A' },
            { index: 1, purpose: 'B' },
            { index: 2, purpose: 'C' },
            { index: 3, purpose: 'D' },
          ],
        },
      },
      undefined,
    );
    expect(p.storyboard_prompt).toContain('Panel 1');
    expect(p.atlas_video_mode).toBe('reference-to-video');
    expect(p.reference_images).toBeUndefined();
  });

  it('prepareVideoTaskParams skips hero validation when videoEditScriptJson present', () => {
    const p = prepareVideoTaskParams(
      {
        videoEditScriptJson: { project: { timeline: { duration: 10, tracks: [] } } },
        renderOptions: { concatFinal: false },
      },
      undefined,
    );
    expect(p.videoEditScriptJson).toBeTruthy();
    expect(p.input_reference).toBeUndefined();
  });

  it('prepareVideoTaskParams injects uid for video/edit/render schema', () => {
    const schema = {
      type: 'object',
      required: ['videoEditScriptJson', 'uid'],
      properties: {
        videoEditScriptJson: { type: 'object' },
        uid: { type: 'string' },
      },
    };
    const p = prepareVideoTaskParams(
      {
        videoEditScriptJson: { project: { timeline: { duration: 10, tracks: [] } } },
      },
      schema,
    );
    expect(typeof p.uid).toBe('string');
    expect(String(p.uid).trim().length).toBeGreaterThan(0);
  });

  it('prepareVideoTaskParams strips null last_frame_index', () => {
    const p = prepareVideoTaskParams(
      {
        motion_preset: 'gentle_turn',
        hero_still_images: [{ content: 'https://cdn.example.com/hero.jpg', type: 'main-subject' }],
        storyboard_grid: {
          enabled: false,
          layout: '2x2',
          last_frame_index: null,
        },
      },
      {
        properties: {
          storyboard_grid: {
            type: 'object',
            properties: {
              enabled: { type: 'boolean' },
              layout: { type: 'string' },
              last_frame_index: { type: 'integer' },
            },
          },
        },
      },
    );
    const g = p.storyboard_grid as Record<string, unknown>;
    expect(g).not.toHaveProperty('last_frame_index');
  });
});
