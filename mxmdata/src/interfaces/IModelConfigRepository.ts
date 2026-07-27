/**
 * Admin 模型配置 Repository 接口
 * 用于存储和读取 Agent Chat 使用的全局 LLM 模型配置
 */

export interface AgentAllowedBusiness {
  scope: string;
  taskKey: string;
  subtype?: string | null;
}

export interface ModelConfig {
  id: string;
  model_key: string;
  provider: string | null;
  temperature: number;
  max_tokens: number | null;
  top_p: number | null;
  frequency_penalty: number | null;
  presence_penalty: number | null;
  max_loop_rounds: number;
  run_timeout_ms: number;
  system_prompt_extra: string | null;
  /** 对话空态欢迎语；null/空则前端用默认文案 */
  welcome_message: string | null;
  tools_enabled: boolean;
  /** null = 全部业务；[] = 禁止；非空 = 白名单 */
  allowed_businesses: AgentAllowedBusiness[] | null;
  smartflow_enabled: boolean;
  updated_at: Date;
}

export interface UpsertModelConfigDto {
  id?: string;
  model_key: string;
  provider?: string | null;
  temperature?: number;
  max_tokens?: number | null;
  top_p?: number | null;
  frequency_penalty?: number | null;
  presence_penalty?: number | null;
  max_loop_rounds?: number;
  run_timeout_ms?: number;
  system_prompt_extra?: string | null;
  welcome_message?: string | null;
  tools_enabled?: boolean;
  allowed_businesses?: AgentAllowedBusiness[] | null;
  smartflow_enabled?: boolean;
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
