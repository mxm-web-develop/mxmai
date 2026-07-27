import type { SearchProvider } from './base';
import type {
  ProviderSearchRequest,
  DimensionSearchResult,
  SearchDimension,
} from '../types';
import { getSearchProviderConfig, getCurrentApiKey } from '../search-config';

const TAVILY_BASE_URL = 'https://api.tavily.com/search';

function tavilyAuthHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
}

/**
 * Tavily AI Search Provider
 * 专为 AI 设计，返回结构化 JSON
 * 免费额度：1000次/天
 * 支持维度：general, news, academic, forum
 */
export class TavilySearchProvider implements SearchProvider {
  readonly name = 'tavily';
  readonly supportedDimensions: SearchDimension[] = ['general', 'news', 'academic', 'forum', 'finance'];

  async search(request: ProviderSearchRequest): Promise<DimensionSearchResult> {
    const { query, dimension, numResults, timeRange, language, includeDomains, startDate, endDate } =
      request;
    await getSearchProviderConfig('tavily');
    const apiKey = getCurrentApiKey('tavily');

    if (!apiKey) {
      console.warn('[TavilySearch] API key not configured, returning empty results');
      return this.createEmptyResult(dimension, query);
    }

    const body: Record<string, unknown> = {
      query,
      max_results: numResults || 10,
      include_answer: true,
      include_raw_content: false,
      include_images: false,
    };

    // Tavily topic filtering
    if (dimension === 'academic') {
      body.topic = 'science';
    } else if (dimension === 'news') {
      body.topic = 'news';
    } else if (dimension === 'finance') {
      body.topic = 'finance';
    }

    if (includeDomains && includeDomains.length > 0) {
      body.include_domains = includeDomains.slice(0, 50);
    }

    // 绝对日期窗优先（日报按日历日）；勿与 time_range/days 混用
    const start = typeof startDate === 'string' ? startDate.trim() : '';
    const end = typeof endDate === 'string' ? endDate.trim() : '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(start) || /^\d{4}-\d{2}-\d{2}$/.test(end)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(start)) body.start_date = start;
      if (/^\d{4}-\d{2}-\d{2}$/.test(end)) body.end_date = end;
    } else if (timeRange) {
      body.days = this.timeRangeToDays(timeRange);
    }

    // Language
    if (language && language !== 'all') {
      body.language = language === 'zh' || language === 'zh-TW' ? 'chinese' : 'english';
    }

    try {
      const response = await fetch(TAVILY_BASE_URL, {
        method: 'POST',
        headers: tavilyAuthHeaders(apiKey),
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        console.error(`[TavilySearch] API error: ${response.status}`, errText.slice(0, 200));
        return this.createEmptyResult(dimension, query);
      }

      const data = await response.json() as TavilySearchResponse;

      const items = (data.results || []).map((r: TavilyResult) => ({
        title: r.title,
        url: r.url,
        snippet: r.content,
        domain: this.extractDomain(r.url),
        publishedAt: r.published_date,
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
      console.error('[TavilySearch] Search failed:', error);
      return this.createEmptyResult(dimension, query);
    }
  }

  async healthCheck(): Promise<boolean> {
    await getSearchProviderConfig('tavily');
    const apiKey = getCurrentApiKey('tavily');
    if (!apiKey) return false;

    try {
      const response = await fetch(TAVILY_BASE_URL, {
        method: 'POST',
        headers: tavilyAuthHeaders(apiKey),
        body: JSON.stringify({ query: 'test', max_results: 1 }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private timeRangeToDays(range: string): number {
    const map: Record<string, number> = { day: 1, week: 7, month: 30, year: 365 };
    return map[range] || 7;
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

interface TavilySearchResponse {
  results?: TavilyResult[];
  answer?: string;
}

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  published_date?: string;
}
