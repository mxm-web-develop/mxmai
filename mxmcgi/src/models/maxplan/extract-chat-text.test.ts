import { describe, expect, it } from 'vitest';
import { extractMaxplanChatText } from './provider';

describe('extractMaxplanChatText', () => {
  it('returns plain content', () => {
    expect(extractMaxplanChatText({ content: 'Hello prompt' })).toBe('Hello prompt');
  });

  it('strips thinking block before answer', () => {
    const open = '<' + 'think' + '>';
    const close = '<' + '/think' + '>';
    const withThinking = `${open}internal${close}Final English prompt`;
    expect(extractMaxplanChatText({ content: withThinking })).toBe('Final English prompt');
  });

  it('falls back to reasoning_content when content empty', () => {
    expect(
      extractMaxplanChatText({
        content: '',
        reasoning_content: 'fallback text',
      }),
    ).toBe('fallback text');
  });
});
