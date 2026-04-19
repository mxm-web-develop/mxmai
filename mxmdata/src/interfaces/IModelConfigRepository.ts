/**
 * Admin 模型配置 Repository 接口
 * 用于存储和读取 Agent Chat 使用的全局 LLM 模型配置
 */

export interface ModelConfig {
  id: string;
  model_key: string;
  temperature: number;
  max_tokens: number | null;
  top_p: number | null;
  frequency_penalty: number | null;
  presence_penalty: number | null;
  updated_at: Date;
}

export interface UpsertModelConfigDto {
  id?: string;
  model_key: string;
  temperature?: number;
  max_tokens?: number | null;
  top_p?: number | null;
  frequency_penalty?: number | null;
  presence_penalty?: number | null;
}

export interface IModelConfigRepository {
  /**
   * 获取当前生效的模型配置（id='default'）
   */
  getConfig(): Promise<ModelConfig>;

  /**
   * 更新模型配置（upsert id='default'）
   */
  upsertConfig(dto: UpsertModelConfigDto): Promise<ModelConfig>;
}
