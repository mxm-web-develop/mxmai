import { describe, expect, it } from 'vitest';
import {
  extractMaxplanChatText,
  stripReasoningFromUpstreamRaw,
} from './provider';

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

  it('never uses reasoning_content as body (process only)', () => {
    expect(
      extractMaxplanChatText({
        content: '',
        reasoning_content: '{"topics":["比特币回落","以太坊ETF"]}',
      }),
    ).toBe('');
    expect(
      extractMaxplanChatText({
        content: '',
        reasoning_content: '这是一大段中文思考过程内容，绝不应当成成稿落库。'.repeat(3),
      }),
    ).toBe('');
    expect(
      extractMaxplanChatText({
        content: '',
        reasoning_content:
          'The user wants me to write. Let me analyze. Let me draft. OK let me finalize.',
      }),
    ).toBe('');
  });
});

describe('stripReasoningFromUpstreamRaw', () => {
  it('removes reasoning fields from choices message', () => {
    const raw = {
      choices: [
        {
          message: {
            content: '正文',
            reasoning_content: '秘密思考',
            reasoning_details: [{ text: 'x' }],
          },
        },
      ],
    };
    const stripped = stripReasoningFromUpstreamRaw(raw) as {
      choices: Array<{ message: Record<string, unknown> }>;
    };
    expect(stripped.choices[0]!.message.content).toBe('正文');
    expect(stripped.choices[0]!.message.reasoning_content).toBeUndefined();
    expect(stripped.choices[0]!.message.reasoning_details).toBeUndefined();
  });
});
