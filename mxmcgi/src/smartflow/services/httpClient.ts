/**
 * HTTP 客户端 - mxmcgi 内部服务调用
 *
 * 包含两大类方法：
 * 1. CGI 方法（text/image/embedding）- 保留用于兼容
 * 2. Business v2 方法 - 统一的 /api/v2/tasks 动态业务路由
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

  // ==================== CGI 兼容方法（保留） ====================
  async textGeneration(model: string, prompt: string, params: Record<string, any> = {}): Promise<any> {
    return this.request(`/cgi/text/${model}`, {
      method: 'POST',
      body: { prompt, ...params },
    });
  }

  async imageGeneration(model: string, prompt: string, params: Record<string, any> = {}): Promise<any> {
    return this.request(`/cgi/image/${model}`, {
      method: 'POST',
      body: { prompt, ...params },
    });
  }

  async embeddingGeneration(model: string, input: string, params: Record<string, any> = {}): Promise<any> {
    return this.request(`/cgi/embedding/${model}`, {
      method: 'POST',
      body: { input, ...params },
    });
  }

  // ==================== Business v2 方法 ====================
  // 统一的动态业务架构：scope + taskKey + subtype + params

  /**
   * GET /api/v2/tasks/form-config/list?scope=xxx
   * 获取指定 scope 下所有 taskKey 列表
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
   * 获取指定业务的表单配置（用于前端渲染参数表单）
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
   * 执行动态业务任务（business 节点统一调用此方法）
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

  // ==================== Legacy Business 方法（保留兼容） ====================
  // 以下方法保留用于旧版兼容，新开发应使用 runTask v2 方法

  async writingCompletion(
    modelName: string,
    params: {
      prompt?: string;
      title?: string;
      content?: string;
      [key: string]: any;
    },
    userId: string
  ): Promise<any> {
    return this.request(`/writing/completion/${modelName}`, {
      method: 'POST',
      headers: { 'X-User-Id': userId },
      body: params,
    });
  }

  async writingOutline(
    params: {
      title: string;
      type?: string;
      [key: string]: any;
    },
    userId: string
  ): Promise<any> {
    return this.request('/writing/outline', {
      method: 'POST',
      headers: { 'X-User-Id': userId },
      body: params,
    });
  }

  async writingGenerate(
    params: {
      title?: string;
      type?: string;
      content?: string;
      [key: string]: any;
    },
    userId: string
  ): Promise<any> {
    return this.request('/writing/generate', {
      method: 'POST',
      headers: { 'X-User-Id': userId },
      body: params,
    });
  }

  async graphPhotograph(
    params: {
      prompt: string;
      style?: string;
      [key: string]: any;
    },
    userId: string
  ): Promise<any> {
    return this.request('/graph/photograph', {
      method: 'POST',
      headers: { 'X-User-Id': userId },
      body: params,
    });
  }

  async graphDesign(
    params: {
      prompt: string;
      style?: string;
      [key: string]: any;
    },
    userId: string
  ): Promise<any> {
    return this.request('/graph/design', {
      method: 'POST',
      headers: { 'X-User-Id': userId },
      body: params,
    });
  }

  async graphPainting(
    params: {
      prompt: string;
      style?: string;
      [key: string]: any;
    },
    userId: string
  ): Promise<any> {
    return this.request('/graph/painting', {
      method: 'POST',
      headers: { 'X-User-Id': userId },
      body: params,
    });
  }

  async graphImage(
    modelName: string,
    params: {
      prompt: string;
      aspect_ratio?: string;
      quality?: string;
      [key: string]: any;
    },
    userId: string
  ): Promise<any> {
    return this.request(`/graph/${modelName}`, {
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

  // ==================== 上传方法 ====================

  /**
   * 上传 base64 图片到 R2
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

// 导出单例
export const mxmCGIHttpClient = new MxmCGIHttpClient();
