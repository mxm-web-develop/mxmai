import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DimensionSearchResult, SearchDimension } from './types';
import type { SearchProvider } from './providers/base';
import { SearchAggregator } from './aggregator';
import {
  clearSearchProviderCooldowns,
  isRateLimitSignal,
  isSearchProviderInCooldown,
  markSearchProviderCooldown,
} from './search-config';

vi.mock('./search-config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./search-config')>();
  return {
    ...actual,
    listUsableProvidersForDimension: vi.fn(async (dimension: string) => {
      if (dimension === 'news' || dimension === 'general') {
        return ['tavily', 'anysearch', 'bocha'];
      }
      return ['anysearch'];
    }),
  };
});

function mockProvider(
  name: string,
  dims: SearchDimension[],
  impl: SearchProvider['search']
): SearchProvider {
  return {
    name,
    supportedDimensions: dims,
    search: impl,
    healthCheck: async () => true,
  };
}

function empty(dimension: SearchDimension, provider: string, error?: string): DimensionSearchResult {
  return {
    dimension,
    provider,
    items: [],
    total: 0,
    query: 'q',
    timestamp: new Date().toISOString(),
    ...(error ? { error } : {}),
  };
}

function hit(dimension: SearchDimension, provider: string): DimensionSearchResult {
  return {
    dimension,
    provider,
    items: [
      {
        title: `${provider} hit`,
        url: `https://example.com/${provider}`,
        snippet: 'ok',
        domain: 'example.com',
        dimension,
        source: provider,
      },
    ],
    total: 1,
    query: 'q',
    timestamp: new Date().toISOString(),
  };
}

describe('isRateLimitSignal', () => {
  it('detects tavily 432 / usage limit', () => {
    expect(isRateLimitSignal('HTTP 432 usage limit')).toBe(true);
    expect(isRateLimitSignal("plan's set usage limit")).toBe(true);
    expect(isRateLimitSignal('HTTP 429 Too Many Requests')).toBe(true);
    expect(isRateLimitSignal('HTTP 500')).toBe(false);
  });
});

describe('SearchAggregator runtime fallback', () => {
  beforeEach(() => {
    clearSearchProviderCooldowns();
  });

  it('falls through empty/rate-limited tavily to anysearch', async () => {
    const agg = new SearchAggregator();
    const tavily = mockProvider('tavily', ['news', 'general'], async () =>
      empty('news', 'tavily', 'HTTP 432 usage limit')
    );
    const anysearch = mockProvider('anysearch', ['news', 'general'], async () => hit('news', 'anysearch'));
    const bocha = mockProvider('bocha', ['news', 'general'], async () => hit('news', 'bocha'));
    agg.registerProvider('tavily', tavily);
    agg.registerProvider('anysearch', anysearch);
    agg.registerProvider('bocha', bocha);

    const res = await agg.aggregate({
      query: '影视综 本周',
      dimensions: ['news'],
      depth: 'standard',
      numResults: 5,
    });

    expect(res.aggregated).toHaveLength(1);
    expect(res.aggregated[0]?.source).toBe('anysearch');
    expect(res.dimensionResults.news?.provider).toBe('anysearch');
    expect(isSearchProviderInCooldown('tavily')).toBe(true);
  });

  it('skips provider in cooldown', async () => {
    markSearchProviderCooldown('tavily', 'HTTP 432', 60_000);
    const agg = new SearchAggregator();
    const tavily = mockProvider('tavily', ['general'], async () => {
      throw new Error('should not call tavily');
    });
    const anysearch = mockProvider('anysearch', ['general'], async () => hit('general', 'anysearch'));
    agg.registerProvider('tavily', tavily);
    agg.registerProvider('anysearch', anysearch);
    agg.registerProvider('bocha', mockProvider('bocha', ['general'], async () => empty('general', 'bocha')));

    const res = await agg.aggregate({
      query: 'test',
      dimensions: ['general'],
      numResults: 3,
    });
    expect(res.aggregated[0]?.source).toBe('anysearch');
  });
});
