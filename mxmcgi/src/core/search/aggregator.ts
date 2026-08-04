import type {
  DeepSearchRequest,
  MultiDimensionSearchResult,
  DimensionSearchResult,
  SearchResultItem,
  SearchDimension,
  SearchDepth,
  ProviderSearchRequest,
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
import {
  isRateLimitSignal,
  isSearchProviderInCooldown,
  listUsableProvidersForDimension,
  markSearchProviderCooldown,
} from './search-config';

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
 * - 多维度并行
 * - 同维度按 fallback 链串试 Provider（失败/空结果/超时 → 下一个）
 * - 限流信号触发短时熔断
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

  registerProvider(name: string, provider: SearchProvider) {
    this.providers.set(name, provider);
  }

  getProvider(name: string): SearchProvider | undefined {
    return this.providers.get(name);
  }

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

    const searchArgsBase: Omit<ProviderSearchRequest, 'dimension'> = {
      query,
      numResults: perProvider,
      timeRange: request.timeRange,
      startDate: request.startDate,
      endDate: request.endDate,
      language: request.language,
      includeDomains: request.includeDomains,
    };

    const dimensionJobs = await Promise.all(
      selectedDimensions.map((dimension) =>
        this.searchDimensionWithFallback(dimension, searchArgsBase)
      )
    );

    const dimensionResultsArr = dimensionJobs.filter(
      (r): r is DimensionSearchResult => r != null
    );
    const dimensionResults: Partial<Record<SearchDimension, DimensionSearchResult>> = {};

    for (const result of dimensionResultsArr) {
      dimensionResults[result.dimension] = result;
    }

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
   * 按维度 fallback 链串试，直到拿到非空 items，或链耗尽。
   */
  private async searchDimensionWithFallback(
    dimension: SearchDimension,
    base: Omit<ProviderSearchRequest, 'dimension'>
  ): Promise<DimensionSearchResult | null> {
    const chain = await listUsableProvidersForDimension(dimension);
    const candidates = chain.filter((name) => {
      const p = this.providers.get(name);
      return Boolean(p && p.supportedDimensions.includes(dimension));
    });

    if (candidates.length === 0) {
      console.warn(`[SearchAggregator] ${dimension}: no usable provider in chain`);
      return null;
    }

    let last: DimensionSearchResult | null = null;

    for (let i = 0; i < candidates.length; i++) {
      const providerName = candidates[i]!;
      if (isSearchProviderInCooldown(providerName)) {
        console.warn(`[SearchAggregator] ${dimension}/${providerName}: skip (cooldown)`);
        continue;
      }

      const provider = this.providers.get(providerName);
      if (!provider) continue;

      try {
        const result = await this.executeWithTimeout(
          provider.search({ ...base, dimension }),
          dimension,
          base.query,
          providerName
        );

        this.maybeTripCircuit(providerName, result.error);

        if (result.items.length > 0) {
          if (i > 0) {
            console.info(
              `[SearchAggregator] ${dimension}: fallback hit via ${providerName} (tried ${i} before)`
            );
          }
          return result;
        }

        const reason = result.error || 'empty';
        console.warn(
          `[SearchAggregator] ${dimension}/${providerName}: ${reason}; try next (${i + 1}/${candidates.length})`
        );
        last = result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.maybeTripCircuit(providerName, msg);
        console.warn(
          `[SearchAggregator] ${dimension}/${providerName}: threw ${msg}; try next (${i + 1}/${candidates.length})`
        );
        last = this.createErrorResult(dimension, base.query, providerName, msg);
      }
    }

    return (
      last ??
      this.createErrorResult(dimension, base.query, candidates[0]!, 'all providers failed or empty')
    );
  }

  private maybeTripCircuit(providerName: string, signal: string | undefined): void {
    if (!signal) return;
    if (isRateLimitSignal(signal)) {
      markSearchProviderCooldown(providerName, signal);
    }
  }

  private async executeWithTimeout(
    promise: Promise<DimensionSearchResult>,
    dimension: SearchDimension,
    query: string,
    providerName: string,
    timeoutMs = 20000
  ): Promise<DimensionSearchResult> {
    type Race =
      | { kind: 'ok'; result: DimensionSearchResult }
      | { kind: 'timeout' };

    const raced = await Promise.race<Race>([
      promise.then((result) => ({ kind: 'ok' as const, result })),
      new Promise<Race>((resolve) => {
        setTimeout(() => resolve({ kind: 'timeout' }), timeoutMs);
      }),
    ]);

    if (raced.kind === 'timeout') {
      return this.createErrorResult(dimension, query, providerName, 'Timeout');
    }
    return raced.result;
  }

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

  private scoreResults(items: SearchResultItem[], query: string): SearchResultItem[] {
    return items
      .map((item) => ({
        ...item,
        score: this.calculateScore(item, query),
      }))
      .sort((a, b) => (b.score || 0) - (a.score || 0));
  }

  private calculateScore(item: SearchResultItem, query: string): number {
    let score = PROVIDER_BASE_SCORE[item.source] || 50;
    if (isOfficialDomain(item.domain)) score += 20;
    if (isAuthoritativeSource(item.domain)) score += 10;
    score += this.calculateRelevance(item.title, query) * 30;
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
      error,
    };
  }
}
