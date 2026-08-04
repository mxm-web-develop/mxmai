import type { SearchProvider } from './base';
import type {
  ProviderSearchRequest,
  DimensionSearchResult,
  SearchDimension,
} from '../types';
import {
  getSearchProviderConfig,
  isRateLimitSignal,
  listApiKeysInPriority,
  promoteApiKeyAndPersist,
} from '../search-config';

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
 *
 * 多 Key：按优先级从 [0] 起串试；遇 429/432 立刻换下一个，
 * 成功则将该 Key 置顶（内存 + 落库），后续请求优先用它。
 * 全部 Key 失败才把错误交给聚合器熔断。
 */
export class TavilySearchProvider implements SearchProvider {
  readonly name = 'tavily';
  readonly supportedDimensions: SearchDimension[] = ['general', 'news', 'academic', 'forum', 'finance'];

  async search(request: ProviderSearchRequest): Promise<DimensionSearchResult> {
    const { query, dimension, numResults, timeRange, language, includeDomains, startDate, endDate } =
      request;
    await getSearchProviderConfig('tavily');
    const keys = listApiKeysInPriority('tavily');
    if (keys.length === 0) {
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

    let lastError = '';
    for (let attempt = 0; attempt < keys.length; attempt++) {
      const apiKey = keys[attempt]!;

      try {
        const response = await fetch(TAVILY_BASE_URL, {
          method: 'POST',
          headers: tavilyAuthHeaders(apiKey),
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errText = await response.text().catch(() => '');
          const msg = `HTTP ${response.status} ${errText.slice(0, 200)}`;
          console.error(`[TavilySearch] API error: ${response.status}`, errText.slice(0, 200));
          lastError = msg;
          if (isRateLimitSignal(msg) && attempt + 1 < keys.length) {
            console.warn(
              `[TavilySearch] key#${attempt + 1}/${keys.length} 额度/限流，立即切换下一优先级 Key`
            );
            continue;
          }
          return this.createEmptyResult(dimension, query, msg);
        }

        const data = (await response.json()) as TavilySearchResponse;

        const items = (data.results || []).map((r: TavilyResult) => ({
          title: r.title,
          url: r.url,
          snippet: r.content,
          domain: this.extractDomain(r.url),
          publishedAt: r.published_date,
          dimension,
          source: this.name,
        }));

        // 非首位成功 → 置顶，后续请求优先该 Key
        if (attempt > 0) {
          console.info(
            `[TavilySearch] key#${attempt + 1}/${keys.length} 成功，提升为优先级第一`
          );
          promoteApiKeyAndPersist('tavily', apiKey);
        }

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
        lastError = error instanceof Error ? error.message : String(error);
        if (isRateLimitSignal(lastError) && attempt + 1 < keys.length) {
          console.warn(
            `[TavilySearch] key#${attempt + 1}/${keys.length} 异常且像限流，立即切换下一优先级 Key`
          );
          continue;
        }
        return this.createEmptyResult(dimension, query, lastError);
      }
    }

    return this.createEmptyResult(dimension, query, lastError || undefined);
  }

  async healthCheck(): Promise<boolean> {
    await getSearchProviderConfig('tavily');
    const keys = listApiKeysInPriority('tavily');
    if (keys.length === 0) return false;

    for (let i = 0; i < keys.length; i++) {
      const apiKey = keys[i]!;
      try {
        const response = await fetch(TAVILY_BASE_URL, {
          method: 'POST',
          headers: tavilyAuthHeaders(apiKey),
          body: JSON.stringify({ query: 'test', max_results: 1 }),
        });
        if (response.ok) {
          if (i > 0) promoteApiKeyAndPersist('tavily', apiKey);
          return true;
        }
        const errText = await response.text().catch(() => '');
        if (
          isRateLimitSignal(`HTTP ${response.status} ${errText}`) &&
          i + 1 < keys.length
        ) {
          continue;
        }
        return false;
      } catch {
        if (i + 1 < keys.length) continue;
        return false;
      }
    }
    return false;
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

  private createEmptyResult(
    dimension: SearchDimension,
    query: string,
    error?: string
  ): DimensionSearchResult {
    return {
      dimension,
      provider: this.name,
      items: [],
      total: 0,
      query,
      timestamp: new Date().toISOString(),
      ...(error ? { error } : {}),
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
