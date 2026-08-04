import { describe, expect, it } from 'vitest';
import {
  assertCleanWritingManuscript,
  extractMarkdownArticleFromMixedOutput,
  looksLikeLlmScratchpad,
} from './llm-output-hygiene';

describe('llm-output-hygiene', () => {
  it('flags English contract planning dump', () => {
    const bad = `The user wants me to write an editorial article about the A-share market based on the contract provided. Let me analyze the contract carefully:

1. **Basic Info**: Industry is stocks
Humor beats: 4 listed, need to trim to 2
Let me draft this carefully following all the tone directives
OK let me now assemble the full article.`;
    expect(looksLikeLlmScratchpad(bad)).toBe(true);
  });

  it('accepts normal Chinese markdown article', () => {
    const ok = `# 7月30日A股：科创50大跌

> 市场集中退烧

## 开场

沪指勉强守住3800点。科创板单日跌幅靠前。

## 行情

全市场超3600只个股下跌。成交额维持高位。`;
    expect(looksLikeLlmScratchpad(ok)).toBe(false);
    expect(assertCleanWritingManuscript(ok)).toContain('科创50');
  });

  it('salvages article after scratchpad prefix', () => {
    const mixed = `The user wants me to write.
Let me analyze the contract carefully.
Humor beats used: 2
Let me draft:

# 7月30日A股：科创50大跌5.38%

沪指勉强守住3800点。这是一次集中退烧。

## 收评

科创板领跌。创业板同步走弱。全市场超3600只个股下跌。

## 续跌

恐慌盘继续释放。银行红利补跌。`;
    const got = extractMarkdownArticleFromMixedOutput(mixed);
    expect(got?.startsWith('# 7月30日')).toBe(true);
    expect(looksLikeLlmScratchpad(got!)).toBe(false);
  });

  it('throws when only scratchpad', () => {
    expect(() =>
      assertCleanWritingManuscript(
        'The user wants me to write. Let me analyze. Humor beats: 1. OK let me finalize.'
      )
    ).toThrow(/思考草稿/);
  });
});
