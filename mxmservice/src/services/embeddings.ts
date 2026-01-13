/**
 * Embeddings 服务
 * 提供文本向量化功能
 */

import { Embeddings, EmbeddingsParams } from '@langchain/core/embeddings';

export interface EmbeddingsServiceConfig {
  modelName?: string;
  baseUrl: string;
  apiKey: string;
}

/**
 * Embeddings 服务接口
 */
export interface IEmbeddingsService {
  /**
   * 生成单个文本的向量
   */
  embedQuery(text: string): Promise<number[]>;

  /**
   * 批量生成文本向量
   */
  embedDocuments(texts: string[]): Promise<number[][]>;
}

/**
 * DeerAPI Embeddings 服务实现
 */
export class DeerAPIEmbeddingsService extends Embeddings implements IEmbeddingsService {
  private baseUrl: string;
  private apiKey: string;
  private modelName: string;

  constructor(config: EmbeddingsServiceConfig) {
    super({});
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
    this.modelName = config.modelName || 'text-embedding-3-small';
  }

  /**
   * 从环境变量创建实例
   */
  static fromEnv(modelName?: string): DeerAPIEmbeddingsService {
    const baseUrl = process.env.DEERAPI_BASE_URL;
    const apiKey = process.env.DEERAPI_API_KEY;

    if (!baseUrl || !apiKey) {
      throw new Error('DEERAPI_BASE_URL 和 DEERAPI_API_KEY 环境变量必须设置');
    }

    return new DeerAPIEmbeddingsService({
      baseUrl,
      apiKey,
      modelName,
    });
  }

  /**
   * 生成单个文本的向量
   */
  async embedQuery(text: string): Promise<number[]> {
    const response = await this.embeddings({ input: text });
    return response.data[0]?.embedding || [];
  }

  /**
   * 批量生成文本向量
   */
  async embedDocuments(texts: string[]): Promise<number[][]> {
    const response = await this.embeddings({ input: texts });
    return response.data.map(item => item.embedding);
  }

  /**
   * 调用 DeerAPI Embedding API
   */
  private async embeddings(request: { input: string | string[] }): Promise<{
    data: Array<{ embedding: number[]; index: number }>;
  }> {
    const url = `${this.baseUrl}/v1/embeddings`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.modelName,
        input: request.input,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DeerAPI Embedding 请求失败: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const result = await response.json();
    return result;
  }
}
