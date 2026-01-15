/**
 * DeerAPI 客户端
 * 统一封装 DeerAPI 的 LLM 调用（chat-completions & Anthropic Messages）
 */

export interface DeerAPIConfig {
  baseUrl: string;
  apiKey: string;      // 直接使用密钥值，不需要 "Bearer " 前缀
  group?: string;      // 可选：令牌分组（如 default、官方原价等）
}

export interface DeerAPIChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// OpenAI chat/completions 兼容请求
export interface DeerAPIChatRequest {
  model?: string;
  messages: DeerAPIChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  // 其余参数（top_p、presence_penalty、frequency_penalty 等）透传即可
  [key: string]: any;
}

export interface DeerAPIChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: { role: string; content: string };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// Anthropic Messages API 响应（简化版）
export interface DeerAPIAnthropicMessage {
  id: string;
  type: string;
  role: string;
  model: string;
  content: Array<{ type: string; text: string }>;
  stop_reason: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

// Anthropic 流式事件（简化版）
export interface DeerAPIAnthropicStreamEvent {
  type: string;
  index?: number;
  delta?: { type: string; text: string };
  content_block?: { type: string; text: string };
  content_block_delta?: { type: string; text: string };
  stop_reason?: string;
  stop_sequence?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  [key: string]: any;
}

/**
 * 统一的视频任务状态结构
 * 兼容：
 * - 官方 Sora 查询接口：https://apidoc.deerapi.com/video/sora/official/list
 * - 自研 / 逆向 Sora 查询接口：https://apidoc.deerapi.com/sora%E9%80%86%E5%90%91%E6%9F%A5%E5%9B%9E-371242934e0
 */
export interface DeerVideoStatus {
  /** DeerAPI 返回的原始数据 */
  raw: any;
  /** 任务状态 */
  status: 'queued' | 'in_progress' | 'completed' | 'failed';
  /** 进度（0-100） */
  progress?: number;
  /** Deer 返回的视频 URL（如果有） */
  video_url?: string;
  /** 错误信息（如果有） */
  error?: {
    code?: string | null;
    message?: string;
    type?: string;
    [key: string]: any;
  } | null;
  /** 任务 ID（如果能解析出来） */
  id?: string;
  /** 模型 ID（如果能解析出来） */
  model?: string;
  /** 时长（字符串，单位秒） */
  seconds?: string;
  /** 分辨率 */
  size?: string;
}

export class DeerAPIClient {
  private config: DeerAPIConfig;

  constructor(config: DeerAPIConfig) {
    this.config = config;
  }

  static fromEnv(): DeerAPIClient {
    const baseUrl = process.env.DEERAPI_BASE_URL;
    const apiKey = process.env.DEERAPI_API_KEY;
    const group = process.env.DEERAPI_GROUP;

    if (!baseUrl || !apiKey) {
      throw new Error('DEERAPI_BASE_URL 和 DEERAPI_API_KEY 环境变量必须设置');
    }

    return new DeerAPIClient({ baseUrl, apiKey, group });
  }

  /**
   * 工具：构造 Authorization 头（DeerAPI 文档要求直接使用密钥值）
   */
  private getAuthHeader(): string {
    // DeerAPI 文档示例使用 "Bearer xxx"，但为了兼容已有配置：
    // - 如果环境变量中已经包含 "Bearer " 前缀，直接透传
    // - 否则自动补上 "Bearer "
    if (this.config.apiKey.startsWith('Bearer ')) {
      return this.config.apiKey;
    }
    return `Bearer ${this.config.apiKey}`;
  }

