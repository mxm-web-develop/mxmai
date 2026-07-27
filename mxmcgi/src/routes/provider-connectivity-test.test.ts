import { describe, expect, it } from 'vitest';
import {
  buildMinConnectivityGenerateParams,
  isProtocolLikeModelKey,
  resolveInferedModalityForConnectivityTest,
} from './provider-connectivity-test';

describe('provider-connectivity-test atlascloud video', () => {
  it('uses Seedance-friendly duration/resolution instead of width/height', () => {
    const { params, strategy } = buildMinConnectivityGenerateParams('atlascloud', 'seedance-2', 'video');
    expect(params.parameters?.width).toBeUndefined();
    expect(params.parameters?.height).toBeUndefined();
    expect(params.parameters?.duration).toBe(5);
    expect(params.parameters?.resolution).toBe('720p');
    expect(params.parameters?.ratio).toBe('adaptive');
    expect(strategy).toContain('duration/resolution/ratio');
  });

  it('flags protocol name misused as model_key', () => {
    expect(isProtocolLikeModelKey('prediction_video')).toBe(true);
    expect(isProtocolLikeModelKey('seedance-2')).toBe(false);
  });

  it('allows enough poll window for slow atlascloud image models', () => {
    const { params, strategy } = buildMinConnectivityGenerateParams(
      'atlascloud',
      'gpt-image-2',
      'image',
    );
    expect(params.parameters?.max_wait_ms).toBeGreaterThanOrEqual(120_000);
    expect(strategy).toContain('180s');
  });

  it('resolves knowledge scope to embedding modality', () => {
    expect(
      resolveInferedModalityForConnectivityTest('jiekou', 'qwen3-embedding-8b', 'knowledge', 'embedding'),
    ).toBe('embedding');
    expect(
      resolveInferedModalityForConnectivityTest('jiekou', 'qwen3-embedding-8b', 'knowledge', null),
    ).toBe('embedding');
  });

  it('resolves music scope to music modality', () => {
    expect(resolveInferedModalityForConnectivityTest('maxplan', 'music-2.5', 'music', null)).toBe(
      'music',
    );
    const { strategy } = buildMinConnectivityGenerateParams('maxplan', 'music-2.5', 'music');
    expect(strategy).toContain('music_generation');
  });
});
