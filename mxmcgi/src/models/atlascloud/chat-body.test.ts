import { describe, expect, it } from 'vitest';
import { buildAtlasChatCompletionsBody } from './chat-body';

describe('buildAtlasChatCompletionsBody', () => {
  it('moves system_prompt into messages and strips it from top-level', () => {
    const { body, systemPrompt } = buildAtlasChatCompletionsBody({
      upstreamModel: 'openai/gpt-oss-120b',
      userContent: 'hello',
      parameters: {
        system_prompt: 'You are a writer',
        temperature: 0.2,
        max_tokens: 1024,
      },
    });
    expect(systemPrompt).toBe('You are a writer');
    expect(body.system_prompt).toBeUndefined();
    expect(body.messages).toEqual([
      { role: 'system', content: 'You are a writer' },
      { role: 'user', content: 'hello' },
    ]);
    expect(body.temperature).toBe(0.2);
    expect(body.max_tokens).toBe(1024);
    expect(body.model).toBe('openai/gpt-oss-120b');
  });

  it('strips image slots that would 400 chat/completions', () => {
    const { body } = buildAtlasChatCompletionsBody({
      upstreamModel: 'm',
      userContent: 'u',
      parameters: {
        images: ['https://example.com/a.png'],
        image_input: [],
        prompt: 'should-not-leak',
      },
    });
    expect(body.images).toBeUndefined();
    expect(body.image_input).toBeUndefined();
    expect(body.prompt).toBeUndefined();
  });

  it('maps camelCase maxTokens/topP to max_tokens only (no max_completion_tokens)', () => {
    const { body } = buildAtlasChatCompletionsBody({
      upstreamModel: 'google/gemini-3.5-flash',
      userContent: 'u',
      parameters: { maxTokens: 4096, topP: 0.9, max_completion_tokens: 4096 },
    });
    expect(body.max_tokens).toBe(4096);
    expect(body.max_completion_tokens).toBeUndefined();
    expect(body.top_p).toBe(0.9);
    expect(body.maxTokens).toBeUndefined();
    expect(body.topP).toBeUndefined();
  });
});