  /**
   * OpenAI embeddings 兼容接口
   * 参考文档：DeerAPI 支持 OpenAI 格式的 embeddings API
   */
  async embeddings(request: {
    input: string | string[];
    model?: string;
    dimensions?: number; // OpenAI 支持降维参数（仅 text-embedding-3-large 支持）
  }): Promise<{
    data: Array<{
      embedding: number[];
      index: number;
    }>;
    model: string;
    usage: {
      prompt_tokens: number;
      total_tokens: number;
    };
  }> {
    const url = `${this.config.baseUrl}/v1/embeddings`;

    const authHeader = this.getAuthHeader();

    const body: any = {
      input: request.input,
      model: request.model || 'text-embedding-3-small',
    };

    // 如果指定了 dimensions（仅 text-embedding-3-large 支持降维）
    if (request.dimensions !== undefined) {
      body.dimensions = request.dimensions;
    }

    // 如果配置了 group，添加到请求头或查询参数
    const headers: Record<string, string> = {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    };

    // DeerAPI 可能通过 header 或 query 参数传递 group
    if (this.config.group) {
      headers['X-Group'] = this.config.group;
    }

    const queryParams = this.config.group ? `?group=${encodeURIComponent(this.config.group)}` : '';
    const fullUrl = `${url}${queryParams}`;

    const response = await fetch(fullUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `DeerAPI Embeddings 请求失败: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    return (await response.json()) as {
      data: Array<{
        embedding: number[];
        index: number;
      }>;
      model: string;
      usage: {
        prompt_tokens: number;
        total_tokens: number;
      };
    };
  }

  /**
   * Suno 歌词生成：提交歌词任务
   *
   * 文档参考：https://api.deerapi.com/suno/submit/lyrics
   *
   * 请求：
   *   POST /suno/submit/lyrics
   *   Body: { prompt: string, notify_hook: string }
   *
   * 响应示例：
   *   { "code": "success", "data": "task-id", "message": "" }
   */
  async submitSunoLyrics(request: {
    prompt: string;
    notifyHook: string;
  }): Promise<{
    taskId: string;
    raw: any;
  }> {
    const url = `${this.config.baseUrl}/suno/submit/lyrics`;
    const authHeader = this.getAuthHeader();

    const body = {
      prompt: request.prompt,
      notify_hook: request.notifyHook,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const text = await response.text();

    if (!response.ok) {
      throw new Error(
        `DeerAPI Suno 歌词提交失败: ${response.status} ${response.statusText} - ${text}`,
      );
    }

    let data: any;
    try {
      data = text ? JSON.parse(text) : {};
    } catch (error) {
      throw new Error(
        `DeerAPI Suno 歌词响应解析失败: 无法解析为 JSON。原始响应: ${text.substring(
          0,
          200,
        )}...`,
      );
    }

    // 兼容不同格式：优先使用 data 字段，如果 data 本身是对象且有 task_id/ id，则优先使用
    let taskId: string | undefined;
    if (typeof data.data === 'string') {
      taskId = data.data;
    } else if (data.data && typeof data.data === 'object') {
      taskId =
        data.data.task_id ||
        data.data.taskId ||
        data.data.id ||
        (typeof data.data === 'string' ? data.data : undefined);
    }

    if (!taskId && typeof data === 'string') {
      taskId = data;
    }

    if (!taskId) {
      throw new Error(
        `DeerAPI Suno 歌词响应中缺少任务 ID 字段（data / data.task_id / data.id）。完整响应: ${JSON.stringify(
          data,
        ).substring(0, 500)}...`,
      );
    }

    return {
      taskId,
      raw: data,
    };
  }

  /**
   * OpenAI chat/completions 兼容接口
   * 参考文档：https://apidoc.deerapi.com/chat-completions-276386060e0
   */
  async chat(request: DeerAPIChatRequest): Promise<DeerAPIChatResponse> {
    const url = `${this.config.baseUrl}/v1/chat/completions`;

    const authHeader = this.getAuthHeader();

    const body: any = {
      model: request.model,
      messages: request.messages,
      temperature: request.temperature,
      max_tokens: request.max_tokens,
      stream: request.stream ?? false,
    };

    // 透传其余参数（top_p、presence_penalty、frequency_penalty 等）
    const extraKeys = Object.keys(request).filter(
      (k) => !['model', 'messages', 'temperature', 'max_tokens', 'stream'].includes(k)
    );
    for (const key of extraKeys) {
      body[key] = (request as any)[key];
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DeerAPI 请求失败: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return (await response.json()) as DeerAPIChatResponse;
  }

  /**
   * OpenAI embeddings 兼容接口
   * 调用 DeerAPI 的 /v1/embeddings 接口
   * 支持渠道分组（group）参数
   */
  async embeddings(request: {
    input: string | string[];
    model?: string;
    dimensions?: number; // OpenAI 支持降维参数（仅 text-embedding-3-large 支持）
  }): Promise<{
    data: Array<{
      embedding: number[];
      index: number;
    }>;
    model: string;
    usage: {
      prompt_tokens: number;
      total_tokens: number;
    };
  }> {
    const url = `${this.config.baseUrl}/v1/embeddings`;

    const authHeader = this.getAuthHeader();

    const body: any = {
      input: request.input,
      model: request.model || 'text-embedding-3-small',
    };

    // 如果指定了 dimensions（仅 text-embedding-3-large 支持降维）
    if (request.dimensions !== undefined) {
      body.dimensions = request.dimensions;
    }

    const headers: Record<string, string> = {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    };

    // DeerAPI 支持通过查询参数传递 group
    const queryParams = this.config.group ? `?group=${encodeURIComponent(this.config.group)}` : '';
    const fullUrl = `${url}${queryParams}`;

    const response = await fetch(fullUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `DeerAPI Embeddings 请求失败: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    return (await response.json()) as {
      data: Array<{
        embedding: number[];
        index: number;
      }>;
      model: string;
      usage: {
        prompt_tokens: number;
        total_tokens: number;
      };
    };
  }

  /**
   * OpenAI chat/completions 流式接口（返回纯文本 chunk）
   */
  async *chatStream(request: DeerAPIChatRequest): AsyncGenerator<string, void, unknown> {
    const url = `${this.config.baseUrl}/v1/chat/completions`;

    const authHeader = this.getAuthHeader();

    const body: any = {
      model: request.model,
      messages: request.messages,
      temperature: request.temperature,
      max_tokens: request.max_tokens,
      stream: true,
    };

    const extraKeys = Object.keys(request).filter(
      (k) => !['model', 'messages', 'temperature', 'max_tokens', 'stream'].includes(k)
    );
    for (const key of extraKeys) {
      body[key] = (request as any)[key];
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DeerAPI 流式请求失败: ${response.status} ${response.statusText} - ${errorText}`);
    }

    if (!response.body) {
      throw new Error('DeerAPI 流式请求失败：响应体为空');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;
        if (!trimmed.startsWith('data: ')) continue;

        const jsonStr = trimmed.substring(6);
        if (jsonStr === '[DONE]') continue;

        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content;
          if (typeof content === 'string' && content.length > 0) {
            yield content;
          }
        } catch {
          // 忽略解析错误
        }
      }
    }

    reader.releaseLock();
  }

  /**
   * Anthropic Messages API（非流式）
   * 对应 DeerAPI 的 /v1/messages
   */
  async anthropicMessages(request: {
    model: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    system?: string;
    max_tokens: number;
    temperature?: number;
  }): Promise<DeerAPIAnthropicMessage> {
    const url = `${this.config.baseUrl}/v1/messages`;
    const authHeader = this.getAuthHeader();

    const body: any = {
      model: request.model,
      messages: request.messages,
      max_tokens: request.max_tokens,
    };

    if (request.system) body.system = request.system;
    if (request.temperature !== undefined) body.temperature = request.temperature;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DeerAPI 请求失败: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return (await response.json()) as DeerAPIAnthropicMessage;
  }

  /**
   * Anthropic Messages API 流式输出
   */
  async *anthropicMessagesStream(request: {
    model: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    system?: string;
    max_tokens: number;
    temperature?: number;
  }): AsyncGenerator<DeerAPIAnthropicStreamEvent, void, unknown> {
    const url = `${this.config.baseUrl}/v1/messages`;
    const authHeader = this.getAuthHeader();

    const body: any = {
      model: request.model,
      messages: request.messages,
      max_tokens: request.max_tokens,
      stream: true,
    };

    if (request.system) body.system = request.system;
    if (request.temperature !== undefined) body.temperature = request.temperature;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DeerAPI 流式请求失败: ${response.status} ${response.statusText} - ${errorText}`);
    }

    if (!response.body) {
      throw new Error('DeerAPI 流式请求失败：响应体为空');
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
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;
          if (!trimmed.startsWith('data: ')) continue;

          const jsonStr = trimmed.substring(6);
          if (jsonStr === '[DONE]') continue;

          try {
            const event = JSON.parse(jsonStr) as DeerAPIAnthropicStreamEvent;
            yield event;
          } catch {
            // 忽略解析错误
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Gemini generateContent 图像生成接口
   * 使用 DeerAPI 的 Gemini 官方 generateContent 接口
   * 参考文档：https://apidoc.deerapi.com/guide-to-calling-gemini-image
   */
  async generateContent(request: {
    model: string; // 模型名称（如 "gemini-3-pro-image" 或 "gemini-2.5-flash-image"）
    prompt: string;
    imageInputs?: Array<{
      mime_type: string;
      data: string; // Base64 字符串（不包含 data:image/... 前缀）
    }>;
    aspectRatio?: string; // 宽高比，如 "16:9", "1:1" 等
    responseModalities?: ('TEXT' | 'IMAGE')[]; // 默认 ["TEXT", "IMAGE"]
  }): Promise<any> {
    // 返回类型使用 any，因为 Gemini API 可能使用驼峰命名或下划线命名
    // 根据文档，端点格式为 /v1beta/models/{model}:generateContent
    const url = `${this.config.baseUrl}/v1beta/models/${request.model}:generateContent`;
    const authHeader = this.getAuthHeader();

    // 构建 Gemini generateContent 格式的请求体
    const parts: Array<any> = [
      {
        text: request.prompt,
      },
    ];

    // 如果有图片输入，添加到 parts 中
    if (request.imageInputs && request.imageInputs.length > 0) {
      for (const img of request.imageInputs) {
        parts.push({
          inline_data: {
            mime_type: img.mime_type,
            data: img.data,
          },
        });
      }
    }

    const body: any = {
      contents: [
        {
          role: 'user',
          parts,
        },
      ],
      generationConfig: {
        responseModalities: request.responseModalities || ['TEXT', 'IMAGE'],
      },
    };

    // 如果指定了宽高比，添加到 generationConfig
    if (request.aspectRatio) {
      body.generationConfig.aspectRatio = request.aspectRatio;
    }

    const headers: Record<string, string> = {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    };

    // 如果配置了 group，添加到请求头
    if (this.config.group) {
      headers['x-group'] = this.config.group;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DeerAPI generateContent 失败: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return (await response.json()) as any;
  }

  /**
   * Replicate 兼容的图像生成接口（异步预测）
   * 如果 DeerAPI 支持 Replicate 格式，使用此方法
   * 注意：根据实际 API 文档，端点路径可能需要调整
   */
  async createPrediction(request: {
    version: string; // 模型版本（如 "nano-banana"）
    input: Record<string, any>; // 输入参数
  }): Promise<{
    id: string;
    status: string;
    output?: any;
    error?: any;
    urls?: {
      get: string;
      cancel: string;
    };
  }> {
    // 尝试多个可能的端点路径
    const possibleEndpoints = [
      '/v1/replicate/predictions',
      '/v1/predictions',
      '/predictions',
    ];

    const authHeader = this.getAuthHeader();
    const body: any = {
      version: request.version,
      input: request.input,
    };

    // 如果配置了 group，添加到请求中
    if (this.config.group) {
      body.group = this.config.group;
    }

    let lastError: Error | null = null;

    // 尝试每个可能的端点
    for (const endpoint of possibleEndpoints) {
      try {
        const url = `${this.config.baseUrl}${endpoint}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });

        if (response.ok) {
          return (await response.json()) as any;
        }

        // 如果不是 404，说明端点存在但请求有问题，直接抛出错误
        if (response.status !== 404) {
          const errorText = await response.text();
          throw new Error(`DeerAPI 创建预测失败: ${response.status} ${response.statusText} - ${errorText}`);
        }

        // 404 错误，继续尝试下一个端点
        lastError = new Error(`端点 ${endpoint} 不存在 (404)`);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        // 继续尝试下一个端点
      }
    }

    // 所有端点都失败，抛出最后一个错误
    throw new Error(`DeerAPI 创建预测失败：所有端点都不可用。最后错误: ${lastError?.message || '未知错误'}`);
  }

  /**
   * 查询预测状态
   */
  async getPrediction(predictionId: string): Promise<{
    id: string;
    status: string;
    output?: any;
    error?: any;
    urls?: {
      get: string;
      cancel: string;
    };
  }> {
    // 尝试多个可能的端点路径
    const possibleEndpoints = [
      `/v1/replicate/predictions/${predictionId}`,
      `/v1/predictions/${predictionId}`,
      `/predictions/${predictionId}`,
    ];

    const authHeader = this.getAuthHeader();
    let lastError: Error | null = null;

    for (const endpoint of possibleEndpoints) {
      try {
        const url = `${this.config.baseUrl}${endpoint}`;
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            Authorization: authHeader,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          return (await response.json()) as any;
        }

        if (response.status !== 404) {
          const errorText = await response.text();
          throw new Error(`DeerAPI 查询预测失败: ${response.status} ${response.statusText} - ${errorText}`);
        }

        lastError = new Error(`端点 ${endpoint} 不存在 (404)`);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    throw new Error(`DeerAPI 查询预测失败：所有端点都不可用。最后错误: ${lastError?.message || '未知错误'}`);
  }

  /**
   * Flux 专用接口：创建图像生成任务
   * 参考文档：https://apidoc.deerapi.com/image/flux/create
   */
  async createFluxPrediction(request: {
    model: string; // 模型名称，如 'flux-2-pro', 'flux-dev' 等
    prompt: string;
    aspect_ratio?: string;
    output_format?: 'png' | 'jpg' | 'webp';
    seed?: number;
    safety_tolerance?: number;
    prompt_upsampling?: boolean;
    width?: number;
    height?: number;
    steps?: number;
    guidance?: number;
    input_image?: string;
    input_image_2?: string;
    input_image_3?: string;
    input_image_4?: string;
    webhook_url?: string;
    webhook_secret?: string;
  }): Promise<{
    id: string;
    polling_url: string;
  }> {
    const authHeader = this.getAuthHeader();
    const url = `${this.config.baseUrl}/flux/v1/${request.model}`;

    const body: any = {
      prompt: request.prompt,
    };

    // 添加可选参数
    if (request.aspect_ratio) body.aspect_ratio = request.aspect_ratio;
    if (request.output_format) body.output_format = request.output_format;
    if (request.seed !== undefined) body.seed = request.seed;
    if (request.safety_tolerance !== undefined) body.safety_tolerance = request.safety_tolerance;
    if (request.prompt_upsampling !== undefined) body.prompt_upsampling = request.prompt_upsampling;
    if (request.width !== undefined) body.width = request.width;
    if (request.height !== undefined) body.height = request.height;
    if (request.steps !== undefined) body.steps = request.steps;
    if (request.guidance !== undefined) body.guidance = request.guidance;
    if (request.input_image) body.input_image = request.input_image;
    if (request.input_image_2) body.input_image_2 = request.input_image_2;
    if (request.input_image_3) body.input_image_3 = request.input_image_3;
    if (request.input_image_4) body.input_image_4 = request.input_image_4;
    if (request.webhook_url) body.webhook_url = request.webhook_url;
    if (request.webhook_secret) body.webhook_secret = request.webhook_secret;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DeerAPI Flux 创建任务失败: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return (await response.json()) as { id: string; polling_url: string };
  }

  /**
   * Flux 专用接口：查询生成结果
   * 参考文档：https://apidoc.deerapi.com/image/flux/get_result
   * 
   * 根据任务 ID 查询图像生成任务的状态和结果
   */
  async getFluxResult(taskId: string): Promise<{
    id: string;
    status: string; // "Ready", "Processing", "Failed" 等
    result?: {
      seed?: number;
      prompt?: string;
      sample?: string; // 图片 URL
      duration?: number;
      end_time?: number;
      start_time?: number;
    };
    error?: any;
  }> {
    const authHeader = this.getAuthHeader();
    const url = `${this.config.baseUrl}/flux/v1/get_result?id=${encodeURIComponent(taskId)}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DeerAPI Flux 查询结果失败: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = (await response.json()) as {
      id?: string;
      status?: string; // 可能为 undefined
      result?: {
        seed?: number;
        prompt?: string;
        sample?: string;
        duration?: number;
        end_time?: number;
        start_time?: number;
      };
      error?: any;
    };

    // 调试日志：打印实际返回的数据结构
    if (process.env.DEBUG_DEERAPI || process.env.NODE_ENV !== 'production') {
      // 避免打印 Base64 数据，只显示响应结构
      const safeData = JSON.parse(JSON.stringify(data, (key, value) => {
        if (key === 'data' && typeof value === 'string' && value.length > 100 && /^[A-Za-z0-9+/=]+$/.test(value.substring(0, 50))) {
          return `[Base64数据，长度: ${value.length} 字符]`;
        }
        if (typeof value === 'string' && value.startsWith('data:') && value.includes('base64,')) {
          const base64Part = value.split('base64,')[1];
          return `[Data URI，Base64长度: ${base64Part?.length || 0} 字符]`;
        }
        return value;
      }));
      console.log('[DeerAPIClient] getFluxResult 响应结构:', JSON.stringify(safeData, null, 2));
    }

    // 确保返回的数据至少包含基本字段
    if (!data.status && !data.error) {
      // 避免打印 Base64 数据
      const safeData = JSON.parse(JSON.stringify(data, (key, value) => {
        if (key === 'data' && typeof value === 'string' && value.length > 100 && /^[A-Za-z0-9+/=]+$/.test(value.substring(0, 50))) {
          return `[Base64数据，长度: ${value.length} 字符]`;
        }
        if (typeof value === 'string' && value.startsWith('data:') && value.includes('base64,')) {
          const base64Part = value.split('base64,')[1];
          return `[Data URI，Base64长度: ${base64Part?.length || 0} 字符]`;
        }
        return value;
      }));
      console.warn('[DeerAPIClient] getFluxResult 返回的数据缺少 status 字段:', JSON.stringify(safeData));
    }

    return {
      id: data.id || '',
      status: data.status || 'unknown',
      result: data.result,
      error: data.error,
    };
  }

  /**
   * Seedream 图像生成接口
   * 参考文档：https://apidoc.deerapi.com/seededit-image-generation-331149260e0
   * 端点：POST /v1/images/generations
   */
  async createSeedreamImageGeneration(request: {
    model: string; // 模型名称，如 'doubao-seedream-4-5-251128'
    prompt: string;
    response_format?: 'url' | 'b64_json'; // 默认 'url'
    size?: '1k' | '2k' | '4k'; // 注意：API 使用小写
    watermark?: boolean;
    n?: number; // 生成图片数量（1-15）
    guidance_scale?: number; // 引导强度（1-10）
    image?: string | string[]; // 参考图片 URL 或 Base64（1-10张）
  }): Promise<{
    data: Array<{
      url?: string;
      b64_json?: string;
    }>;
    created: number;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
      output_tokens?: number;
    };
  }> {
    const authHeader = this.getAuthHeader();
    const url = `${this.config.baseUrl}/v1/images/generations`;

    const body: any = {
      model: request.model,
      prompt: request.prompt,
    };

    // 添加可选参数
    if (request.response_format) body.response_format = request.response_format;
    if (request.size) body.size = request.size.toLowerCase(); // 确保小写
    if (request.watermark !== undefined) body.watermark = request.watermark;
    if (request.n !== undefined) body.n = request.n;
    if (request.guidance_scale !== undefined) body.guidance_scale = request.guidance_scale;
    if (request.image !== undefined) {
      // 支持字符串或数组
      body.image = Array.isArray(request.image) ? request.image : [request.image];
    }

    // 检查请求体大小（Base64 图片可能很大）
    const bodyString = JSON.stringify(body);
    const bodySizeMB = bodyString.length / 1024 / 1024;
    if (bodySizeMB > 10) {
      console.warn(`[DeerAPIClient] 警告：请求体较大 (${bodySizeMB.toFixed(2)} MB)，可能导致请求超时或失败`);
    }
    console.log(`[DeerAPIClient] 发送 Seedream 图像生成请求，请求体大小: ${bodySizeMB.toFixed(2)} MB`);

    // 设置超时（10 分钟，因为大图片上传和生成可能需要更长时间）
    const timeoutMs = 10 * 60 * 1000; // 10 分钟
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
        body: bodyString,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`DeerAPI Seedream 图像生成失败: ${response.status} ${response.statusText} - ${errorText}`);
      }

      return (await response.json()) as {
        data: Array<{
          url?: string;
          b64_json?: string;
        }>;
        created: number;
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          total_tokens?: number;
          output_tokens?: number;
        };
      };
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error) {
        // 检查是否是超时错误
        if (error.name === 'AbortError' || error.message.includes('aborted')) {
          throw new Error(`DeerAPI Seedream 图像生成请求超时（${timeoutMs / 1000}秒）。请求体可能过大（${bodySizeMB.toFixed(2)} MB），请考虑使用 URL 而不是 Base64，或减小图片尺寸。`);
        }
        // 检查是否是网络错误
        if (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND')) {
          throw new Error(`DeerAPI Seedream 图像生成网络错误: ${error.message}。请检查网络连接、API 端点配置和防火墙设置。请求体大小: ${bodySizeMB.toFixed(2)} MB`);
        }
        throw error;
      }
      throw new Error(`DeerAPI Seedream 图像生成失败: ${String(error)}`);
    }
  }

