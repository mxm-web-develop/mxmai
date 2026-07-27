import type {
  DeepSearchRequest,
  MultiDimensionSearchResult,
  DimensionSearchResult,
  SearchResultItem,
  SearchDimension,
  TopicType,
  ContentExtractResult,
} from './types';
import { SearchAggregator } from './aggregator';
import { ContentExtractor } from './content-extractor';
import { inferTopicType, TOPIC_CONFIGS } from './topic-router';
import { getDomainPresetsForTopic } from './domain-presets';

/**
 * 搜索服务
 * 提供统一的多维度深度搜索能力
 */
export class SearchService {
  private aggregator: SearchAggregator;
  private contentExtractor: ContentExtractor | null = null;

  constructor() {
    this.aggregator = new SearchAggregator();
  }

  /**
   * 自动路由搜索 - 根据主题类型自动选择最优 Provider 和深度
   */
  async autoSearch(
    request: DeepSearchRequest
  ): Promise<MultiDimensionSearchResult & { topicType: TopicType }> {
    const topicType = inferTopicType(request.query);
    const config = TOPIC_CONFIGS[topicType];

    const enrichedRequest: DeepSearchRequest = {
      ...request,
      dimensions: request.dimensions || config.defaultDimensions,
      depth: request.depth || config.recommendedDepth,
      includeDomains: request.includeDomains || getDomainPresetsForTopic(topicType),
    };

    const results = await this.deepSearch(enrichedRequest);
    return { ...results, topicType };
  }

  /**
   * 单维度搜索
   */
  async search(
    request: DeepSearchRequest,
    preferredProvider?: string
  ): Promise<DimensionSearchResult> {
    const dimension = request.dimensions?.[0] || 'general';
    const results = await this.aggregator.aggregate({
      ...request,
      dimensions: [dimension],
    });
    return results.dimensionResults[dimension]!;
  }

  /**
   * 多维度深度搜索
   */
  async deepSearch(request: DeepSearchRequest): Promise<MultiDimensionSearchResult> {
    return this.aggregator.aggregate(request);
  }

  /**
   * 快速搜索（单源）
   */
  async quickSearch(
    query: string,
    dimension: SearchDimension = 'general'
  ): Promise<SearchResultItem[]> {
    const results = await this.aggregator.aggregate({
      query,
      dimensions: [dimension],
      depth: 'quick',
      numResults: 5,
    });
    return results.aggregated.slice(0, 5);
  }

  /**
   * 深度搜索 + 内容提取
   */
  async deepSearchWithExtract(
    request: DeepSearchRequest
  ): Promise<MultiDimensionSearchResult & { extractedContent: ContentExtractResult[] }> {
    const searchResult = await this.deepSearch(request);

    if (!request.extractContent) {
      return { ...searchResult, extractedContent: [] };
    }

    if (!this.contentExtractor) {
      this.contentExtractor = new ContentExtractor();
    }

    const urlsToExtract = this.filterExtractTargets(
      searchResult.aggregated,
      request.extractDomains
    ).slice(0, request.maxExtractCount || 10);

    if (urlsToExtract.length === 0) {
      return { ...searchResult, extractedContent: [] };
    }

    const extractedContent = await this.contentExtractor.extract(
      urlsToExtract,
      request.extractPrompt
    );

    return { ...searchResult, extractedContent };
  }

  private filterExtractTargets(
    items: SearchResultItem[],
    domains?: string[]
  ): string[] {
    return items
      .filter((item) => {
        if (!domains || domains.length === 0) return true;
        return domains.some((d) => item.domain.includes(d));
      })
      .map((item) => item.url);
  }
}
