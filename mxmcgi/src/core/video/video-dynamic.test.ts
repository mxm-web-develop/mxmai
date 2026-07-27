import { describe, expect, it } from 'vitest';
import { coerceVideoDuration, buildVideoChunkTaskParams } from './video-params';
import { mapFormParamsToProviderGenerate, normalizeVideoProtocol } from './provider-param-map';
import { resolveVideoTaskKey, resolveVideoTaskKeyFromScriptType } from './video-task-keys';

describe('video-params', () => {
  it('coerceVideoDuration passes through valid seconds without sora snapping', () => {
    expect(coerceVideoDuration(5)).toBe(5);
    expect(coerceVideoDuration('15')).toBe(15);
    expect(coerceVideoDuration(undefined, 10)).toBe(10);
  });

  it('buildVideoChunkTaskParams maps duration fields for billing and providers', () => {
    const p = buildVideoChunkTaskParams({
      prompt: 'test',
      chunk_seconds: 5,
      orientation: 'portrait',
      reference_image_url: 'https://example.com/a.jpg',
    });
    expect(p.seconds).toBe('5');
    expect(p.duration).toBe(5);
    expect(p.total_duration_seconds).toBe(5);
    expect(p.size).toBe('720x1280');
    expect(p.reference_images).toEqual(['https://example.com/a.jpg']);
  });
});

describe('video-task-keys', () => {
  it('maps storyboard scriptType to video taskKey', () => {
    expect(resolveVideoTaskKeyFromScriptType('short-video-storyboard')).toBe('short');
    expect(resolveVideoTaskKeyFromScriptType('movie-storyboard')).toBe('movie');
  });

  it('prefers explicit taskKey over scriptType', () => {
    expect(
      resolveVideoTaskKey({ taskKey: 'commercial', scriptType: 'short-video-storyboard' }),
    ).toBe('commercial');
  });
});

describe('provider-param-map', () => {
  it('normalizes protocol strings', () => {
    expect(normalizeVideoProtocol('prediction_video')).toBe('prediction_video');
    expect(normalizeVideoProtocol('deer_video_job')).toBe('deer_video_job');
  });

  it('maps deer form params to seconds/size', () => {
    const { parameters } = mapFormParamsToProviderGenerate('deer_video_job', {
      prompt: 'a cat',
      duration: 5,
      orientation: 'portrait',
    });
    expect(parameters.seconds).toBe('5');
    expect(parameters.size).toBe('720x1280');
  });

  it('maps prediction_video form params to duration/resolution', () => {
    const { parameters } = mapFormParamsToProviderGenerate('prediction_video', {
      prompt: 'a cat',
      duration: 8,
      resolution: '720p',
      ratio: '9:16',
    });
    expect(parameters.duration).toBe(8);
    expect(parameters.resolution).toBe('720p');
    expect(parameters.ratio).toBe('9:16');
  });
});
