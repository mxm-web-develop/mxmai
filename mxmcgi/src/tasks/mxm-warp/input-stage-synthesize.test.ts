import { describe, expect, it } from 'vitest';
import { synthesizeEnrichSearchQuery } from './input-stage';
import { emptyContract, MXM_WARP_CONTRACT_VERSION } from './contract-types';

describe('synthesizeEnrichSearchQuery', () => {
  it('does not append hardcoded Chinese report suffixes', () => {
    const contract = emptyContract({
      version: MXM_WARP_CONTRACT_VERSION,
      scope: 'writing',
      taskKey: 'generator',
      subtype: 'industry-daily',
      taskId: 't1',
    });
    contract.basic = { main_topic: '欧央行利率', industry: '股票' };
    const q = synthesizeEnrichSearchQuery(contract, {});
    expect(q).toContain('欧央行利率');
    expect(q).toContain('股票');
    expect(q).not.toMatch(/深度报道|背景|影响/);
    expect(q).not.toMatch(/行业$/);
  });

  it('accepts optional suffixTokens', () => {
    const contract = emptyContract({
      version: MXM_WARP_CONTRACT_VERSION,
      scope: 'writing',
      taskKey: 'generator',
      subtype: null,
      taskId: 't1',
    });
    contract.basic = { topic: 'F1' };
    const q = synthesizeEnrichSearchQuery(contract, {}, { suffixTokens: ['deep dive'] });
    expect(q).toBe('F1 deep dive');
  });
});
