/**
 * 搜索引擎配置 Repository 接口
 */

export interface SearchScopeConfig {
  id: string;
  scope: string;
  task_key: string;  // provider name: brave, tavily, arxiv, serpapi, duckduckgo
  sub_type: string;  // dimension or 'default'
  provider: string;
  enabled: boolean;
  /** extra.api_keys: API key 数组，按顺序轮询使用 */
  extra: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface UpsertSearchScopeConfigDto {
  scope?: string;
  task_key: string;
  sub_type?: string;
  provider?: string;
  enabled?: boolean;
  extra?: Record<string, unknown>;
}

export interface ListSearchScopeConfigOptions {
  scope?: string;
  task_key?: string;
  limit?: number;
  offset?: number;
}

export interface ISearchScopeConfigRepository {
  /**
   * 查询配置：精确匹配 (scope, task_key, sub_type)
   */
  findConfig(scope: string, taskKey: string, subType: string): Promise<SearchScopeConfig | null>;

  /**
   * 查询某个 provider 的配置
   */
  findByProvider(provider: string): Promise<SearchScopeConfig | null>;

  /**
   * 插入或更新配置
   */
  upsertConfig(dto: UpsertSearchScopeConfigDto): Promise<SearchScopeConfig>;

  /**
   * 列出配置，支持按 scope/task_key 过滤
   */
  listConfigs(options?: ListSearchScopeConfigOptions): Promise<{ items: SearchScopeConfig[]; total: number }>;

  /**
   * 删除配置
   */
  deleteConfig(id: string): Promise<void>;
}
