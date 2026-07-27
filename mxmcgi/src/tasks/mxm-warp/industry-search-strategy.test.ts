import { describe, expect, it } from 'vitest';
import { resolveIndustrySearchStrategy } from './industry-search-strategy';
import { DOMAIN_PRESETS } from '../../core/search/domain-presets';

describe('resolveIndustrySearchStrategy', () => {
  it('maps 科技 to tech presets from DOMAIN_PRESETS', () => {
    const s = resolveIndustrySearchStrategy({ industry: '科技' });
    expect(s.track).toBe('tech');
    expect(s.includeDomains).toEqual(DOMAIN_PRESETS.tech);
    expect(s.querySuffixes.join(' ')).not.toMatch(/财经/);
  });

  it('maps 金融 to finance dimension', () => {
    const s = resolveIndustrySearchStrategy({ industry: '金融' });
    expect(s.track).toBe('finance');
    expect(s.dimensions).toEqual(['news', 'finance']);
    expect(s.includeDomains).toEqual(DOMAIN_PRESETS.finance);
  });
});
