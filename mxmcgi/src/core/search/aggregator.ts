import type {
  DeepSearchRequest,
  MultiDimensionSearchResult,
  DimensionSearchResult,
  SearchResultItem,
  SearchDimension,
  SearchDepth,
} from './types';
import type { SearchProvider } from './providers/base';
import { BraveSearchProvider } from './providers/brave';
import { TavilySearchProvider } from './providers/tavily';
import { ArxivSearchProvider } from './providers/arxiv';
import { DuckDuckGoSearchProvider } from './providers/duckduckgo';
import { BingSearchProvider } from './providers/bing';
import { BochaSearchProvider } from './providers/bocha';
import { AnysearchSearchProvider } from './providers/anysearch';
import {
  PROVIDER_BASE_SCORE,
  isOfficialDomain,
  isAuthoritativeSource,
} from './score-weights';
import { resolveProviderForDimension } from './search-config';

const DEPTH_CONFIGS: Record<SearchDepth, { resultsPerProvider: number }> = {
  quick: { resultsPerProvider: 3 },
  standard: { resultsPerProvider: 5 },
  deep: { resultsPerProvider: 8 },
};

/** 单 Provider 单次请求上限（Tavily/Brave 等常见上限约 20） */
const PROVIDER_NUM_RESULTS_CAP = 20;

function resolveNumResultsPerProvider(
  depth: SearchDepth,
  requested: number | undefined,
  dimensionCount: number
): number {
  const base = DEPTH_CONFIGS[depth]?.resultsPerProvider ?? 5;
  if (requested == null || !Number.isFinite(requested) || requested <= 0) return base;
  const perDim = Math.ceil(requested / Math.max(1, dimensionCount));
  return Math.max(base, Math.min(PROVIDER_NUM_RESULTS_CAP, perDim));
}

/**
 * 多源搜索聚合器
 * 负责并行调用多个 Provider、去重、评分、排序
 */
export class SearchAggregator {
  private providers: Map<string, SearchProvider> = new Map();

  constructor() {
    this.registerDefaultProviders();
  }

  private registerDefaultProviders() {
    this.providers.set('brave', new BraveSearchProvider());
    this.providers.set('tavily', new TavilySearchProvider());
    this.providers.set('anysearch', new AnysearchSearchProvider());
    this.providers.set('arxiv', new ArxivSearchProvider());
    this.providers.set('duckduckgo', new DuckDuckGoSearchProvider());
    this.providers.set('bing', new BingSearchProvider());
    this.providers.set('bocha', new BochaSearchProvider());
  }

  /**
   * 注册自定义 Provider
   */
  registerProvider(name: string, provider: SearchProvider) {
    this.providers.set(name, provider);
  }

  /**
   * 获取已注册的 Provider
   */
  getProvider(name: string): SearchProvider | undefined {
    return this.providers.get(name);
  }

  /**
   * 聚合多维度搜索结果
   */
  async aggregate(request: DeepSearchRequest): Promise<MultiDimensionSearchResult> {
    const { query, dimensions = ['general'], depth = 'standard' } = request;

    const selectedDimensions = dimensions.includes('all')
      ? (['general', 'news', 'academic', 'forum', 'official'] as SearchDimension[])
      : dimensions;

    const perProvider = resolveNumResultsPerProvider(
      depth,
      request.numResults,
      selectedDimensions.length
    );

    const dimensionJobs = await Promise.all(
      selectedDimensions.map(async (dimension) => {
        const providerName = await resolveProviderForDimension(dimension);
        if (!providerName) return null;
        const provider = this.providers.get(providerName);
        if (!provider || !provider.supportedDimensions.includes(dimension)) return null;
        return this.executeWithTimeout(
          provider.search({
            query,
            dimension,
            numResults: perProvider,
            timeRange: request.timeRange,
            startDate: request.startDate,
            endDate: request.endDate,
            language: request.language,
            includeDomains: request.includeDomains,
          }),
          dimension,
          query
        ).catch((err) => this.createErrorResult(dimension, query, providerName, err.message));
      })
    );

    const dimensionResultsArr = dimensionJobs.filter(
      (r): r is DimensionSearchResult => r != null
    );
    const dimensionResults: Partial<Record<SearchDimension, DimensionSearchResult>> = {};

    for (const result of dimensionResultsArr) {
      dimensionResults[result.dimension] = result;
    }

    // 合并所有结果并去重
    const allItems = dimensionResultsArr.flatMap((r) => r.items);
    const deduplicated = this.deduplicate(allItems);
    const scored = this.scoreResults(deduplicated, query);

    return {
      dimensionResults,
      aggregated: scored,
      query,
      depth,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 执行带超时的搜索
   */
  private async executeWithTimeout(
    promise: Promise<DimensionSearchResult>,
    dimension: SearchDimension,
    query: string,
    timeoutMs = 20000
  ): Promise<DimensionSearchResult> {
    return Promise.race([
      promise,
      new Promise<DimensionSearchResult>((resolve) =>
        setTimeout(() => resolve(this.createErrorResult(dimension, query, 'Timeout')), timeoutMs)
      ),
    ]);
  }

  /**
   * 去重（基于 domain + title）
   */
  private deduplicate(items: SearchResultItem[]): SearchResultItem[] {
    const seen = new Set<string>();
    return items.filter((item) => {
      const key = this.normalizeKey(`${item.domain}|${item.title}`);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private normalizeKey(str: string): string {
    return str.toLowerCase().replace(/\s+/g, '').slice(0, 100);
  }

  /**
   * 评分算法
   */
  private scoreResults(
    items: SearchResultItem[],
    query: string
  ): SearchResultItem[] {
    return items
      .map((item) => ({
        ...item,
        score: this.calculateScore(item, query),
      }))
      .sort((a, b) => (b.score || 0) - (a.score || 0));
  }

  private calculateScore(item: SearchResultItem, query: string): number {
    let score = PROVIDER_BASE_SCORE[item.source] || 50;

    // 官方域名加分
    if (isOfficialDomain(item.domain)) score += 20;

    // 权威来源加分
    if (isAuthoritativeSource(item.domain)) score += 10;

    // 相关性评分（标题匹配度）
    score += this.calculateRelevance(item.title, query) * 30;

    // 新鲜度衰减
    if (item.publishedAt) {
      const age = this.daysSince(item.publishedAt);
      score -= age * 0.5;
    }

    return Math.max(0, Math.min(100, score));
  }

  private calculateRelevance(title: string, query: string): number {
    const lowerTitle = title.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const queryWords = lowerQuery.split(/\s+/).filter((w) => w.length > 1);
    if (queryWords.length === 0) return 0;

    const matchedWords = queryWords.filter((w) => lowerTitle.includes(w));
    return matchedWords.length / queryWords.length;
  }

  private daysSince(dateStr: string): number {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return 0;
    const now = new Date();
    return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  }

  private createErrorResult(
    dimension: SearchDimension,
    query: string,
    provider: string,
    error: string
  ): DimensionSearchResult {
    console.warn(`[SearchAggregator] ${dimension}/${provider} search failed: ${error}`);
    return {
      dimension,
      provider,
      items: [],
      total: 0,
      query,
      timestamp: new Date().toISOString(),
    };
  }
}
