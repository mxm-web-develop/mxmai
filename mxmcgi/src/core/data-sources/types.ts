/** 专业数据领域 */
export type DataDomain = 'legal' | 'finance' | 'stock' | 'crypto' | 'business';

/** 查询类型 */
export type DataSourceQueryType = 'search' | 'quote' | 'profile' | 'tvl' | 'auto';

export interface DataSourceProvenance {
  provider: string;
  domain: DataDomain;
  fetchedAt: string;
  confidence: 'high' | 'medium' | 'low';
  sourceUrl?: string;
}

export interface DataSourceRequest {
  query: string;
  domain?: DataDomain;
  queryType?: DataSourceQueryType;
  /** 股票/代币代码，如 AAPL、BTC */
  symbol?: string;
  limit?: number;
  extra?: Record<string, unknown>;
}

export interface DataSourceResult {
  domain: DataDomain;
  provider: string;
  query: string;
  summary: string;
  structuredData: unknown;
  provenance: DataSourceProvenance;
}

export interface DataSourceProviderConfig {
  name: string;
  enabled: boolean;
  apiKeys: string[];
  rateLimit?: number;
  extra?: Record<string, unknown>;
}

export interface CombinedDomainSearchResult {
  domain: DataDomain;
  webResults?: import('../search/types').SearchResultItem[];
  dataSource?: DataSourceResult;
  topicType?: import('../search/types').TopicType;
  timestamp: string;
}
