import { describe, expect, it } from 'vitest';
import { normalizeAtlasVideoGenerateBody } from './video-body-normalize';

describe('normalizeAtlasVideoGenerateBody', () => {
  it('strips width/height/size for Seedance upstream', () => {
    const body: Record<string, unknown> = {
      model: 'bytedance/seedance-2.0/image-to-video',
      prompt: 'test',
      width: 128,
      height: 72,
      size: '128x72',
      duration: 5,
      resolution: '720p',
      ratio: '9:16',
    };
    normalizeAtlasVideoGenerateBody(body, body.model as string, { force: true });
    expect(body.width).toBeUndefined();
    expect(body.height).toBeUndefined();
    expect(body.size).toBeUndefined();
    expect(body.ratio).toBe('9:16');
  });

  it('forces normalize on generateVideo when force=true even without ratio', () => {
    const body: Record<string, unknown> = {
      model: 'some-legacy-video-model',
      width: 50,
      size: '100x200',
    };
    normalizeAtlasVideoGenerateBody(body, body.model as string, { force: true });
    expect(body.width).toBeUndefined();
    expect(body.size).toBeUndefined();
    expect(body.resolution).toBe('720p');
    expect(body.ratio).toBe('adaptive');
  });

  it('removes aspect_ratio in favor of ratio', () => {
    const body: Record<string, unknown> = {
      model: 'bytedance/seedance-2.0/text-to-video',
      aspect_ratio: '16:9',
      ratio: '9:16',
    };
    normalizeAtlasVideoGenerateBody(body, body.model as string);
    expect(body.aspect_ratio).toBeUndefined();
  });
});
