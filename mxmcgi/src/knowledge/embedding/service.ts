/**
 * Embedding 服务
 * 提供统一的 embedding 接口，内部使用 EmbeddingProviderFactory 管理多个 provider
 */

import {
  embeddingProviderFactory,
  type EmbeddingRequest,
  type EmbeddingResponse,
  type EmbeddingProviderType,
} from './factory';

export class EmbeddingService {
  private defaultModel: string;
  private defaultProvider?: EmbeddingProviderType;

  constructor(model?: string, provider?: EmbeddingProviderType) {
    this.defaultModel = model || process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
    this.defaultProvider = provider;
  }

  /**
   * 从环境变量创建服务实例
   */
  static fromEnv(model?: string, provider?: EmbeddingProviderType): EmbeddingService {
    return new EmbeddingService(model, provider);
  }

  /**
   * 生成单个文本的 embedding
   */
  async embedQuery(
    text: string,
    model?: string,
    provider?: EmbeddingProviderType,
    dimensions?: number
  ): Promise<number[]> {
    const response = await this.embed([text], model, provider, dimensions);
    return response.data[0].embedding;
  }

  /**
   * 批量生成 embedding
   */
  async embed(
    input: string | string[],
    model?: string,
    provider?: EmbeddingProviderType,
    dimensions?: number
  ): Promise<EmbeddingResponse> {
    return await embeddingProviderFactory.embed(
      {
        input: input,
        model: model || this.defaultModel,
        dimensions: dimensions,
      },
      provider || this.defaultProvider
    );
  }

  /**
   * 批量生成 embedding（处理大量文本）
   * 自动分批处理，避免超出 API 限制
   */
  async embedBatch(
    texts: string[],
    batchSize: number = 100,
    model?: string,
    provider?: EmbeddingProviderType,
    dimensions?: number
  ): Promise<number[][]> {
    const results: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const response = await this.embed(batch, model, provider, dimensions);
      results.push(...response.data.map((item) => item.embedding));
    }

    return results;
  }
}

