import { describe, expect, it } from 'vitest';
import {
  ProviderContentPolicyError,
  downgradeNestedParamsForContentPolicy,
  extractHitWordsFromError,
  extractHitWordsFromUpstreamJson,
  isProviderContentPolicyError,
  redactHitWordsInParams,
  redactHitWordsInText,
} from './provider-content-policy';

describe('provider-content-policy', () => {
  it('detects Maxplan 1026 / 涉敏', () => {
    expect(
      isProviderContentPolicyError(
        new Error(
          'Maxplan 文本 业务失败: status_code=1026 input new_sensitive · 输入涉敏·严重违规（上游不返回具体敏感词，仅类型）'
        )
      )
    ).toBe(true);
    expect(isProviderContentPolicyError(new Error('timeout'))).toBe(false);
    expect(
      isProviderContentPolicyError(
        new ProviderContentPolicyError('blocked', { hitWords: ['打虎'], statusCode: 1026 })
      )
    ).toBe(true);
  });

  it('extracts hit words from upstream json and error message', () => {
    expect(
      extractHitWordsFromUpstreamJson({
        sensitive_words: ['打虎', '反腐'],
        base_resp: { status_code: 1026 },
      })
    ).toEqual(['打虎', '反腐']);

    expect(
      extractHitWordsFromError(
        new Error('Maxplan 文本 业务失败: status_code=1026 · 命中：打虎、反腐')
      )
    ).toEqual(['打虎', '反腐']);

    expect(
      extractHitWordsFromError(
        new ProviderContentPolicyError('x', { hitWords: ['伊核'] })
      )
    ).toEqual(['伊核']);
  });

  it('redacts hit words in nested params', () => {
    const next = redactHitWordsInParams(
      {
        contract: { basic: { main_topic: '伊核协议进展' } },
        evidencePack: [{ digestText: '伊核 猛轰 核区', query: '伊核' }],
      },
      ['伊核', '猛轰']
    );
    expect(next.__contentPolicyRetry).toMatch(/^redact-hits:/);
    expect((next.contract as { basic: { main_topic: string } }).basic.main_topic).toBe(
      '…协议进展'
    );
    const pack = next.evidencePack as Array<{ digestText: string; query: string }>;
    expect(pack[0]!.digestText).toBe('… … 核区');
    expect(pack[0]!.query).toBe('…');
    expect(redactHitWordsInText('无命中', ['打虎'])).toBe('无命中');
  });

  it('shrinks evidence then omits on level 2', () => {
    const base = {
      contract: { basic: { main_topic: 'A' } },
      evidencePack: [
        {
          key: 'enrich_result',
          query: 'q',
          digestText: '习近平 ' + 'x'.repeat(2000),
          items: [
            { title: '正常标题', snippet: '正常摘要', url: 'https://a' },
            { title: '反腐新闻', snippet: '打虎', url: 'https://b' },
          ],
        },
      ],
    };
    const l1 = downgradeNestedParamsForContentPolicy(base, 1);
    expect(l1.__contentPolicyRetry).toBe('shrink-evidence');
    const pack = l1.evidencePack as Array<{ digestText: string; items: unknown[] }>;
    expect(pack[0]!.digestText).not.toContain('习近平');
    expect(pack[0]!.digestText.length).toBeLessThanOrEqual(600);
    expect((pack[0]!.items[0] as { url?: string }).url).toBeUndefined();

    const l2 = downgradeNestedParamsForContentPolicy(l1, 2);
    expect(l2.evidencePack).toBeUndefined();
    expect(l2.__contentPolicyRetry).toBe('omit-evidence');
    expect(l2.contract).toEqual(base.contract);
  });
});
