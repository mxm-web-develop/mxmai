import { describe, expect, it } from 'vitest';
import {
  buildOpenRouterImageUserMessage,
  collectOpenRouterReferenceImageUrls,
  extractOpenRouterGeneratedImageUrls,
} from './image-chat';

describe('openrouter image-chat', () => {
  it('builds multimodal message with refs', () => {
    const content = buildOpenRouterImageUserMessage('edit this', ['data:image/png;base64,abc']);
    expect(Array.isArray(content)).toBe(true);
    expect((content as { type: string }[]).length).toBe(2);
  });

  it('collects reference slots', () => {
    const urls = collectOpenRouterReferenceImageUrls({
      prompt: 'p',
      parameters: { image: 'https://example.com/a.png' },
    });
    expect(urls).toEqual(['https://example.com/a.png']);
  });

  it('extracts images from OpenRouter response shape', () => {
    const urls = extractOpenRouterGeneratedImageUrls({
      choices: [
        {
          message: {
            images: [{ image_url: { url: 'data:image/png;base64,xyz' } }],
          },
        },
      ],
    });
    expect(urls[0]).toContain('data:image/png');
  });
});
