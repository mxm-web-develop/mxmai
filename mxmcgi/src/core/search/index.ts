// Types
export type {
  SearchDimension,
  SearchDepth,
  TopicType,
  SearchResultItem,
  DimensionSearchResult,
  DeepSearchRequest,
  MultiDimensionSearchResult,
  ContentExtractResult,
  ProviderSearchRequest,
  TopicConfig,
} from './types';

// Services
export { SearchService } from './search-service';
export { SearchAggregator } from './aggregator';
export { ContentExtractor } from './content-extractor';

// Providers
export { BraveSearchProvider } from './providers/brave';
export { TavilySearchProvider } from './providers/tavily';
export { AnysearchSearchProvider } from './providers/anysearch';
export { ArxivSearchProvider } from './providers/arxiv';
export { BochaSearchProvider } from './providers/bocha';
export type { SearchProvider } from './providers/base';

// Utilities
export { inferTopicType, TOPIC_CONFIGS } from './topic-router';
export { DOMAIN_PRESETS, getDomainPresetsForTopic } from './domain-presets';
export { DEPTH_CONFIGS } from './depth-config';
export {
  PROVIDER_BASE_SCORE,
  isOfficialDomain,
  isAuthoritativeSource,
} from './score-weights';

// Config
export {
  getSearchProviderConfig,
  getAllSearchProviderConfigs,
  clearSearchConfigCache,
  saveSearchProviderConfig,
} from './search-config';
