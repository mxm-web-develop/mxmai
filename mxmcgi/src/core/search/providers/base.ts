import type {
  ProviderSearchRequest,
  DimensionSearchResult,
  SearchDimension,
} from '../types';

export type { ProviderSearchRequest, DimensionSearchResult, SearchDimension };

/**
 * 搜索 Provider 接口
 * 所有搜索 provider（ Brave、Tavily、ArXiv 等）都需实现此接口
 */
export interface SearchProvider {
  /** Provider 名称 */
  readonly name: string;

  /** 支持的搜索维度 */
  readonly supportedDimensions: SearchDimension[];

  /** 执行搜索 */
  search(request: ProviderSearchRequest): Promise<DimensionSearchResult>;

  /** 健康检查 */
  healthCheck(): Promise<boolean>;
}
