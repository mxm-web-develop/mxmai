import type { SearchProvider } from './base';
import type {
  ProviderSearchRequest,
  DimensionSearchResult,
  SearchDimension,
} from '../types';
import { getCurrentApiKey } from '../search-config';

const BOCHA_API_URL = 'https://api.bochaai.com/v1/web-search';

/**
 * 博查AI搜索 Provider
 * 国内可用，专门为 AI 设计
 * 需要 API Key
 * 支持维度：general, news, academic, forum
 */
export class BochaSearchProvider implements SearchProvider {
  readonly name = 'bocha';
  readonly supportedDimensions: SearchDimension[] = ['general', 'news', 'academic', 'forum'];

  async search(request: ProviderSearchRequest): Promise<DimensionSearchResult> {
    const { query, numResults, language } = request;

    try {
      const apiKey = this.getApiKey();
      if (!apiKey) {
        console.warn('[BochaSearch] No API key configured');
        return this.createEmptyResult(query);
      }

      const response = await fetch(BOCHA_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          query,
          count: numResults || 10,
          summary: true,
          freshness: 'oneYear',
        }),
      });

      if (!response.ok) {
        console.error(`[BochaSearch] API error: ${response.status}`);
        return this.createEmptyResult(query);
      }

      const data = await response.json() as {
        code?: number;
        message?: string;
        data?: {
          webResults?: Array<{
            title: string;
            url: string;
            snippet: string;
            site?: string;
            date?: string;
          }>;
        };
      };

      if (data.code !== 0 || !data.data?.webResults) {
        console.error('[BochaSearch] API returned error:', data.message);
        return this.createEmptyResult(query);
      }

      const items = (data.data.webResults || []).map((item) => ({
        title: item.title || '',
        url: item.url || '',
        snippet: item.snippet || '',
        domain: this.extractDomain(item.url || ''),
        publishedAt: item.date,
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
      console.error('[BochaSearch] Search failed:', error);
      return this.createEmptyResult(query);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const apiKey = this.getApiKey();
      if (!apiKey) return false;

      const response = await fetch(BOCHA_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          query: 'test',
          count: 1,
        }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private getApiKey(): string | undefined {
    // 从数据库配置获取 API Key
    return getCurrentApiKey('bocha');
  }

  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }

  private createEmptyResult(query: string): DimensionSearchResult {
    return {
      dimension: 'general',
      provider: this.name,
      items: [],
      total: 0,
      query,
      timestamp: new Date().toISOString(),
    };
  }
}
