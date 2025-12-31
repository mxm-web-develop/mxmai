/**
 * mxmcgi 客户端
 * 通过 Gateway 调用 mxmcgi 服务的文本生成接口
 */

export interface MXMCGIConfig {
  gatewayUrl: string; // Gateway 服务地址，如 http://localhost:3000
  apiKey?: string; // Bearer Token（可选，如果 Gateway 需要认证）
}

export interface MXMCGITextRequest {
  prompt: string;
  outputFormat?: 'stream' | 'json';
  parameters?: Record<string, any>;
}

export interface MXMCGITextResponse {
  success: boolean;
  model: string;
  result: {
    text?: string;
    stream?: AsyncIterable<{ chunk: string; status: string; collection: string }>;
  };
}

export interface MXMCGIImageRequest {
  prompt: string;
  parameters?: Record<string, any>;
}

export interface MXMCGIImageResponse {
  success: boolean;
  model: string;
  result: {
    image_urls?: string[];
    mediaUrls?: string[];
  };
}

/**
 * mxmcgi 客户端类
 */
export class MXMCGIClient {
  private config: MXMCGIConfig;

  constructor(config: MXMCGIConfig) {
    this.config = config;
  }

  /**
   * 从环境变量创建客户端
   */
  static fromEnv(): MXMCGIClient {
    const gatewayUrl = process.env.GATEWAY_URL || 'http://localhost:3000';
    const apiKey = process.env.GATEWAY_API_KEY; // 可选，如果需要认证

    return new MXMCGIClient({ gatewayUrl, apiKey });
  }

  /**
   * 调用文本生成接口（通过 Gateway）
   */
  async generateText(
    modelName: string,
    request: MXMCGITextRequest
  ): Promise<MXMCGITextResponse> {
    // 通过 Gateway 调用：/api/v1/cgi/text/:modelName
    const url = `${this.config.gatewayUrl}/api/v1/cgi/text/${modelName}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // 如果配置了 API Key，添加认证头
    if (this.config.apiKey) {
      // 如果 apiKey 已经包含 "Bearer " 前缀，直接使用；否则添加前缀
      const authHeader = this.config.apiKey.startsWith('Bearer ')
        ? this.config.apiKey
        : `Bearer ${this.config.apiKey}`;
      headers['Authorization'] = authHeader;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        prompt: request.prompt,
        outputFormat: request.outputFormat || 'json',
        parameters: request.parameters,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `mxmcgi 请求失败: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const data = (await response.json()) as MXMCGITextResponse;
    return data;
  }

  /**
   * 流式调用文本生成接口（通过 Gateway）
   */
  async *generateTextStream(
    modelName: string,
    request: MXMCGITextRequest
  ): AsyncGenerator<string, void, unknown> {
    // 通过 Gateway 调用：/api/v1/cgi/text/:modelName
    const url = `${this.config.gatewayUrl}/api/v1/cgi/text/${modelName}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // 如果配置了 API Key，添加认证头
    if (this.config.apiKey) {
      // 如果 apiKey 已经包含 "Bearer " 前缀，直接使用；否则添加前缀
      const authHeader = this.config.apiKey.startsWith('Bearer ')
        ? this.config.apiKey
        : `Bearer ${this.config.apiKey}`;
      headers['Authorization'] = authHeader;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        prompt: request.prompt,
        outputFormat: 'stream',
        parameters: request.parameters,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `mxmcgi 流式请求失败: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    if (!response.body) {
      throw new Error('无法读取响应流');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
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
              // 支持新格式：{ chunk, status, collection }
              if (parsed.chunk) {
                yield parsed.chunk;
              }
              // 兼容旧格式：{ text }
              else if (parsed.text) {
                yield parsed.text;
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * 调用图片生成接口（通过 Gateway）
   */
  async generateImage(
    modelName: string,
    request: MXMCGIImageRequest
  ): Promise<MXMCGIImageResponse> {
    // 通过 Gateway 调用：/api/v1/cgi/graph/:modelName
    const url = `${this.config.gatewayUrl}/api/v1/cgi/graph/${modelName}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // 如果配置了 API Key，添加认证头
    if (this.config.apiKey) {
      const authHeader = this.config.apiKey.startsWith('Bearer ')
        ? this.config.apiKey
        : `Bearer ${this.config.apiKey}`;
      headers['Authorization'] = authHeader;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        prompt: request.prompt,
        parameters: request.parameters,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `mxmcgi 图片生成请求失败: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const data = (await response.json()) as MXMCGIImageResponse;
    return data;
  }
}
