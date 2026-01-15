/**
 * DeerAPI Embedding Provider
 * 调用 DeerAPI 的 embeddings 接口
 */

import type {
  EmbeddingProvider,
  EmbeddingRequest,
  EmbeddingResponse,
  EmbeddingProviderType,
} from '../types';
import { DeerAPIClient } from '../../../utils/deerapi-client';

export class DeerEmbeddingProvider implements EmbeddingProvider {
  readonly provider: EmbeddingProviderType = 'deer';
  readonly name = 'DeerAPI Embedding';

  private client: DeerAPIClient;
  private defaultModel: string;

  // 支持的模型列表
  private readonly supportedModels: string[] = [
    'text-embedding-3-small',
    'text-embedding-3-large',
  ];

  constructor(client?: DeerAPIClient, defaultModel?: string) {
    this.client = client || DeerAPIClient.fromEnv();
    this.defaultModel = defaultModel || process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
  }

  /**
   * 从环境变量创建 provider 实例
   */
  static fromEnv(model?: string): DeerEmbeddingProvider {
    return new DeerEmbeddingProvider(undefined, model);
  }

  supportsModel(modelName: string): boolean {
    return this.supportedModels.includes(modelName);
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    try {
      const result = await this.client.embeddings({
        input: request.input,
        model: request.model || this.defaultModel,
        dimensions: request.dimensions, // 支持降维参数
      });

      return result as EmbeddingResponse;
    } catch (error) {
      throw new Error(
        `DeerAPI Embedding 请求失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

