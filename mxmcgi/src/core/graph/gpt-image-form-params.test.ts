import { describe, it, expect } from 'vitest';
import {
  applyGptImageFormApiOptions,
  supportsGptImageTransparentBackgroundApi,
} from './gpt-image-form-params';

describe('supportsGptImageTransparentBackgroundApi', () => {
  it('rejects atlascloud gpt-image-2', () => {
    expect(supportsGptImageTransparentBackgroundApi('gpt-image-2', 'atlascloud')).toBe(false);
  });

  it('rejects gpt-image-2-all regardless of provider', () => {
    expect(supportsGptImageTransparentBackgroundApi('gpt-image-2-all', 'deer')).toBe(false);
  });
});

describe('applyGptImageFormApiOptions', () => {
  it('atlascloud gpt-image-2: PNG only, no background=transparent', () => {
    const imageParams: Record<string, unknown> = { prompt: 'logo', aspect_ratio: '1:1' };
    applyGptImageFormApiOptions(
      imageParams,
      { transparent_background: true },
      'gpt-image-2',
      { provider: 'atlascloud' },
    );
    expect(imageParams.parameters).toEqual({
      output_format: 'png',
      aspect_ratio: '1:1',
    });
  });

  it('legacy gpt-image-1 may still send transparent when provider supports', () => {
    const imageParams: Record<string, unknown> = { prompt: 'logo' };
    applyGptImageFormApiOptions(
      imageParams,
      { transparent_background: true },
      'gpt-image-1',
      { provider: 'openai' },
    );
    expect(imageParams.parameters).toEqual({
      background: 'transparent',
      output_format: 'png',
    });
  });

  it('no-op for non gpt-image models', () => {
    const imageParams: Record<string, unknown> = { prompt: 'x' };
    applyGptImageFormApiOptions(imageParams, { transparent_background: true }, 'nano-banana-2');
    expect(imageParams.parameters).toBeUndefined();
  });

  it('no-op when switch is off', () => {
    const imageParams: Record<string, unknown> = { prompt: 'x', aspect_ratio: '16:9' };
    applyGptImageFormApiOptions(
      imageParams,
      { transparent_background: false },
      'gpt-image-2',
      { provider: 'atlascloud' },
    );
    expect(imageParams.parameters).toEqual({ aspect_ratio: '16:9' });
  });
});