  /**
   * 创建视频生成任务
   * 参考文档：https://apidoc.deerapi.com/video/sora/official/create
   * 
   * @param request 视频生成请求参数
   * @returns 视频任务信息
   */
  async createVideo(request: {
    prompt: string;
    /**
     * 视频生成模型
     * 官方格式：
     * - sora-2
     * - sora-2-pro
     * 逆向异步自研格式（参考：https://apidoc.deerapi.com/sora/self-developed/create）：
     * - sora-2-all
     * - sora-2-pro-all
     */
    model?: 'sora-2' | 'sora-2-pro' | 'sora-2-all' | 'sora-2-pro-all';
    /**
     * 剪辑时长
     * 官方格式：4 / 8 / 12
     * 自研格式：10 / 15 / 25（仅 -all / -pro-all 支持）
     */
    seconds?: '4' | '8' | '12' | '10' | '15' | '25';
    size?: '720x1280' | '1280x720' | '1024x1792' | '1792x1024';
    /**
     * 图像参考（仅本地路径上传，不支持 URL）
     * - File：浏览器环境
     * - Buffer：Node.js 环境（已处理为 Blob）
     * - string：Base64 字符串
     */
    input_reference?: File | Buffer | string;
    /**
     * 角色一致性相关参数（仅自研 sora-2-all / sora-2-pro-all 支持）
     * 文档参考：https://apidoc.deerapi.com/sora/self-developed/create
     */
    character_url?: string;
    character_timestamps?: string; // 例如 "1,8"
  }): Promise<{
    id: string;
    object: string;
    created_at: number;
    status: 'queued' | 'in_progress' | 'completed' | 'failed';
    completed_at: number | null;
    error: any | null;
    expires_at: number | null;
    model: string;
    progress: number;
    remixed_from_video_id: string | null;
    seconds: string;
    size: string;
  }> {
    const url = `${this.config.baseUrl}/v1/videos`;
    const authHeader = this.getAuthHeader();

    // 构建 FormData
    const formData = new FormData();
    formData.append('prompt', request.prompt);
    
    if (request.model) {
      formData.append('model', request.model);
    }
    // 确保 seconds 是字符串类型
    if (request.seconds) {
      const secondsStr = String(request.seconds);
      formData.append('seconds', secondsStr);
      console.log(`[DeerAPI Client] 添加 seconds 参数: ${secondsStr} (类型: ${typeof secondsStr})`);
    } else {
      console.warn(`[DeerAPI Client] 警告: seconds 参数未提供，将使用默认值 4 秒`);
    }
    
    if (request.size) {
      formData.append('size', request.size);
      console.log(`[DeerAPI Client] 添加 size 参数: ${request.size}`);
    }
    
    // 处理图像参考
    if (request.input_reference) {
      let blob: Blob;
      let filename = 'reference.jpg';
      
      if (typeof request.input_reference === 'string') {
        // base64 字符串，需要转换为 Blob
        const base64Data = request.input_reference.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        blob = new Blob([buffer]);
        
        // 根据 base64 前缀确定文件类型
        const mimeMatch = request.input_reference.match(/^data:image\/(\w+);base64,/);
        if (mimeMatch) {
          const ext = mimeMatch[1] === 'png' ? 'png' : 'jpg';
          filename = `reference.${ext}`;
        }
        
        console.log(`[DeerAPI Client] 添加 input_reference (base64): ${filename}, 大小: ${(buffer.length / 1024).toFixed(2)} KB`);
      } else if (Buffer.isBuffer(request.input_reference)) {
        // Buffer，转换为 Blob
        blob = new Blob([request.input_reference]);
        console.log(`[DeerAPI Client] 添加 input_reference (Buffer): ${filename}, 大小: ${(request.input_reference.length / 1024).toFixed(2)} KB`);
      } else {
        // File 对象
        blob = request.input_reference as any;
        filename = (request.input_reference as File).name || filename;
        console.log(`[DeerAPI Client] 添加 input_reference (File): ${filename}`);
      }
      
      formData.append('input_reference', blob, filename);
    } else {
      console.log(`[DeerAPI Client] 未提供 input_reference 参数`);
    }

    // 角色一致性参数（仅自研格式使用，官方格式会忽略）
    if (request.character_url) {
      formData.append('character_url', request.character_url);
    }
    if (request.character_timestamps) {
      formData.append('character_timestamps', request.character_timestamps);
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        // 不要设置 Content-Type，让浏览器自动设置（包含 boundary）
      },
      body: formData as any,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DeerAPI 视频生成失败: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return (await response.json()) as any;
  }

