/**
 * Provider 类型定义
 */

export type ProviderType = 'replicate' | 'ppio' | 'deer' | 'openai' | 'google' | 'anthropic' | 'qwen' | 'volc' | 'minimax';

export interface ModelConfig {
  provider?: ProviderType;
  [key: string]: any;
}

export type OutputFormat = 'stream' | 'json';

export interface GenerateParams {
  prompt: string;
  negativePrompt?: string;
  parameters?: Record<string, any>;
  outputFormat?: OutputFormat; // 'stream' 返回流式数据，'json' 返回完整 JSON
  enableCollection?: boolean; // 是否启用 collection 累积（默认 true），当为 false 时不会累积完整文本，节省内存
  enableProgress?: boolean; // 是否启用进度监控（默认 true，仅对图片模型有效），当为 false 时不提供进度流
  [key: string]: any;
}

export type StreamStatus = 'pending' | 'streaming' | 'completed' | 'error';

export type ProgressStatus = 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';

export interface StreamChunk {
  chunk: string; // 当前 chunk
  status: StreamStatus; // 当前状态
  collection: string; // 累积的所有 chunk
}

export interface ProgressEvent {
  status: ProgressStatus; // 预测状态
  progress?: number; // 进度百分比 (0-100)
  logs?: string[]; // 日志信息
  output?: any; // 部分输出（如果有）
  error?: string; // 错误信息（如果有）
}

export interface GenerateResult {
  mediaUrls: string[];
  metadata?: Record<string, any>;
  // 流式输出时，这是一个异步迭代器
  // 返回 StreamChunk 对象，包含 chunk、status 和 collection
  stream?: AsyncIterable<StreamChunk>;
  // 兼容旧版本：如果只需要字符串流，可以使用 streamString
  streamString?: AsyncIterable<string>;
  // 进度监控流（用于图片生成等需要等待的任务）
  progress?: AsyncIterable<ProgressEvent>;
}

/** Admin 监控：Provider 用量汇总（内部统计） */
export interface ProviderUsageSummary {
  provider: ProviderType;
  /** 可选：表示子服务（如多租户时） */
  service?: string;
  requestCount: number;
  successCount: number;
  errorRate: number;
  avgLatencyMs: number;
  window: string; // e.g. '1h', '24h'
}

/** Admin 监控：Provider 余额/用量（若官方 API 支持） */
export interface ProviderBillingInfo {
  provider: ProviderType;
  service?: string;
  supported: boolean;
  /** 总额度（若支持） */
  totalLimit?: string | number;
  /** 已用额度（若支持） */
  used?: string | number;
  /** 重置时间等说明 */
  resetAt?: string;
  raw?: Record<string, unknown>;
}

export interface ModelProvider {
  readonly provider: ProviderType;
  readonly name: string;
  
  /**
   * 检查该 provider 是否支持指定的模型
   */
  supportsModel(modelName: string): boolean;
  
  /**
   * 生成内容
   */
  generate(modelName: string, params: GenerateParams): Promise<GenerateResult>;
  
  /**
   * 可选：返回用量汇总（仅 admin 可查，来自内部统计）
   */
  getUsageSummary?(window: string): Promise<ProviderUsageSummary>;
  
  /**
   * 可选：返回余额/用量（仅 admin 可查，若官方 API 支持）
   */
  getBillingInfo?(): Promise<ProviderBillingInfo>;
}
