import { describe, expect, it } from 'vitest';
import {
  inferTrackHeuristicFallback,
  mapEnumIndustryToTrack,
  parseTrackClassifyOutput,
  readExistingSearchTrack,
} from './industry-search-track-classify';
import { resolveIndustrySearchStrategy } from './industry-search-strategy';
import { DOMAIN_PRESETS } from '../../core/search/domain-presets';

describe('mapEnumIndustryToTrack', () => {
  it('maps legacy broad categories', () => {
    expect(mapEnumIndustryToTrack('金融')).toBe('finance');
    expect(mapEnumIndustryToTrack('科技')).toBe('tech');
    expect(mapEnumIndustryToTrack('娱乐')).toBe('entertainment');
    expect(mapEnumIndustryToTrack('体育')).toBe('sports');
    expect(mapEnumIndustryToTrack('其他')).toBeNull();
  });

  it('maps fine-grained sectors', () => {
    expect(mapEnumIndustryToTrack('股票')).toBe('finance');
    expect(mapEnumIndustryToTrack('基金')).toBe('finance');
    expect(mapEnumIndustryToTrack('银行保险')).toBe('finance');
    expect(mapEnumIndustryToTrack('加密货币')).toBe('finance');
    expect(mapEnumIndustryToTrack('人工智能')).toBe('tech');
    expect(mapEnumIndustryToTrack('半导体')).toBe('tech');
    expect(mapEnumIndustryToTrack('足球')).toBe('sports');
    expect(mapEnumIndustryToTrack('篮球')).toBe('sports');
    expect(mapEnumIndustryToTrack('赛车')).toBe('sports');
    expect(mapEnumIndustryToTrack('影视综')).toBe('entertainment');
    expect(mapEnumIndustryToTrack('游戏')).toBe('entertainment');
  });
});

describe('inferTrackHeuristicFallback', () => {
  it('maps F1 custom sector to sports', () => {
    expect(inferTrackHeuristicFallback('F1赛事')).toBe('sports');
    expect(inferTrackHeuristicFallback('一级方程式')).toBe('sports');
  });
});

describe('parseTrackClassifyOutput', () => {
  it('parses JSON track', () => {
    const r = parseTrackClassifyOutput(
      '{"track":"sports","sector_label":"F1","reason":"motorsport"}'
    );
    expect(r?.track).toBe('sports');
    expect(r?.sector_label).toBe('F1');
  });
});

describe('resolveIndustrySearchStrategy with search_track', () => {
  it('prefers params.search_track over sector text', () => {
    const s = resolveIndustrySearchStrategy({
      industry: '其他',
      industry_custom: '随便什么',
      search_track: 'sports',
      search_region: 'cn',
    });
    expect(s.track).toBe('sports');
    expect(s.includeDomains).toEqual(DOMAIN_PRESETS.sports);
    expect(s.querySuffixes.join(' ')).toMatch(/体育|赛况|赛事/);
    expect(s.querySuffixes.join(' ')).not.toMatch(/行业新闻/);
  });

  it('default region is global without domain whitelist', () => {
    const s = resolveIndustrySearchStrategy({
      industry: '其他',
      industry_custom: '随便什么',
      search_track: 'sports',
    });
    expect(s.searchRegion).toBe('global');
    expect(s.includeDomains).toBeUndefined();
    expect(s.searchLanguage).toBe('all');
  });

  it('reads existing search_track helper', () => {
    expect(readExistingSearchTrack({ search_track: 'tech' })).toBe('tech');
    expect(readExistingSearchTrack({ searchTrack: 'finance' })).toBe('finance');
  });

  it('sports presets include F1 media', () => {
    expect(DOMAIN_PRESETS.sports).toContain('formula1.com');
    expect(DOMAIN_PRESETS.sports).toContain('the-race.com');
  });
});
