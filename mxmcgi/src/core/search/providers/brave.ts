import type { SearchProvider } from './base';
import type {
  ProviderSearchRequest,
  DimensionSearchResult,
  SearchDimension,
} from '../types';
import { getCurrentApiKey } from '../search-config';

const BRAVE_BASE_URL = 'https://api.search.brave.com/res/v1';

/**
 * Brave Search Provider
 * 免费额度：2500次/天
 * 支持维度：general, news, social
 */
export class BraveSearchProvider implements SearchProvider {
  readonly name = 'brave';
  readonly supportedDimensions: SearchDimension[] = ['general', 'news', 'social'];

  async search(request: ProviderSearchRequest): Promise<DimensionSearchResult> {
    const { query, dimension, numResults, timeRange } = request;
    const apiKey = getCurrentApiKey('brave');

    if (!apiKey) {
      console.warn('[BraveSearch] API key not configured, returning empty results');
      return this.createEmptyResult(dimension, query);
    }

    const params = new URLSearchParams({
      q: query,
      count: String(numResults || 10),
    });

    // Brave News filter
    if (dimension === 'news') {
      params.set('filter', 'news');
    }

    // Time range
    if (timeRange) {
      const braveDays: Record<string, string> = {
        day: 'd',
        week: 'w',
        month: 'm',
        year: 'y',
      };
      params.set('freshness', braveDays[timeRange] || 'w');
    }

    try {
      const response = await fetch(`${BRAVE_BASE_URL}/search?${params}`, {
        headers: {
          'X-Subscription-Token': apiKey,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        console.error(`[BraveSearch] API error: ${response.status}`);
        return this.createEmptyResult(dimension, query);
      }

      const data = await response.json() as BraveSearchResponse;

      const items = (data.web?.results || []).map((r: BraveResult) => ({
        title: r.title,
        url: r.url,
        snippet: r.description,
        domain: this.extractDomain(r.url),
        publishedAt: r.age,
        dimension,
        source: this.name,
      }));

      return {
        dimension,
        provider: this.name,
        items,
        total: items.length,
        query,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('[BraveSearch] Search failed:', error);
      return this.createEmptyResult(dimension, query);
    }
  }

  async healthCheck(): Promise<boolean> {
    const apiKey = getCurrentApiKey('brave');
    if (!apiKey) return false;

    try {
      const response = await fetch(
        `${BRAVE_BASE_URL}/search?q=test&count=1`,
        {
          headers: {
            'X-Subscription-Token': apiKey,
            Accept: 'application/json',
          },
        }
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }

  private createEmptyResult(dimension: SearchDimension, query: string): DimensionSearchResult {
    return {
      dimension,
      provider: this.name,
      items: [],
      total: 0,
      query,
      timestamp: new Date().toISOString(),
    };
  }
}

interface BraveSearchResponse {
  web?: {
    results?: BraveResult[];
  };
}

interface BraveResult {
  title: string;
  url: string;
  description: string;
  age?: string;
}
