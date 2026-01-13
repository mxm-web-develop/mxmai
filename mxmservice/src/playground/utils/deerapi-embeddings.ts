/**
 * DeerAPI LangChain Embeddings 适配器
 * 使 DeerAPI 可以像 OpenAI Embeddings 一样在 LangChain 中使用
 */

import { Embeddings, EmbeddingsParams } from '@langchain/core/embeddings';
import { DeerAPIClient } from './deerapi-client';

export interface DeerAPIEmbeddingsParams extends EmbeddingsParams {
  modelName?: string;
  baseUrl: string;
  apiKey: string;
}

/**
 * DeerAPI LangChain Embeddings 适配器
 */
export class DeerAPIEmbeddings extends Embeddings {
  private client: DeerAPIClient;
  private modelName: string;

  constructor(params: DeerAPIEmbeddingsParams) {
    super(params);
    this.client = new DeerAPIClient({
      baseUrl: params.baseUrl,
      apiKey: params.apiKey,
    });
    this.modelName = params.modelName || 'text-embedding-3-small';
  }

  /**
   * 从环境变量创建实例
   */
  static fromEnv(modelName?: string): DeerAPIEmbeddings {
    const baseUrl = process.env.DEERAPI_BASE_URL;
    const apiKey = process.env.DEERAPI_API_KEY;

    if (!baseUrl || !apiKey) {
      throw new Error('DEERAPI_BASE_URL 和 DEERAPI_API_KEY 环境变量必须设置');
    }

    return new DeerAPIEmbeddings({
      baseUrl,
      apiKey,
      modelName,
    });
  }

  /**
   * 生成单个文本的 Embedding
   */
  async embedQuery(text: string): Promise<number[]> {
    const response = await this.client.embeddings({
      input: text,
      model: this.modelName,
    });

    return response.data[0]?.embedding || [];
  }

  /**
   * 批量生成 Embeddings
   */
  async embedDocuments(texts: string[]): Promise<number[][]> {
    const response = await this.client.embeddings({
      input: texts,
      model: this.modelName,
    });

    return response.data.map(item => item.embedding);
  }
}