  /**
   * 查询视频任务状态
   * 参考文档：https://apidoc.deerapi.com/video/sora/official/list
   * 
   * @param videoId 视频任务 ID
   * @returns 视频任务信息
   */
  async getVideoStatus(videoId: string): Promise<{
    id: string;
    object?: string;
    created_at?: number;
    status: 'queued' | 'in_progress' | 'completed' | 'failed';
    completed_at?: number | null;
    error?: any | null;
    expires_at?: number | null;
    model?: string;
    progress?: number;
    remixed_from_video_id?: string | null;
    seconds?: string;
    size?: string;
    /**
     * 实测 DeerAPI 在 /v1/videos/{id} 的响应中返回 video_url
     * （官方文档未完全体现，但在逆向测试脚本中已确认）
     */
    video_url?: string;
    video_url_ttl?: number;
  }> {
    const url = `${this.config.baseUrl}/v1/videos/${videoId}`;
    const authHeader = this.getAuthHeader();

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DeerAPI 查询视频状态失败: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return (await response.json()) as any;
  }

  /**
   * 统一的视频任务状态查询
   * - 官方 Sora：直接返回官方结构，包含 status/progress/video_url 等
   * - 自研 / 逆向 Sora：可能返回 { message, data: { error } } 结构，这里统一解析为 DeerVideoStatus
   */
  async getVideoStatusUnified(videoId: string): Promise<DeerVideoStatus> {
    const url = `${this.config.baseUrl}/v1/videos/${videoId}`;
    const authHeader = this.getAuthHeader();

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `DeerAPI 查询视频状态失败: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const data: any = await response.json();

    // 1) 逆向 / 自研格式：{ message, data: { error: {...} } }
    if (data && data.data && data.data.error) {
      return {
        raw: data,
        status: 'failed',
        progress: 0,
        error: {
          code: data.data.error.code,
          message: data.data.error.message,
          type: data.data.error.type,
        },
        id: data.data.id,
        model: data.data.model,
        seconds: data.data.seconds,
        size: data.data.size,
      };
    }

    // 2) 官方 / 正常格式：顶层有 status 字段
    if (data && (data.status === 'queued' ||
      data.status === 'in_progress' ||
      data.status === 'completed' ||
      data.status === 'failed')) {
      return {
        raw: data,
        status: data.status,
        progress: typeof data.progress === 'number' ? data.progress : undefined,
        video_url: data.video_url,
        error: data.error ?? null,
        id: data.id,
        model: data.model,
        seconds: data.seconds,
        size: data.size,
      };
    }

    // 3) 逆向成功格式：顶层没有 status，data.status 存在
    if (data && data.data && data.data.status) {
      const s = data.data.status;
      const normalizedStatus =
        s === 'completed' || s === 'failed' || s === 'queued' || s === 'in_progress'
          ? s
          : 'in_progress';

      return {
        raw: data,
        status: normalizedStatus,
        progress:
          typeof data.data.progress === 'number'
            ? data.data.progress
            : undefined,
        video_url: data.data.video_url,
        error: null,
        id: data.data.id,
        model: data.data.model,
        seconds: data.data.seconds,
        size: data.data.size,
      };
    }

    // 4) 未知结构：尽量给出一个合理的默认值，避免进度流死循环
    return {
      raw: data,
      status: 'in_progress',
      progress: typeof data?.progress === 'number' ? data.progress : 0,
      video_url: data?.video_url,
      error: null,
      id: data?.id,
      model: data?.model,
      seconds: data?.seconds,
      size: data?.size,
    };
  }

  /**
   * 获取视频内容（下载链接）
   * 参考文档：https://apidoc.deerapi.com/video/sora/official/content
   * 
   * @param videoId 视频任务 ID
   * @returns 视频内容信息
   */
  async getVideoContent(videoId: string): Promise<{
    id: string;
    object: string;
    created_at: number;
    status: string;
    video_url?: string;
    video_url_ttl?: number;
  }> {
    const url = `${this.config.baseUrl}/v1/videos/${videoId}/content`;
    const authHeader = this.getAuthHeader();

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DeerAPI 获取视频内容失败: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return (await response.json()) as any;
  }

  /**
   * 创建 Runway 图片转视频任务
   * 通过 DeerAPI 调用 Runway API
   * 参考文档: https://api.deerapi.com/doc
   */
  async createRunwayImageToVideo(request: {
    model: 'gen4_turbo' | 'veo3.1' | 'gen3a_turbo' | 'veo3.1_fast' | 'veo3';
    promptImage: string; // base64 或 URL
    ratio: '1280:720' | '720:1280' | '1104:832' | '832:1104' | '960:960' | '1584:672' | '1280:768' | '768:1280';
    promptText?: string;
    seed?: number;
    duration?: 5 | 6 | 7 | 8 | 9 | 10; // 5-10 秒（根据 Runway API 文档）
    contentModeration?: {
      publicFigureThreshold?: 'auto' | 'low';
    };
    watermark?: boolean; // 根据文档添加
  }): Promise<{
    id: string;
    status: 'queued' | 'in_progress' | 'completed' | 'failed';
  }> {
    const url = `${this.config.baseUrl}/runwayml/v1/image_to_video`;
    const authHeader = this.getAuthHeader();

    // 构建请求体，只包含有值的字段
    const body: any = {
      model: request.model,
      promptImage: request.promptImage,
      ratio: request.ratio,
    };
    
    // promptText 是可选的，只有提供时才添加
    if (request.promptText !== undefined && request.promptText !== null && request.promptText !== '') {
      body.promptText = request.promptText;
    }
    
    if (request.seed !== undefined) {
      body.seed = request.seed;
    }
    
    // duration 参数：5-10 秒，必须明确传递（不传则使用 API 默认值 10）
    // 注意：根据 Runway API，默认值是 10 秒，不是 5 秒
    if (request.duration !== undefined) {
      // 验证 duration 值是否在有效范围内
      if (request.duration < 5 || request.duration > 10) {
        console.warn(`[DeerAPI] duration 参数值 ${request.duration} 不在有效范围 5-10 内，将使用默认值 10`);
        body.duration = 10; // 使用默认值
      } else {
        body.duration = request.duration;
      }
    } else {
      // 如果没有传递 duration，Runway API 会使用默认值 10
      console.log('[DeerAPI] 未传递 duration 参数，将使用 Runway API 默认值 10 秒');
    }
    
    if (request.watermark !== undefined) {
      body.watermark = request.watermark;
    }
    
    if (request.contentModeration !== undefined) {
      body.contentModeration = request.contentModeration;
    }

    // 记录实际发送的请求体，用于调试（避免打印 Base64 数据）
    const safeBody = JSON.parse(JSON.stringify(body, (key, value) => {
      if (key === 'data' && typeof value === 'string' && value.length > 100 && /^[A-Za-z0-9+/=]+$/.test(value.substring(0, 50))) {
        return `[Base64数据，长度: ${value.length} 字符]`;
      }
      if (typeof value === 'string' && value.startsWith('data:') && value.includes('base64,')) {
        const base64Part = value.split('base64,')[1];
        return `[Data URI，Base64长度: ${base64Part?.length || 0} 字符]`;
      }
      return value;
    }));
    console.log('[DeerAPI] 图片转视频请求参数:', JSON.stringify(safeBody, null, 2));
    console.log('[DeerAPI] duration 参数值:', body.duration, '(类型:', typeof body.duration, ')');
    if (body.duration === undefined) {
      console.warn('[DeerAPI] ⚠️  duration 参数未设置，Runway API 将使用默认值 10 秒');
    } else {
      console.log(`[DeerAPI] ✅ duration 参数已设置: ${body.duration} 秒`);
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'X-Runway-Version': '2024-11-06', // 根据文档添加
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DeerAPI Runway 图片转视频失败: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    // 避免打印 Base64 数据，只显示响应结构
    const safeData = JSON.parse(JSON.stringify(data, (key, value) => {
      if (key === 'data' && typeof value === 'string' && value.length > 100 && /^[A-Za-z0-9+/=]+$/.test(value.substring(0, 50))) {
        return `[Base64数据，长度: ${value.length} 字符]`;
      }
      if (typeof value === 'string' && value.startsWith('data:') && value.includes('base64,')) {
        const base64Part = value.split('base64,')[1];
        return `[Data URI，Base64长度: ${base64Part?.length || 0} 字符]`;
      }
      return value;
    }));
    console.log('[DeerAPI] 图片转视频任务创建响应结构:', JSON.stringify(safeData, null, 2));
    
    // 检查返回的数据结构
    // DeerAPI 可能返回不同的数据结构，尝试多种可能的字段名
    let taskId: string | undefined;
    if (data.id) {
      taskId = data.id;
    } else if (data.task_id) {
      taskId = data.task_id;
    } else if (data.taskId) {
      taskId = data.taskId;
    } else if (data.data && data.data.id) {
      taskId = data.data.id;
    } else if (typeof data === 'string') {
      // 如果直接返回字符串 ID
      taskId = data;
    }
    
    if (!taskId) {
      console.error('[DeerAPI] 警告: 创建任务响应中找不到 id 字段');
      console.error('[DeerAPI] 完整响应:', JSON.stringify(data, null, 2));
      throw new Error('创建任务响应中缺少任务 ID');
    }
    
    console.log(`[DeerAPI] 提取的任务 ID: ${taskId}`);
    
    return {
      id: taskId,
      status: 'queued',
    };
  }

  /**
   * 创建 Runway 文本转视频任务
   * 通过 DeerAPI 调用 Runway API
   * 参考文档: https://api.deerapi.com/doc
   */
  async createRunwayTextToVideo(request: {
    model: 'veo3.1' | 'veo3.1_fast' | 'veo3';
    promptText: string;
    ratio: '1280:720' | '720:1280' | '1080:1920' | '1920:1080';
    audio?: boolean; // 默认 true
    duration?: 4 | 6 | 8;
  }): Promise<{
    id: string;
    status: 'queued' | 'in_progress' | 'completed' | 'failed';
  }> {
    const url = `${this.config.baseUrl}/runwayml/v1/text_to_video`;
    const authHeader = this.getAuthHeader();

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model,
        promptText: request.promptText,
        ratio: request.ratio,
        audio: request.audio !== undefined ? request.audio : true,
        duration: request.duration,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DeerAPI Runway 文本转视频失败: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    return {
      id: data.id,
      status: 'queued',
    };
  }

  /**
   * 创建 Runway 视频转视频任务
   * 通过 DeerAPI 调用 Runway API
   * 参考文档: https://api.deerapi.com/doc
   */
  async createRunwayVideoToVideo(request: {
    videoUri: string;
    ratio: '1280:720' | '720:1280' | '1080:1920' | '1920:1080';
    promptText?: string;
    seed?: number;
    duration?: number;
    references?: Array<{
      type: 'image';
      uri: string;
    }>;
  }): Promise<{
    id: string;
    status: 'queued' | 'in_progress' | 'completed' | 'failed';
  }> {
    const url = `${this.config.baseUrl}/runwayml/v1/video_to_video`;
    const authHeader = this.getAuthHeader();

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gen4_aleph',
        videoUri: request.videoUri,
        ratio: request.ratio,
        promptText: request.promptText,
        seed: request.seed,
        duration: request.duration,
        references: request.references,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DeerAPI Runway 视频转视频失败: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    return {
      id: data.id,
      status: 'queued',
    };
  }

  /**
   * 查询 Runway 任务状态
   * 通过 DeerAPI 调用 Runway API
   * 参考文档: https://api.deerapi.com/doc
   */
  /**
   * 查询 Runway 任务状态
   * 根据官方文档：https://docs.dev.runwayml.com/api/
   * 响应格式：
   * {
   *   "id": "string",
   *   "output": ["video_url"],
   *   "status": "SUCCEEDED" | "RUNNING" | "PENDING" | "FAILED" | "CANCELLED",
   *   "createdAt": "2025-06-13T01:15:36.520Z"
   * }
   */
  async getRunwayTaskStatus(taskId: string): Promise<{
    id: string;
    status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
    createdAt?: string;
    updatedAt?: string;
    output?: string | string[]; // 视频 URL 数组
    error?: {
      code?: string;
      message?: string;
    };
  }> {
    // 使用标准查询路径（根据 DeerAPI 文档）
    const url = `${this.config.baseUrl}/runwayml/v1/tasks/${taskId}`;
    const authHeader = this.getAuthHeader();
    
    console.log(`[DeerAPI] 查询任务状态: ${url}`);
    console.log(`[DeerAPI] TaskId: ${taskId}`);

    let response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'X-Runway-Version': '2024-11-06', // 添加版本头
      },
    });

    // 处理错误响应
    if (!response.ok) {
      const errorText = await response.text();
      let errorData: any;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }
      
      // 详细记录错误信息，用于调试
      console.error(`[DeerAPI] 查询任务状态失败: ${response.status} ${response.statusText}`);
      console.error(`[DeerAPI] 错误响应: ${errorText}`);
      console.error(`[DeerAPI] 解析后的错误数据:`, JSON.stringify(errorData, null, 2));
      console.error(`[DeerAPI] 任务 ID: ${taskId}`);
      console.error(`[DeerAPI] 查询 URL: ${url}`);
      
      // 检查是否是 task_not_exist 错误（可能有多种格式）
      const isTaskNotExist = 
        errorData.code === 'task_not_exist' || 
        errorData.message === 'task_not_exist' ||
        errorData.error?.code === 'task_not_exist' ||
        errorData.error?.message === 'task_not_exist' ||
        (typeof errorText === 'string' && errorText.toLowerCase().includes('task_not_exist')) ||
        (typeof errorText === 'string' && errorText.toLowerCase().includes('not found')) ||
        response.status === 404;
      
      if (isTaskNotExist) {
        console.warn(`[DeerAPI] 任务不存在 (${taskId})，可能原因：`);
        console.warn(`  1. 任务还未创建完成，需要等待更长时间`);
        console.warn(`  2. 任务 ID 格式不正确`);
        console.warn(`  3. 查询路径不正确`);
        console.warn(`  4. 任务可能在不同的命名空间或账户下`);
        // 抛出特定错误，让调用方可以决定是否重试
        const error = new Error(`DeerAPI Runway 任务不存在: ${taskId}。可能任务还未创建完成，请稍后重试。`);
        (error as any).code = 'TASK_NOT_EXIST';
        (error as any).status = response.status;
        throw error;
      }
      
      // 其他错误直接抛出
      throw new Error(`DeerAPI Runway 查询任务状态失败: ${response.status} ${response.statusText} - ${errorText}`);
    }

    // 检查响应内容类型
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const text = await response.text();
      console.error(`[DeerAPI] 响应不是 JSON 格式，Content-Type: ${contentType}`);
      console.error(`[DeerAPI] 响应内容（前500字符）: ${text.substring(0, 500)}`);
      throw new Error(`DeerAPI Runway 查询任务状态失败: 响应不是 JSON 格式，可能是 HTML 错误页面`);
    }

    const data = await response.json();
    // 避免打印 Base64 数据，只显示响应结构
    const safeData = JSON.parse(JSON.stringify(data, (key, value) => {
      if (key === 'data' && typeof value === 'string' && value.length > 100 && /^[A-Za-z0-9+/=]+$/.test(value.substring(0, 50))) {
        return `[Base64数据，长度: ${value.length} 字符]`;
      }
      if (typeof value === 'string' && value.startsWith('data:') && value.includes('base64,')) {
        const base64Part = value.split('base64,')[1];
        return `[Data URI，Base64长度: ${base64Part?.length || 0} 字符]`;
      }
      return value;
    }));
    console.log('[DeerAPI] 任务状态查询响应结构:', JSON.stringify(safeData, null, 2));
    
    // 验证响应格式（根据官方文档）
    if (!data.id || !data.status) {
      console.warn('[DeerAPI] 警告: 响应格式可能不正确，缺少 id 或 status 字段');
      console.warn('[DeerAPI] 完整响应:', JSON.stringify(data, null, 2));
    }
    
    // 确保 output 是数组格式（根据官方文档，output 是字符串数组）
    if (data.output && !Array.isArray(data.output)) {
      console.warn('[DeerAPI] 警告: output 不是数组格式，尝试转换');
      data.output = [data.output];
    }
    
    return {
      id: data.id,
      status: data.status,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      output: data.output, // 视频 URL 数组
      error: data.error,
    };
  }
}
