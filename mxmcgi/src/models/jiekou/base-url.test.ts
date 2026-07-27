import { describe, expect, it } from 'vitest';
import {
  normalizeJiekouApiHost,
  jiekouOpenAiRoot,
  jiekouOpenAiV1Url,
  jiekouV3Url,
} from './base-url';

describe('normalizeJiekouApiHost', () => {
  it('strips trailing /openai and /v3', () => {
    expect(normalizeJiekouApiHost('https://api.highwayapi.ai/openai')).toBe(
      'https://api.highwayapi.ai',
    );
    expect(normalizeJiekouApiHost('https://api.highwayapi.ai/v3/')).toBe(
      'https://api.highwayapi.ai',
    );
  });

  it('builds openai and v3 urls', () => {
    expect(jiekouOpenAiRoot('https://api.highwayapi.ai')).toBe(
      'https://api.highwayapi.ai/openai',
    );
    expect(jiekouOpenAiV1Url('/chat/completions')).toBe(
      'https://api.highwayapi.ai/openai/v1/chat/completions',
    );
    expect(jiekouV3Url('gpt-image-2-light-text-to-image')).toBe(
      'https://api.highwayapi.ai/v3/gpt-image-2-light-text-to-image',
    );
    expect(jiekouV3Url('async/kling-v3.0-pro-t2v')).toBe(
      'https://api.highwayapi.ai/v3/async/kling-v3.0-pro-t2v',
    );
  });
});
