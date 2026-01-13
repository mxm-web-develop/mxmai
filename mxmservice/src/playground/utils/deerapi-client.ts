/**
 * DeerAPI 客户端
 * 用于调用 DeerAPI 提供的 LLM 服务
 */

export interface DeerAPIConfig {
  baseUrl: string;
  apiKey: string;
}

export interface DeerAPIChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface DeerAPIChatRequest {
  model?: string;
  messages: DeerAPIChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

export interface DeerAPIChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface DeerAPIEmbeddingRequest {
  input: string | string[];
  model?: string;
}

export interface DeerAPIEmbeddingResponse {
  object: string;
  data: Array<{
    object: string;
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
 * DeerAPI 客户端类
 */
export class DeerAPIClient {
  private config: DeerAPIConfig;

  constructor(config: DeerAPIConfig) {
    this.config = config;
  }

  /**
   * 从环境变量创建客户端
   */
  static fromEnv(): DeerAPIClient {
    const baseUrl = process.env.DEERAPI_BASE_URL;
    const apiKey = process.env.DEERAPI_API_KEY;

    if (!baseUrl || !apiKey) {
      throw new Error('DEERAPI_BASE_URL 和 DEERAPI_API_KEY 环境变量必须设置');
    }

    return new DeerAPIClient({ baseUrl, apiKey });
  }

  /**
   * 调用聊天 API
   */
  async chat(request: DeerAPIChatRequest): Promise<DeerAPIChatResponse> {
    const url = `${this.config.baseUrl}/v1/chat/completions`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model || 'gpt-4o-mini',
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.max_tokens,
        stream: request.stream ?? false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DeerAPI 请求失败: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return await response.json();
  }

  /**
   * 流式调用聊天 API
   */
  async *chatStream(request: DeerAPIChatRequest): AsyncGenerator<string, void, unknown> {
    const url = `${this.config.baseUrl}/v1/chat/completions`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model || 'gpt-4o-mini',
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.max_tokens,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DeerAPI 流式请求失败: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('无法读取响应流');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              yield content;
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    }
  }

  /**
   * 调用 Embedding API
   */
  async embeddings(request: DeerAPIEmbeddingRequest): Promise<DeerAPIEmbeddingResponse> {
    const url = `${this.config.baseUrl}/v1/embeddings`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model || 'text-embedding-3-small',
        input: request.input,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DeerAPI Embedding 请求失败: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return await response.json();
  }
}

