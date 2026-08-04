import { describe, expect, it } from 'vitest';
import { mapIndustryLabelToDataDomain } from './domain-data-query-step';
import { targetToEvidenceKey } from './evidence';

describe('domainDataQuery helpers', () => {
  it('maps finance industries to data domains', () => {
    expect(mapIndustryLabelToDataDomain('股票')).toBe('stock');
    expect(mapIndustryLabelToDataDomain('加密货币')).toBe('crypto');
    expect(mapIndustryLabelToDataDomain('基金')).toBe('finance');
    expect(mapIndustryLabelToDataDomain('游戏')).toBeNull();
  });

  it('maps market_snapshot target to evidence key', () => {
    expect(targetToEvidenceKey('enrich_search.market_snapshot')).toBe('enrich_market_snapshot');
  });
});
