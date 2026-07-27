import { describe, expect, it } from 'vitest';
import {
  buildMultilingualIndustryQueries,
  domainsForRegionAndTrack,
  normalizeSearchRegion,
  preferItemsForSearchRegion,
  querySuffixesForRegionAndTrack,
  searchLanguageForRegion,
  sectorQueryLabel,
} from './industry-search-region';
import { resolveIndustrySearchStrategy } from './industry-search-strategy';

describe('normalizeSearchRegion', () => {
  it('defaults to global', () => {
    expect(normalizeSearchRegion(undefined)).toBe('global');
    expect(normalizeSearchRegion('')).toBe('global');
    expect(normalizeSearchRegion('weird')).toBe('global');
  });

  it('accepts aliases', () => {
    expect(normalizeSearchRegion('全球')).toBe('global');
    expect(normalizeSearchRegion('中国大陆')).toBe('cn');
    expect(normalizeSearchRegion('taiwan')).toBe('tw');
    expect(normalizeSearchRegion('北美')).toBe('na');
  });
});

describe('resolveIndustrySearchStrategy region', () => {
  it('global tech: no domain whitelist, search language all', () => {
    const s = resolveIndustrySearchStrategy({ industry: '科技', search_region: 'global' });
    expect(s.searchRegion).toBe('global');
    expect(s.includeDomains).toBeUndefined();
    expect(s.sectorQuery).toBe('technology');
    expect(s.searchLanguage).toBe('all');
  });

  it('cn tech: keeps mainland domain bias; engine language still all', () => {
    const s = resolveIndustrySearchStrategy({ industry: '科技', search_region: 'cn' });
    expect(s.includeDomains?.some((d) => d.includes('36kr'))).toBe(true);
    expect(s.searchLanguage).toBe('all');
  });

  it('na finance: intl domains; engine language all', () => {
    const s = resolveIndustrySearchStrategy({ industry: '金融', search_region: 'na' });
    expect(s.includeDomains?.some((d) => d.includes('bloomberg'))).toBe(true);
    expect(s.searchLanguage).toBe('all');
  });
});

describe('helpers', () => {
  it('sector and language helpers', () => {
    expect(sectorQueryLabel('科技', 'global')).toBe('technology');
    expect(sectorQueryLabel('科技', 'cn')).toBe('科技');
    expect(searchLanguageForRegion('eu')).toBe('all');
    expect(domainsForRegionAndTrack('global', 'tech')).toBeUndefined();
    expect(querySuffixesForRegionAndTrack('jp', 'tech')[0]).toMatch(/Japan/i);
  });

  it('multilingual queries for global are en+ja only (no zh flood)', () => {
    const qs = buildMultilingualIndustryQueries({
      sector: '科技',
      track: 'tech',
      region: 'global',
      ymd: '2026-07-24',
    });
    expect(qs.length).toBeGreaterThanOrEqual(2);
    expect(qs.some((q) => /technology|tech news/i.test(q))).toBe(true);
    expect(qs.some((q) => /テクノロジー|テック/.test(q))).toBe(true);
    expect(qs.every((q) => !/科技新闻/.test(q))).toBe(true);
  });

  it('englishifies CJK custom sector on global', () => {
    const qs = buildMultilingualIndustryQueries({
      sector: 'ai具身机器人',
      track: 'tech',
      region: 'global',
      ymd: '2026-07-24',
    });
    expect(qs[0]).toMatch(/embodied AI robot/i);
    expect(qs.every((q) => !/具身机器人/.test(q))).toBe(true);
  });

  it('prefers international hosts for global', () => {
    const ranked = preferItemsForSearchRegion(
      [
        { domain: 'k.sina.com.cn', title: 'cn' },
        { domain: 'www.cnn.com', title: 'intl' },
        { domain: 'techcrunch.com', title: 'tc' },
        { domain: 'www.xinhuanet.com', title: 'xh' },
      ],
      'global'
    );
    expect(ranked[0]?.domain).toMatch(/cnn|techcrunch/);
    expect(ranked.filter((x) => /sina|xinhua/.test(String(x.domain))).length).toBeLessThanOrEqual(1);
  });
});
