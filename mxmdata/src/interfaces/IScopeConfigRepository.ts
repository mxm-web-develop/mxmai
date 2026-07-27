/**
 * 通用业务模型路由配置 Repository 接口
 * 统一管理所有 scope 的路由表：graph / video / audio / music / writing
 */

export interface ScopeConfig {
  id: string;
  scope: string;
  task_key: string;
  sub_type: string;
  /** 物理模型 key（如 deepseek-v3.2），直接从 provider_models 映射 */
  model: string;
  provider: string;
  enabled: boolean;
  /** 收益 margin（e.g. 0.2 = 20%） */
  margin?: number;
  /** 计费方式：token_based / per_request / per_image 等 */
  charge_metric?: string;
  /** 单价（platform token） */
  price_in_tokens?: number;
  /** 最低计费 token 数 */
  min_charge_tokens?: number;
  /** 敏感词库 ID 列表 */
  sensitive_word_list_ids?: string[];
  created_at: string;
  updated_at: string;
}

export interface UpsertScopeConfigDto {
  scope: string;
  task_key: string;
  sub_type: string;
  /** text / writing 等 scope_config 表必填 */
  logical_model?: string;
  model?: string;
  provider?: string;
  enabled?: boolean;
  margin?: number;
  charge_metric?: string;
  price_in_tokens?: number;
  min_charge_tokens?: number;
  sensitive_word_list_ids?: string[];
}

export interface ListScopeConfigOptions {
  scope?: string;
  task_key?: string;
  limit?: number;
  offset?: number;
}

export interface IScopeConfigRepository {
  /**
   * 查询配置：精确匹配 (scope, task_key, sub_type)
   * 精确查不到时，fallback 查询 (scope, task_key, 'default')
   */
  findConfig(scope: string, taskKey: string, subType: string): Promise<ScopeConfig | null>;

  /** 插入或更新配置 */
  upsertConfig(dto: UpsertScopeConfigDto): Promise<ScopeConfig>;

  /** 列出配置，支持按 scope 过滤 */
  listConfigs(options?: ListScopeConfigOptions): Promise<{ items: ScopeConfig[]; total: number }>;
}
