/**
 * Embedding Provider 类型定义
 */

export type EmbeddingProviderType = 'deer' | 'openai' | 'azure' | 'custom';

export interface EmbeddingRequest {
  input: string | string[];
  model?: string;
}

export interface EmbeddingResponse {
  data: Array<{
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

/**
 * Embedding Provider 接口
 * 所有 embedding provider 必须实现此接口
 */
export interface EmbeddingProvider {
  readonly provider: EmbeddingProviderType;
  readonly name: string;

  /**
   * 检查该 provider 是否支持指定的模型
   */
  supportsModel(modelName: string): boolean;

  /**
   * 生成 embedding
   */
  embed(request: EmbeddingRequest): Promise<EmbeddingResponse>;
}

