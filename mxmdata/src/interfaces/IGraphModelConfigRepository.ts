/**
 * Graph 业务模型配置 Repository 接口
 * 按 (scope, graph_type, sub_type) 选择逻辑模型名
 */

export interface GraphModelConfig {
  id: string;
  scope: string;
  graph_type: string;
  sub_type: string;
  logical_model: string;
  provider: string;
  enabled: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export interface UpsertGraphModelConfigDto {
  scope: string;
  graph_type: string;
  sub_type: string;
  logical_model: string;
  provider?: string;
  enabled?: boolean;
}

export interface IGraphModelConfigRepository {
  /**
   * 获取指定业务 slot 的模型配置
   */
  findConfig(scope: string, graphType: string, subType: string): Promise<GraphModelConfig | null>;

  /**
   * 设置或更新指定 slot 的模型配置
   */
  upsertConfig(dto: UpsertGraphModelConfigDto): Promise<GraphModelConfig>;

  /**
   * 列出某个 scope 下的所有配置
   */
  listConfigs(scope?: string): Promise<GraphModelConfig[]>;
}

