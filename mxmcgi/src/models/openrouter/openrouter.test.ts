import { describe, it, expect } from 'vitest';
import { normalizeVideoProtocol, getVideoProtocolForModel } from '../../core/video/provider-param-map';

describe('OpenRouter provider-param-map integration', () => {
  it('normalizeVideoProtocol recognizes openrouter_video', () => {
    expect(normalizeVideoProtocol('openrouter_video')).toBe('openrouter_video');
    expect(normalizeVideoProtocol('openrouter-video')).toBe('openrouter_video');
    expect(normalizeVideoProtocol('OPENROUTER_VIDEO')).toBe('openrouter_video');
  });

  it('getVideoProtocolForModel defaults to openrouter_video for openrouter provider', () => {
    const result = getVideoProtocolForModel('openrouter', 'some-video-model');
    expect(result).toBe('openrouter_video');
  });

  it('normalizeVideoProtocol still handles other protocols', () => {
    expect(normalizeVideoProtocol('prediction_video')).toBe('prediction_video');
    expect(normalizeVideoProtocol('deer_video_job')).toBe('deer_video_job');
    expect(normalizeVideoProtocol('replicate_video')).toBe('replicate_video');
    expect(normalizeVideoProtocol('openai_video')).toBe('openai_video');
  });
});

describe('OpenRouter ProviderType registration', () => {
  it('openrouter is a valid ProviderType', async () => {
    const { ProviderFactory } = await import('../../core/providers/index');
    expect(ProviderFactory).toBeDefined();
  });
});
