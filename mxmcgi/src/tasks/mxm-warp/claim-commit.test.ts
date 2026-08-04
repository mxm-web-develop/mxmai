import { describe, expect, it } from 'vitest';
import {
  claimContractSlice,
  commitPathsFromFieldSpecs,
  filterCommitPayload,
  isWholesaleContractMapping,
  normalizeClaimPath,
} from './claim-commit';

describe('claim-commit', () => {
  const contract = {
    meta: { scope: 'writing', taskKey: 'generator', subtype: 'industry-daily', taskId: 't1' },
    basic: {
      main_topic: '主线A',
      core_topic: 'A；B',
      language: 'zh',
      industry: '人工智能',
    },
    business: {
      report_title: '标题',
      dek: '导读',
      body_sections: [{ id: '1' }],
      entities: [{ name: 'X' }],
    },
    selection: { topics: ['A'] },
    assets: { cards: [{ id: 'c1' }] },
    sources: { websource: { topicPool: ['huge'], hitCount: 99 } },
    enrich_search: { query: 'q', result: { text: 'HUGE' } },
  };

  it('normalizeClaimPath strips contract. prefix', () => {
    expect(normalizeClaimPath('contract.basic.main_topic')).toBe('basic.main_topic');
    expect(normalizeClaimPath('state.contract.selection')).toBe('selection');
  });

  it('claimContractSlice picks field paths and omits unclaimed zones', () => {
    const mini = claimContractSlice(contract, [
      'basic.main_topic',
      'basic.language',
      'selection',
      'assets.cards',
    ]);
    expect(mini.basic).toEqual({ main_topic: '主线A', language: 'zh' });
    expect(mini.selection).toEqual({ topics: ['A'] });
    expect(mini.assets).toEqual({ cards: [{ id: 'c1' }] });
    expect(mini.business).toBeUndefined();
    expect(mini.sources).toBeUndefined();
    expect(mini.enrich_search).toBeUndefined();
    expect((mini.meta as { taskId: string }).taskId).toBe('t1');
  });

  it('claim whole zone business without sources', () => {
    const mini = claimContractSlice(contract, ['basic', 'business']);
    expect(mini.basic).toEqual(contract.basic);
    expect(mini.business).toEqual(contract.business);
    expect(mini.sources).toBeUndefined();
  });

  it('isWholesaleContractMapping detects full-contract placeholders', () => {
    expect(isWholesaleContractMapping('${state.contract}')).toBe(true);
    expect(isWholesaleContractMapping('${contract}')).toBe(true);
    expect(isWholesaleContractMapping('${state.contract.basic}')).toBe(false);
  });

  it('filterCommitPayload keeps only allowlisted keys', () => {
    const filtered = filterCommitPayload(
      {
        body_sections: [1],
        entities: [2],
        leaked: 'no',
        report_title: 'should drop',
      },
      ['body_sections', 'business.entities']
    );
    expect(filtered).toEqual({ body_sections: [1], entities: [2] });
  });

  it('commitPathsFromFieldSpecs extracts names', () => {
    expect(
      commitPathsFromFieldSpecs([
        { name: 'report_title' },
        { name: 'dek' },
        { foo: 1 },
      ])
    ).toEqual(['report_title', 'dek']);
  });
});
