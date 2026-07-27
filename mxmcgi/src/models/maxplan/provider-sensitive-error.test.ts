import { describe, expect, it } from 'vitest';
import { formatMiniMaxBusinessError } from './provider';

describe('formatMiniMaxBusinessError', () => {
  it('appends sensitive type label for 1026', () => {
    const msg = formatMiniMaxBusinessError(
      {
        input_sensitive: true,
        input_sensitive_type: 7,
        base_resp: { status_code: 1026, status_msg: 'input new_sensitive' },
      },
      '文本'
    );
    expect(msg).toContain('status_code=1026');
    expect(msg).toContain('input new_sensitive');
    expect(msg).toContain('输入涉敏·其他');
    expect(msg).toContain('不返回具体敏感词');
  });

  it('surfaces hit words when upstream provides them', () => {
    const msg = formatMiniMaxBusinessError(
      {
        input_sensitive: true,
        input_sensitive_type: 4,
        sensitive_words: ['foo', 'bar'],
        base_resp: { status_code: 1026, status_msg: 'input new_sensitive' },
      },
      '文本'
    );
    expect(msg).toContain('命中：foo、bar');
    expect(msg).toContain('输入涉敏·违禁');
  });
});
