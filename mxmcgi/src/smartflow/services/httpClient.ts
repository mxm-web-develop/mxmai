/**
 * HTTP 客户端 - mxmcgi 内部服务调用
 *
 * Task V2：/api/v2/tasks/form-config、/api/v2/tasks/run
 * 裸 LLM：POST /writing/completion/:modelName（Smartflow model 节点 text / embedding）
 * 音/视频：/video/generate、/audio、/audio/music
 */

const MXMCGI_URL = process.env.MXMCGI_URL || 'http://localhost:4003';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
}

export class MxmCGIHttpClient {
  private baseUrl: string;

  constructor(baseUrl: string = MXMCGI_URL) {
    this.baseUrl = baseUrl;
  }

  private async request<T = any>(path: string, options: RequestOptions = {}): Promise<T> {
    const { method = 'GET', headers = {}, body, timeout = 60000 } = options;

    const url = `${this.baseUrl}${path}`;

    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method,
        headers: requestHeaders,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      return (await response.json()) as T;
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout}ms`);
      }
      throw error;
    }
  }

  /**
   * GET /api/v2/tasks/form-config/list?scope=xxx
   */
  async listFormConfigs(scope: string): Promise<{
    success: boolean;
    data?: {
      scope: string;
      items: Array<{
        taskKey: string;
        name?: string;
        subtypes?: string[];
      }>;
    };
  }> {
    return this.request(`/api/v2/tasks/form-config/list?scope=${encodeURIComponent(scope)}`, {
      method: 'GET',
    });
  }

  /**
   * GET /api/v2/tasks/form-config?scope=xxx&taskKey=yyy&subtype=zzz
   */
  async getFormConfig(
    scope: string,
    taskKey: string,
    subtype?: string | null
  ): Promise<{
    success: boolean;
    data?: {
      scope: string;
      taskKey: string;
      subtype?: string | null;
      schema?: Record<string, any>;
      uiSchema?: Record<string, any> | null;
    };
  }> {
    const params = new URLSearchParams({ scope, taskKey });
    if (subtype) params.set('subtype', subtype);
    return this.request(`/api/v2/tasks/form-config?${params.toString()}`, {
      method: 'GET',
    });
  }

  /**
   * POST /api/v2/tasks/run
   */
  async runTask(
    scope: string,
    taskKey: string,
    params: Record<string, any>,
    userId: string,
    options?: {
      subtype?: string | null;
      conversationId?: string;
    }
  ): Promise<any> {
    return this.request(`/api/v2/tasks/run`, {
      method: 'POST',
      headers: {
        'X-User-Id': userId,
        ...(options?.conversationId ? { 'X-Conversation-Id': options.conversationId } : {}),
      },
      body: {
        scope,
        taskKey,
        subtype: options?.subtype ?? null,
        params,
      },
    });
  }

  /**
   * POST /writing/completion/:modelName — 按模型名直接调 LLM（text / 部分 embedding 模型）
   */
  async writingCompletion(
    modelName: string,
    params: {
      prompt?: string;
      input?: string;
      title?: string;
      content?: string;
      [key: string]: any;
    },
    userId: string
  ): Promise<any> {
    return this.request(`/writing/completion/${encodeURIComponent(modelName)}`, {
      method: 'POST',
      headers: { 'X-User-Id': userId },
      body: params,
    });
  }

  async videoGenerate(
    params: {
      prompt: string;
      duration?: number;
      model?: string;
      [key: string]: any;
    },
    userId: string
  ): Promise<any> {
    return this.request('/video/generate', {
      method: 'POST',
      headers: { 'X-User-Id': userId },
      body: params,
    });
  }

  async audioTTS(
    params: {
      text: string;
      voice?: string;
      speed?: number;
      [key: string]: any;
    },
    userId: string
  ): Promise<any> {
    return this.request('/audio', {
      method: 'POST',
      headers: { 'X-User-Id': userId },
      body: params,
    });
  }

  async audioMusic(
    params: {
      prompt: string;
      duration?: number;
      [key: string]: any;
    },
    userId: string
  ): Promise<any> {
    return this.request('/audio/music', {
      method: 'POST',
      headers: { 'X-User-Id': userId },
      body: params,
    });
  }

  /**
   * POST /upload/r2-reference
   */
  async uploadR2Reference(
    base64: string,
    options?: {
      contentType?: string;
      originalName?: string;
      tag?: string;
    }
  ): Promise<{ url: string; key: string }> {
    return this.request('/upload/r2-reference', {
      method: 'POST',
      headers: {
        'X-User-Id': 'system',
      },
      body: {
        base64,
        ...options,
      },
    });
  }
}

export const mxmCGIHttpClient = new MxmCGIHttpClient();
