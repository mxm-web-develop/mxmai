import type { SearchProvider } from './base';
import type {
  ProviderSearchRequest,
  DimensionSearchResult,
  SearchDimension,
} from '../types';
import { getCurrentApiKey } from '../search-config';

const BING_API_URL = 'https://api.bing.microsoft.com/v7.0/search';

/**
 * Bing Search Provider
 * 微软必应搜索，国内可访问
 * 需要 API Key
 * 支持维度：general, news
 */
export class BingSearchProvider implements SearchProvider {
  readonly name = 'bing';
  readonly supportedDimensions: SearchDimension[] = ['general', 'news'];

  async search(request: ProviderSearchRequest): Promise<DimensionSearchResult> {
    const { query, numResults, language } = request;

    try {
      const apiKey = this.getApiKey();
      if (!apiKey) {
        console.warn('[BingSearch] No API key configured');
        return this.createEmptyResult(query);
      }

      const params = new URLSearchParams({
        q: query,
        count: String(numResults || 10),
        mkt: language === 'zh' || query.includes('中文') ? 'zh-CN' : 'en-US',
        safeSearch: 'Moderate',
      });

      const response = await fetch(`${BING_API_URL}?${params}`, {
        headers: {
          'Ocp-Apim-Subscription-Key': apiKey,
        },
      });

      if (!response.ok) {
        console.error(`[BingSearch] API error: ${response.status}`);
        return this.createEmptyResult(query, `HTTP ${response.status}`);
      }

      const data = await response.json() as {
        webPages?: {
          value?: Array<{
            name: string;
            url: string;
            snippet: string;
            datePublished?: string;
          }>;
        };
      };

      const items = (data.webPages?.value || []).map((item) => ({
        title: item.name || '',
        url: item.url || '',
        snippet: item.snippet || '',
        domain: this.extractDomain(item.url || ''),
        publishedAt: item.datePublished,
        source: this.name,
      }));

      return {
        dimension: 'general',
        provider: this.name,
        items,
        total: items.length,
        query,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('[BingSearch] Search failed:', error);
      const msg = error instanceof Error ? error.message : String(error);
      return this.createEmptyResult(query, msg);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const apiKey = this.getApiKey();
      if (!apiKey) return false;

      const response = await fetch(`${BING_API_URL}?q=test&count=1`, {
        headers: {
          'Ocp-Apim-Subscription-Key': apiKey,
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private getApiKey(): string | undefined {
    // 从数据库配置获取 API Key
    return getCurrentApiKey('bing');
  }

  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }

  private createEmptyResult(query: string, error?: string): DimensionSearchResult {
    return {
      dimension: 'general',
      provider: this.name,
      items: [],
      total: 0,
      query,
      timestamp: new Date().toISOString(),
      ...(error ? { error } : {}),
    };
  }
}
