/**
 * PPIO 客户端
 * 
 * 用于调用 PPIO 提供的所有 API 服务
 * 支持 Gemini 3 Pro Image Preview 的文生图和图片编辑功能
 */

export interface PPIOConfig {
  baseUrl?: string;
  apiKey: string;
}

export interface PPIOTextToImageRequest {
  prompt: string;
  aspectratio?: '1:1' | '3:2' | '2:3' | '3:4' | '4:3' | '4:5' | '5:4' | '9:16' | '16:9' | '21:9';
  size?: '1K' | '2K' | '4K';
}

export interface PPIOImageEditRequest {
  prompt: string;
  image_urls?: string[];
  image_base64s?: string[];
  aspect_ratio?: '1:1' | '3:2' | '2:3' | '3:4' | '4:3' | '4:5' | '5:4' | '9:16' | '16:9' | '21:9';
  size?: '1K' | '2K' | '4K';
}

/**
 * 图片引用信息
 * 用于标识图片的用途和位置
 */
export interface ImageReference {
  /** 图片标签/名称（如：subject, scene, style, person1 等） */
  label: string;
  /** 图片用途描述 */
  description?: string;
  /** 图片索引（从 0 开始） */
  index: number;
}

/**
 * 多图理解/合成请求
 * Gemini 3 Pro 支持最多 14 张图片：
 * - 最多 6 张高保真对象图片
 * - 最多 5 张人像照片
 * - 其他图片
 */
export interface PPIOMultiImageRequest {
  prompt: string;
  image_urls?: string[];
  image_base64s?: string[];
  /** 图片引用信息，用于在 prompt 中指定每张图片的用途 */
  image_references?: ImageReference[];
  aspect_ratio?: '1:1' | '3:2' | '2:3' | '3:4' | '4:3' | '4:5' | '5:4' | '9:16' | '16:9' | '21:9';
  size?: '1K' | '2K' | '4K';
}

export interface PPIOTextToImageResponse {
  image_urls: string[];
}

export interface PPIOImageEditResponse {
  image_urls: string[];
}

export interface PPIOMultiImageResponse {
  image_urls: string[];
}

/**
 * PPIO 客户端类
 */
export class PPIOClient {
  private config: PPIOConfig;
  private baseUrl: string;

  constructor(config: PPIOConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl || 'https://api.ppinfra.com';
  }

  /**
   * 从环境变量创建客户端
   */
  static fromEnv(): PPIOClient {
    const apiKey = process.env.PPIO_API_KEY;

    if (!apiKey) {
      throw new Error('PPIO_API_KEY 环境变量必须设置');
    }

    return new PPIOClient({ apiKey });
  }

  /**
   * 文本生成图片
   * 
   * @param request 文生图请求参数
   * @returns 生成的图片 URL 列表
   */
  async textToImage(request: PPIOTextToImageRequest): Promise<PPIOTextToImageResponse> {
    const url = `${this.baseUrl}/v3/gemini-3-pro-image-text-to-image`;

    // 构建请求体
    // 根据 PPIO API 文档，文生图接口参数：
    // - prompt: 必传
    // - aspectratio: 可选（注意：根据文档是小写，无下划线）
    // - size: 可选，默认 1K
    const requestBody: Record<string, any> = {
      prompt: request.prompt,
    };

    // 添加可选参数（只有当值存在时才添加，避免发送 undefined）
    if (request.aspectratio) {
      // 根据 PPIO 文档，文生图接口使用 aspectratio（小写，无下划线）
      requestBody.aspectratio = request.aspectratio;
    }
    if (request.size) {
      requestBody.size = request.size;
    } else {
      // 如果没有指定 size，使用默认值 1K
      requestBody.size = '1K';
    }

    // 调试：打印请求体（方便排查问题）
    if (process.env.DEBUG_PPIO) {
      console.log('📤 发送请求到:', url);
      console.log('📤 请求参数:', JSON.stringify(requestBody, null, 2));
      if (request.aspectratio) {
        console.log(`📐 宽高比: ${request.aspectratio}`);
      }
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API 错误响应:');
      console.error('  状态码:', response.status, response.statusText);
      console.error('  错误内容:', errorText);
      
      // 尝试解析错误信息
      try {
        const errorJson = JSON.parse(errorText);
        console.error('  错误详情:', JSON.stringify(errorJson, null, 2));
      } catch {
        // 如果不是 JSON，直接显示文本
      }
      
      throw new Error(`PPIO 文生图请求失败: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const result = (await response.json()) as PPIOTextToImageResponse;
    
    // 调试：打印响应摘要
    console.log('📥 API 响应成功');
    console.log(`   生成图片数量: ${result.image_urls.length}`);
    if (result.image_urls.length > 0) {
      console.log(`   第一张图片 URL: ${result.image_urls[0].substring(0, 80)}...`);
    }
    
    return result;
  }

  /**
   * 多图理解/合成
   * 
   * Gemini 3 Pro 支持最多 14 张图片：
   * - 最多 6 张高保真对象图片
   * - 最多 5 张人像照片
   * - 其他图片
   * 
   * 图片引用说明：
   * - 可以通过 image_references 参数指定每张图片的用途
   * - 在 prompt 中可以使用"第一张图片"、"第二张图片"等来引用
   * - 或者使用图片标签（如 subject、scene）在 prompt 中说明
   * 
   * @param request 多图理解请求参数
   * @returns 生成的图片 URL 列表
   */
  async multiImageGeneration(request: PPIOMultiImageRequest): Promise<PPIOMultiImageResponse> {
    const url = `${this.baseUrl}/v3/gemini-3-pro-image-edit`;

    // 验证参数：必须提供 image_urls 或 image_base64s 之一
    if (!request.image_urls && !request.image_base64s) {
      throw new Error('必须提供 image_urls 或 image_base64s 之一');
    }

    if (request.image_urls && request.image_base64s) {
      throw new Error('不能同时提供 image_urls 和 image_base64s');
    }

    // 验证图片数量
    const imageCount = request.image_urls?.length || request.image_base64s?.length || 0;
    if (imageCount === 0) {
      throw new Error('至少需要提供一张图片');
    }
    if (imageCount > 14) {
      throw new Error(`最多支持 14 张图片，当前提供了 ${imageCount} 张`);
    }

    // 验证图片引用信息
    if (request.image_references) {
      for (const ref of request.image_references) {
        if (ref.index < 0 || ref.index >= imageCount) {
          throw new Error(`图片引用索引 ${ref.index} 超出范围（0-${imageCount - 1}）`);
        }
      }
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: request.prompt,
        image_urls: request.image_urls,
        image_base64s: request.image_base64s,
        aspect_ratio: request.aspect_ratio,
        size: request.size || '1K',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`PPIO 多图理解请求失败: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return (await response.json()) as PPIOMultiImageResponse;
  }

  /**
   * 图片编辑
   * 
   * @param request 图片编辑请求参数
   * @returns 编辑后的图片 URL 列表
   */
  async editImage(request: PPIOImageEditRequest): Promise<PPIOImageEditResponse> {
    const url = `${this.baseUrl}/v3/gemini-3-pro-image-edit`;

    // 验证参数：必须提供 image_urls 或 image_base64s 之一
    if (!request.image_urls && !request.image_base64s) {
      throw new Error('必须提供 image_urls 或 image_base64s 之一');
    }

    if (request.image_urls && request.image_base64s) {
      throw new Error('不能同时提供 image_urls 和 image_base64s');
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: request.prompt,
        image_urls: request.image_urls,
        image_base64s: request.image_base64s,
        aspect_ratio: request.aspect_ratio,
        size: request.size || '1K',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`PPIO 图片编辑请求失败: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return (await response.json()) as PPIOImageEditResponse;
  }

  /**
   * 将本地图片文件转换为 base64
   * 
   * @param filePath 图片文件路径
   * @returns base64 编码的图片字符串
   */
  async imageToBase64(filePath: string): Promise<string> {
    const fs = await import('fs/promises');
    const imageBuffer = await fs.readFile(filePath);
    return imageBuffer.toString('base64');
  }

  /**
   * 从 URL 下载图片并转换为 base64
   * 
   * @param imageUrl 图片 URL
   * @returns base64 编码的图片字符串
   */
  async imageUrlToBase64(imageUrl: string): Promise<string> {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`下载图片失败: ${response.status} ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return buffer.toString('base64');
  }

  // ==================== 音频 API ====================

  /**
   * MiniMax 音频快速复刻（Voice Cloning）
   * 参考文档：https://ppio.com/docs/models/reference-minimax-voice-cloning
   * 
   * @param request 音色复刻请求参数
   * @returns 复刻结果（包含 voice_id 和 demo_audio_url）
   */
  async voiceCloning(request: {
    audio_url: string; // 需要复刻音色的音频文件 URL（mp3、m4a、wav，10秒-5分钟，<20MB）
    text?: string; // 复刻试听参数，模型将使用复刻后的音色念诵本段文本
    model?: 'speech-02-hd' | 'speech-02-turbo' | 'speech-2.5-hd-preview' | 'speech-2.5-turbo-preview'; // 试听使用的语音模型
    clone_prompt?: {
      prompt_audio_url: string; // 示例音频 URL（时长 < 8s）
      prompt_text: string; // 示例音频的对应文本
    };
    accuracy?: number; // 文本校验准确率阈值 [0,1]，默认 0.7
    need_noise_reduction?: boolean; // 是否开启降噪，默认 false
    need_volume_normalization?: boolean; // 是否开启音量归一化，默认 false
  }): Promise<{
    demo_audio_url?: string; // 试听音频 URL（如果传了 text 和 model）
    voice_id: string; // 生成的 voice_id
  }> {
    const url = `${this.baseUrl}/v3/minimax-voice-cloning`;

    const body: Record<string, any> = {
      audio_url: request.audio_url,
    };

    if (request.text) body.text = request.text;
    if (request.model) body.model = request.model;
    if (request.clone_prompt) body.clone_prompt = request.clone_prompt;
    if (request.accuracy !== undefined) body.accuracy = request.accuracy;
    if (request.need_noise_reduction !== undefined) body.need_noise_reduction = request.need_noise_reduction;
    if (request.need_volume_normalization !== undefined) body.need_volume_normalization = request.need_volume_normalization;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`PPIO 音色复刻失败: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return (await response.json()) as { demo_audio_url?: string; voice_id: string };
  }

  /**
   * MiniMax Speech-02-turbo 同步语音合成
   * 参考文档：https://ppio.com/docs/models/reference-minimax-speech-02-turbo
   * 
   * @param request 语音合成请求参数
   * @returns 同步返回音频 URL 或 hex 数据
   */
  async speech02Turbo(request: {
    text: string; // 待合成的文本，长度限制小于 10000 字符
    voice_setting?: {
      speed?: number; // 语速 [0.5,2]，默认 1.0
      vol?: number; // 音量 (0,10]，默认 1.0
      pitch?: number; // 语调 [-12,12]，默认 0
      voice_id?: string; // 音色编号（系统音色或复刻音色），与 timbre_weights 二选一必填
      emotion?: 'happy' | 'sad' | 'angry' | 'fearful' | 'disgusted' | 'surprised' | 'neutral'; // 情绪
      latex_read?: boolean; // 是否支持朗读 latex 公式，默认 false
      text_normalization?: boolean; // 英语文本规范化，默认 false
    };
    audio_setting?: {
      sample_rate?: 8000 | 16000 | 22050 | 24000 | 32000 | 44100; // 采样率，默认 32000
      bitrate?: 32000 | 64000 | 128000 | 256000; // 比特率，默认 128000（仅 mp3 格式生效）
      format?: 'mp3' | 'pcm' | 'flac' | 'wav'; // 音频格式，默认 mp3
      channel?: 1 | 2; // 声道数，默认 1（单声道）
    };
    pronunciation_dict?: {
      tone?: string[]; // 替换发音，格式：["燕少飞/(yan4)(shao3)(fei1)"]
    };
    timbre_weights?: Array<{
      voice_id: string; // 音色 ID
      weight: number; // 权重 [1,100]
    }>; // 与 voice_id 二选一必填，支持最多 4 种音色混合
    stream?: boolean; // 是否流式输出，默认 false
    stream_options?: {
      exclude_aggregated_audio?: boolean; // 流式最后一个 chunk 是否排除完整音频，默认 false
    };
    language_boost?: string; // 语言增强，如 'Chinese', 'English', 'auto' 等
    output_format?: 'url' | 'hex'; // 输出格式，默认 'hex'，非流式时生效
    voice_modify?: {
      pitch?: number; // 音高调整 [-100,100]
      intensity?: number; // 强度调整 [-100,100]
      timbre?: number; // 音色调整 [-100,100]
      sound_effects?: 'spacious_echo' | 'auditorium_echo' | 'lofi_telephone' | 'robotic'; // 音效
    };
  }): Promise<{
    audio: string; // 音频 URL 或 hex 编码数据
    status?: number; // 流式输出时的状态：1=合成中，2=合成结束
  }> {
    const url = `${this.baseUrl}/v3/minimax-speech-02-turbo`;

    const body: Record<string, any> = {
      text: request.text,
    };

    if (request.voice_setting) body.voice_setting = request.voice_setting;
    if (request.audio_setting) body.audio_setting = request.audio_setting;
    if (request.pronunciation_dict) body.pronunciation_dict = request.pronunciation_dict;
    if (request.timbre_weights) body.timbre_weights = request.timbre_weights;
    if (request.stream !== undefined) body.stream = request.stream;
    if (request.stream_options) body.stream_options = request.stream_options;
    if (request.language_boost) body.language_boost = request.language_boost;
    if (request.output_format) body.output_format = request.output_format;
    if (request.voice_modify) body.voice_modify = request.voice_modify;

    // 调试日志
    if (process.env.DEBUG_PPIO) {
      console.log(`[PPIO Client] 请求 URL: ${url}`);
      console.log(`[PPIO Client] 请求体:`, JSON.stringify(body, null, 2));
      console.log(`[PPIO Client] API Key 存在: ${!!this.config.apiKey}`);
      console.log(`[PPIO Client] Base URL: ${this.baseUrl}`);
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (fetchError) {
      const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
      console.error(`[PPIO Client] Fetch 调用失败:`, {
        url,
        error: errorMessage,
        apiKeyExists: !!this.config.apiKey,
        baseUrl: this.baseUrl,
      });
      throw new Error(`PPIO Speech-02-turbo 同步语音合成失败: fetch 调用失败 - ${errorMessage}。请检查网络连接、API Key 配置和 baseUrl 设置。`);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[PPIO Client] API 响应错误:`, {
        status: response.status,
        statusText: response.statusText,
        errorText,
        url,
      });
      throw new Error(`PPIO Speech-02-turbo 同步语音合成失败: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return (await response.json()) as { audio: string; status?: number };
  }

  /**
   * MiniMax Speech-2.6-hd 同步语音合成
   * 参考文档：https://ppio.com/docs/models/reference-minimax-speech-2.6-hd
   * 
   * @param request 语音合成请求参数
   * @returns 同步返回音频 URL 或 hex 数据
   */
  async speech26Hd(request: {
    text: string;
    voice_setting?: {
      speed?: number;
      vol?: number;
      pitch?: number;
      voice_id?: string;
      emotion?: 'happy' | 'sad' | 'angry' | 'fearful' | 'disgusted' | 'surprised' | 'neutral';
      latex_read?: boolean;
      text_normalization?: boolean;
    };
    audio_setting?: {
      sample_rate?: 8000 | 16000 | 22050 | 24000 | 32000 | 44100;
      bitrate?: 32000 | 64000 | 128000 | 256000;
      format?: 'mp3' | 'pcm' | 'flac' | 'wav';
      channel?: 1 | 2;
    };
    pronunciation_dict?: {
      tone?: string[];
    };
    timbre_weights?: Array<{
      voice_id: string;
      weight: number;
    }>;
    stream?: boolean;
    stream_options?: {
      exclude_aggregated_audio?: boolean;
    };
    language_boost?: string;
    output_format?: 'url' | 'hex';
    voice_modify?: {
      pitch?: number;
      intensity?: number;
      timbre?: number;
      sound_effects?: 'spacious_echo' | 'auditorium_echo' | 'lofi_telephone' | 'robotic';
    };
  }): Promise<{
    audio: string;
    status?: number;
  }> {
    const url = `${this.baseUrl}/v3/minimax-speech-2.6-hd`;

    const body: Record<string, any> = {
      text: request.text,
    };

    if (request.voice_setting) body.voice_setting = request.voice_setting;
    if (request.audio_setting) body.audio_setting = request.audio_setting;
    if (request.pronunciation_dict) body.pronunciation_dict = request.pronunciation_dict;
    if (request.timbre_weights) body.timbre_weights = request.timbre_weights;
    if (request.stream !== undefined) body.stream = request.stream;
    if (request.stream_options) body.stream_options = request.stream_options;
    if (request.language_boost) body.language_boost = request.language_boost;
    if (request.output_format) body.output_format = request.output_format;
    if (request.voice_modify) body.voice_modify = request.voice_modify;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (fetchError) {
      const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
      throw new Error(`PPIO Speech-2.6-hd 同步语音合成失败: fetch 调用失败 - ${errorMessage}`);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`PPIO Speech-2.6-hd 同步语音合成失败: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return (await response.json()) as { audio: string; status?: number };
  }

  /**
   * MiniMax Speech-2.5-turbo 同步语音合成
   * 参考文档：https://ppio.com/docs/models/reference-minimax-speech-2.5-turbo
   * 
   * @param request 语音合成请求参数
   * @returns 同步返回音频 URL 或 hex 数据
   */
  async speech25Turbo(request: {
    text: string;
    voice_setting?: {
      speed?: number;
      vol?: number;
      pitch?: number;
      voice_id?: string;
      emotion?: 'happy' | 'sad' | 'angry' | 'fearful' | 'disgusted' | 'surprised' | 'neutral';
      latex_read?: boolean;
      text_normalization?: boolean;
    };
    audio_setting?: {
      sample_rate?: 8000 | 16000 | 22050 | 24000 | 32000 | 44100;
      bitrate?: 32000 | 64000 | 128000 | 256000;
      format?: 'mp3' | 'pcm' | 'flac' | 'wav';
      channel?: 1 | 2;
    };
    pronunciation_dict?: {
      tone?: string[];
    };
    timbre_weights?: Array<{
      voice_id: string;
      weight: number;
    }>;
    stream?: boolean;
    stream_options?: {
      exclude_aggregated_audio?: boolean;
    };
    language_boost?: string;
    output_format?: 'url' | 'hex';
    voice_modify?: {
      pitch?: number;
      intensity?: number;
      timbre?: number;
      sound_effects?: 'spacious_echo' | 'auditorium_echo' | 'lofi_telephone' | 'robotic';
    };
  }): Promise<{
    audio: string;
    status?: number;
  }> {
    const url = `${this.baseUrl}/v3/minimax-speech-2.5-turbo-preview`;

    const body: Record<string, any> = {
      text: request.text,
    };

    if (request.voice_setting) body.voice_setting = request.voice_setting;
    if (request.audio_setting) body.audio_setting = request.audio_setting;
    if (request.pronunciation_dict) body.pronunciation_dict = request.pronunciation_dict;
    if (request.timbre_weights) body.timbre_weights = request.timbre_weights;
    if (request.stream !== undefined) body.stream = request.stream;
    if (request.stream_options) body.stream_options = request.stream_options;
    if (request.language_boost) body.language_boost = request.language_boost;
    if (request.output_format) body.output_format = request.output_format;
    if (request.voice_modify) body.voice_modify = request.voice_modify;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (fetchError) {
      const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
      throw new Error(`PPIO Speech-2.5-turbo 同步语音合成失败: fetch 调用失败 - ${errorMessage}`);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`PPIO Speech-2.5-turbo 同步语音合成失败: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return (await response.json()) as { audio: string; status?: number };
  }

  /**
   * MiniMax Speech-2.5-hd 同步语音合成
   * 参考文档：https://ppio.com/docs/models/reference-minimax-speech-2.5-hd
   * 
   * @param request 语音合成请求参数
   * @returns 同步返回音频 URL 或 hex 数据
   */
  async speech25Hd(request: {
    text: string;
    voice_setting?: {
      speed?: number;
      vol?: number;
      pitch?: number;
      voice_id?: string;
      emotion?: 'happy' | 'sad' | 'angry' | 'fearful' | 'disgusted' | 'surprised' | 'neutral';
      latex_read?: boolean;
      text_normalization?: boolean;
    };
    audio_setting?: {
      sample_rate?: 8000 | 16000 | 22050 | 24000 | 32000 | 44100;
      bitrate?: 32000 | 64000 | 128000 | 256000;
      format?: 'mp3' | 'pcm' | 'flac' | 'wav';
      channel?: 1 | 2;
    };
    pronunciation_dict?: {
      tone?: string[];
    };
    timbre_weights?: Array<{
      voice_id: string;
      weight: number;
    }>;
    stream?: boolean;
    stream_options?: {
      exclude_aggregated_audio?: boolean;
    };
    language_boost?: string;
    output_format?: 'url' | 'hex';
    voice_modify?: {
      pitch?: number;
      intensity?: number;
      timbre?: number;
      sound_effects?: 'spacious_echo' | 'auditorium_echo' | 'lofi_telephone' | 'robotic';
    };
  }): Promise<{
    audio: string;
    status?: number;
  }> {
    const url = `${this.baseUrl}/v3/minimax-speech-2.5-hd-preview`;

    const body: Record<string, any> = {
      text: request.text,
    };

    if (request.voice_setting) body.voice_setting = request.voice_setting;
    if (request.audio_setting) body.audio_setting = request.audio_setting;
    if (request.pronunciation_dict) body.pronunciation_dict = request.pronunciation_dict;
    if (request.timbre_weights) body.timbre_weights = request.timbre_weights;
    if (request.stream !== undefined) body.stream = request.stream;
    if (request.stream_options) body.stream_options = request.stream_options;
    if (request.language_boost) body.language_boost = request.language_boost;
    if (request.output_format) body.output_format = request.output_format;
    if (request.voice_modify) body.voice_modify = request.voice_modify;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (fetchError) {
      const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
      throw new Error(`PPIO Speech-2.5-hd 同步语音合成失败: fetch 调用失败 - ${errorMessage}`);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`PPIO Speech-2.5-hd 同步语音合成失败: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return (await response.json()) as { audio: string; status?: number };
  }

  /**
   * MiniMax Speech-02-hd 异步语音合成
   * 参考文档：https://ppio.com/docs/models/reference-minimax-speech-02-hd-async
   * 
   * @param request 语音合成请求参数
   * @returns 异步任务 task_id
   */
  async speech02HdAsync(request: {
    text: string; // 待合成的文本，限制最长 5 万字符
    voice_setting?: {
      speed?: number; // 语速 [0.5,2]，默认 1.0
      vol?: number; // 音量 (0,10]，默认 1.0
      pitch?: number; // 语调 [-12,12]，默认 0
      voice_id?: string; // 音色编号（系统音色或复刻音色）
      emotion?: 'happy' | 'sad' | 'angry' | 'fearful' | 'disgusted' | 'surprised' | 'neutral'; // 情绪
      text_normalization?: boolean; // 英语文本规范化，默认 false
    };
    audio_setting?: {
      sample_rate?: 8000 | 16000 | 22050 | 24000 | 32000 | 44100; // 采样率，默认 32000
      bitrate?: 32000 | 64000 | 128000 | 256000; // 比特率，默认 128000（仅 mp3 格式生效）
      format?: 'mp3' | 'pcm' | 'flac' | 'wav'; // 音频格式，默认 mp3
      channel?: 1 | 2; // 声道数，默认 1（单声道）
    };
    pronunciation_dict?: {
      tone?: string[]; // 替换发音，格式：["燕少飞/(yan4)(shao3)(fei1)"]
    };
    language_boost?: string; // 语言增强，如 'Chinese', 'English', 'auto' 等
    voice_modify?: {
      pitch?: number; // 音高调整 [-100,100]
      intensity?: number; // 强度调整 [-100,100]
      timbre?: number; // 音色调整 [-100,100]
      sound_effects?: 'spacious_echo' | 'auditorium_echo' | 'lofi_telephone' | 'robotic'; // 音效
    };
  }): Promise<{
    task_id: string; // 异步任务的 task_id
  }> {
    const url = `${this.baseUrl}/v3/async/minimax-speech-02-hd`;

    const body: Record<string, any> = {
      text: request.text,
      voice_setting: request.voice_setting || {},
      audio_setting: request.audio_setting || {},
    };

    if (request.pronunciation_dict) body.pronunciation_dict = request.pronunciation_dict;
    if (request.language_boost) body.language_boost = request.language_boost;
    if (request.voice_modify) body.voice_modify = request.voice_modify;

    // 调试日志
    if (process.env.DEBUG_PPIO) {
      console.log(`[PPIO Client] 请求 URL: ${url}`);
      console.log(`[PPIO Client] 请求体:`, JSON.stringify(body, null, 2));
      console.log(`[PPIO Client] API Key 存在: ${!!this.config.apiKey}`);
      console.log(`[PPIO Client] Base URL: ${this.baseUrl}`);
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (fetchError) {
      const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
      console.error(`[PPIO Client] Fetch 调用失败:`, {
        url,
        error: errorMessage,
        apiKeyExists: !!this.config.apiKey,
        baseUrl: this.baseUrl,
      });
      throw new Error(`PPIO Speech-02-hd 异步语音合成失败: fetch 调用失败 - ${errorMessage}。请检查网络连接、API Key 配置和 baseUrl 设置。`);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[PPIO Client] API 响应错误:`, {
        status: response.status,
        statusText: response.statusText,
        errorText,
        url,
      });
      throw new Error(`PPIO Speech-02-hd 异步语音合成失败: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return (await response.json()) as { task_id: string };
  }

  /**
   * MiniMax Speech-2.6-hd 异步语音合成
   * 参考文档：https://ppio.com/docs/models/reference-minimax-speech-2.6-hd-async
   * 
   * @param request 语音合成请求参数
   * @returns 异步任务 task_id
   */
  async speech26HdAsync(request: {
    text: string; // 待合成的文本，限制最长 5 万字符
    voice_setting?: {
      speed?: number; // 语速 [0.5,2]，默认 1.0
      vol?: number; // 音量 (0,10]，默认 1.0
      pitch?: number; // 语调 [-12,12]，默认 0
      voice_id?: string; // 音色编号（系统音色或复刻音色）
      emotion?: 'happy' | 'sad' | 'angry' | 'fearful' | 'disgusted' | 'surprised' | 'neutral'; // 情绪
      text_normalization?: boolean; // 英语文本规范化，默认 false
    };
    audio_setting?: {
      sample_rate?: 8000 | 16000 | 22050 | 24000 | 32000 | 44100; // 采样率，默认 32000
      bitrate?: 32000 | 64000 | 128000 | 256000; // 比特率，默认 128000（仅 mp3 格式生效）
      format?: 'mp3' | 'pcm' | 'flac' | 'wav'; // 音频格式，默认 mp3
      channel?: 1 | 2; // 声道数，默认 1（单声道）
    };
    pronunciation_dict?: {
      tone?: string[]; // 替换发音，格式：["燕少飞/(yan4)(shao3)(fei1)"]
    };
    language_boost?: string; // 语言增强，如 'Chinese', 'English', 'auto' 等
    voice_modify?: {
      pitch?: number; // 音高调整 [-100,100]
      intensity?: number; // 强度调整 [-100,100]
      timbre?: number; // 音色调整 [-100,100]
      sound_effects?: 'spacious_echo' | 'auditorium_echo' | 'lofi_telephone' | 'robotic'; // 音效
    };
  }): Promise<{
    task_id: string; // 异步任务的 task_id
  }> {
    const url = `${this.baseUrl}/v3/async/minimax-speech-2.6-hd`;

    const body: Record<string, any> = {
      text: request.text,
      voice_setting: request.voice_setting || {},
      audio_setting: request.audio_setting || {},
    };

    if (request.pronunciation_dict) body.pronunciation_dict = request.pronunciation_dict;
    if (request.language_boost) body.language_boost = request.language_boost;
    if (request.voice_modify) body.voice_modify = request.voice_modify;

    // 调试日志
    if (process.env.DEBUG_PPIO) {
      console.log(`[PPIO Client] 请求 URL: ${url}`);
      console.log(`[PPIO Client] 请求体:`, JSON.stringify(body, null, 2));
      console.log(`[PPIO Client] API Key 存在: ${!!this.config.apiKey}`);
      console.log(`[PPIO Client] Base URL: ${this.baseUrl}`);
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (fetchError) {
      const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
      console.error(`[PPIO Client] Fetch 调用失败:`, {
        url,
        error: errorMessage,
        apiKeyExists: !!this.config.apiKey,
        baseUrl: this.baseUrl,
      });
      throw new Error(`PPIO Speech-2.6-hd 异步语音合成失败: fetch 调用失败 - ${errorMessage}。请检查网络连接、API Key 配置和 baseUrl 设置。`);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[PPIO Client] API 响应错误:`, {
        status: response.status,
        statusText: response.statusText,
        errorText,
        url,
      });
      throw new Error(`PPIO Speech-2.6-hd 异步语音合成失败: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return (await response.json()) as { task_id: string };
  }

  /**
   * MiniMax Speech-2.5-hd-preview 异步语音合成
   * 参考文档：https://ppio.com/docs/models/reference-minimax-speech-2.5-hd-async
   * 
   * @param request 语音合成请求参数
   * @returns 异步任务 task_id
   */
  async speech25HdAsync(request: {
    text: string; // 待合成的文本，限制最长 5 万字符
    voice_setting?: {
      speed?: number; // 语速 [0.5,2]，默认 1.0
      vol?: number; // 音量 (0,10]，默认 1.0
      pitch?: number; // 语调 [-12,12]，默认 0
      voice_id?: string; // 音色编号（系统音色或复刻音色）
      emotion?: 'happy' | 'sad' | 'angry' | 'fearful' | 'disgusted' | 'surprised' | 'neutral'; // 情绪
      text_normalization?: boolean; // 英语文本规范化，默认 false
    };
    audio_setting?: {
      sample_rate?: 8000 | 16000 | 22050 | 24000 | 32000 | 44100; // 采样率，默认 32000
      bitrate?: 32000 | 64000 | 128000 | 256000; // 比特率，默认 128000（仅 mp3 格式生效）
      format?: 'mp3' | 'pcm' | 'flac' | 'wav'; // 音频格式，默认 mp3
      channel?: 1 | 2; // 声道数，默认 1（单声道）
    };
    pronunciation_dict?: {
      tone?: string[]; // 替换发音，格式：["燕少飞/(yan4)(shao3)(fei1)"]
    };
    language_boost?: string; // 语言增强，如 'Chinese', 'English', 'auto' 等
    voice_modify?: {
      pitch?: number; // 音高调整 [-100,100]
      intensity?: number; // 强度调整 [-100,100]
      timbre?: number; // 音色调整 [-100,100]
      sound_effects?: 'spacious_echo' | 'auditorium_echo' | 'lofi_telephone' | 'robotic'; // 音效
    };
  }): Promise<{
    task_id: string; // 异步任务的 task_id
  }> {
    const url = `${this.baseUrl}/v3/async/minimax-speech-2.5-hd-preview`;

    const body: Record<string, any> = {
      text: request.text,
      voice_setting: request.voice_setting || {},
      audio_setting: request.audio_setting || {},
    };

    if (request.pronunciation_dict) body.pronunciation_dict = request.pronunciation_dict;
    if (request.language_boost) body.language_boost = request.language_boost;
    if (request.voice_modify) body.voice_modify = request.voice_modify;

    // 调试日志
    if (process.env.DEBUG_PPIO) {
      console.log(`[PPIO Client] 请求 URL: ${url}`);
      console.log(`[PPIO Client] 请求体:`, JSON.stringify(body, null, 2));
      console.log(`[PPIO Client] API Key 存在: ${!!this.config.apiKey}`);
      console.log(`[PPIO Client] Base URL: ${this.baseUrl}`);
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (fetchError) {
      // fetch 调用本身失败（网络错误、DNS 解析失败等）
      const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
      console.error(`[PPIO Client] Fetch 调用失败:`, {
        url,
        error: errorMessage,
        apiKeyExists: !!this.config.apiKey,
        baseUrl: this.baseUrl,
      });
      throw new Error(`PPIO Speech-2.5-hd 异步语音合成失败: fetch 调用失败 - ${errorMessage}。请检查网络连接、API Key 配置和 baseUrl 设置。`);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[PPIO Client] API 响应错误:`, {
        status: response.status,
        statusText: response.statusText,
        errorText,
        url,
      });
      throw new Error(`PPIO Speech-2.5-hd 异步语音合成失败: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return (await response.json()) as { task_id: string };
  }

  /**
   * MiniMax Speech-2.5-turbo-preview 异步语音合成
   * 参考文档：https://ppio.com/docs/models/reference-minimax-speech-2.5-turbo-async
   * 
   * @param request 语音合成请求参数
   * @returns 异步任务 task_id
   */
  async speech25TurboAsync(request: {
    text: string; // 待合成的文本，限制最长 5 万字符
    voice_setting?: {
      speed?: number; // 语速 [0.5,2]，默认 1.0
      vol?: number; // 音量 (0,10]，默认 1.0
      pitch?: number; // 语调 [-12,12]，默认 0
      voice_id?: string; // 音色编号（系统音色或复刻音色）
      emotion?: 'happy' | 'sad' | 'angry' | 'fearful' | 'disgusted' | 'surprised' | 'neutral'; // 情绪
      text_normalization?: boolean; // 英语文本规范化，默认 false
    };
    audio_setting?: {
      sample_rate?: 8000 | 16000 | 22050 | 24000 | 32000 | 44100; // 采样率，默认 32000
      bitrate?: 32000 | 64000 | 128000 | 256000; // 比特率，默认 128000（仅 mp3 格式生效）
      format?: 'mp3' | 'pcm' | 'flac' | 'wav'; // 音频格式，默认 mp3
      channel?: 1 | 2; // 声道数，默认 1（单声道）
    };
    pronunciation_dict?: {
      tone?: string[]; // 替换发音，格式：["燕少飞/(yan4)(shao3)(fei1)"]
    };
    language_boost?: string; // 语言增强，如 'Chinese', 'English', 'auto' 等
    voice_modify?: {
      pitch?: number; // 音高调整 [-100,100]
      intensity?: number; // 强度调整 [-100,100]
      timbre?: number; // 音色调整 [-100,100]
      sound_effects?: 'spacious_echo' | 'auditorium_echo' | 'lofi_telephone' | 'robotic'; // 音效
    };
  }): Promise<{
    task_id: string; // 异步任务的 task_id
  }> {
    const url = `${this.baseUrl}/v3/async/minimax-speech-2.5-turbo-preview`;

    const body: Record<string, any> = {
      text: request.text,
      voice_setting: request.voice_setting || {},
      audio_setting: request.audio_setting || {},
    };

    if (request.pronunciation_dict) body.pronunciation_dict = request.pronunciation_dict;
    if (request.language_boost) body.language_boost = request.language_boost;
    if (request.voice_modify) body.voice_modify = request.voice_modify;

    // 调试日志
    if (process.env.DEBUG_PPIO) {
      console.log(`[PPIO Client] 请求 URL: ${url}`);
      console.log(`[PPIO Client] 请求体:`, JSON.stringify(body, null, 2));
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (fetchError) {
      const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
      console.error(`[PPIO Client] Fetch 调用失败:`, {
        url,
        error: errorMessage,
        apiKeyExists: !!this.config.apiKey,
        baseUrl: this.baseUrl,
      });
      throw new Error(`PPIO Speech-2.5-turbo 异步语音合成失败: fetch 调用失败 - ${errorMessage}。请检查网络连接、API Key 配置和 baseUrl 设置。`);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[PPIO Client] API 响应错误:`, {
        status: response.status,
        statusText: response.statusText,
        errorText,
        url,
      });
      throw new Error(`PPIO Speech-2.5-turbo 异步语音合成失败: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return (await response.json()) as { task_id: string };
  }

  /**
   * 查询任务结果
   * 用于查询异步任务（如语音合成）的结果
   * 参考文档：https://ppio.com/docs/models/reference-get-async-task-result
   * 
   * @param taskId 任务 ID
   * @returns 任务结果
   */
  async getTaskResult(taskId: string): Promise<{
    task: {
      task_id: string;
      status: 'TASK_STATUS_QUEUED' | 'TASK_STATUS_PROCESSING' | 'TASK_STATUS_SUCCEED' | 'TASK_STATUS_FAILED';
      reason?: string; // 失败原因
      task_type?: string;
      eta?: number; // 预计完成时间（秒）
      progress_percent?: number; // 进度百分比
    };
    audios?: Array<{
      audio_url: string;
      audio_url_ttl: number; // URL 过期时间（秒）
      audio_type: string; // 'wav' 等
      audio_metadata?: {
        text: string;
        start_time: number;
        end_time: number;
      };
    }>;
    images?: Array<{
      image_url: string;
      image_url_ttl: number;
      image_type: string;
    }>;
    videos?: Array<{
      video_url: string;
      video_url_ttl: string;
      video_type: string;
    }>;
    extra?: {
      seed?: string;
      debug_info?: {
        request_info?: string;
        submit_time_ms?: string;
        execute_time_ms?: string;
        complete_time_ms?: string;
      };
    };
  }> {
    const url = `${this.baseUrl}/v3/async/task-result?task_id=${encodeURIComponent(taskId)}`;

    // 调试日志
    if (process.env.DEBUG_PPIO) {
      console.log(`[PPIO Client] 查询任务结果: ${url}`);
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
      });
    } catch (fetchError) {
      const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
      console.error(`[PPIO Client] 查询任务结果失败:`, {
        url,
        error: errorMessage,
        taskId,
      });
      throw new Error(`PPIO 查询任务结果失败: fetch 调用失败 - ${errorMessage}`);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[PPIO Client] 查询任务结果 API 错误:`, {
        status: response.status,
        statusText: response.statusText,
        errorText,
        taskId,
      });
      throw new Error(`PPIO 查询任务结果失败: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const result = (await response.json()) as any;
    
    // 调试日志
    if (process.env.DEBUG_PPIO) {
      console.log(`[PPIO Client] 任务结果:`, {
        taskId,
        status: result.task?.status,
        progress: result.task?.progress_percent,
        hasAudios: !!result.audios && result.audios.length > 0,
        audioCount: result.audios?.length || 0,
      });
    }

    return result;
  }

  /**
   * 获取账户信息
   * 参考文档：https://ppio.com/docs/models/reference-get-user-info
   * 
   * @returns 账户信息（包含余额）
   */
  async getUserInfo(): Promise<{
    credit_balance: number; // 账户余额
    allow_features?: string[]; // 允许的功能列表
    free_trial?: any; // 免费试用信息
  }> {
    const url = `${this.baseUrl}/v3/user`;

    // 调试日志
    if (process.env.DEBUG_PPIO) {
      console.log(`[PPIO Client] 获取账户信息: ${url}`);
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
      });
    } catch (fetchError) {
      const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
      console.error(`[PPIO Client] 获取账户信息失败:`, {
        url,
        error: errorMessage,
      });
      throw new Error(`PPIO 获取账户信息失败: fetch 调用失败 - ${errorMessage}`);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[PPIO Client] 获取账户信息 API 错误:`, {
        status: response.status,
        statusText: response.statusText,
        errorText,
        url,
      });
      throw new Error(`PPIO 获取账户信息失败: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return (await response.json()) as { credit_balance: number; allow_features?: string[]; free_trial?: any };
  }

  /**
   * 查询账单
   * 参考文档：https://ppio.com/docs/models/reference-get-bill-pay-as-you-model
   * 
   * @param options 查询参数
   * @returns 账单列表
   */
  async getBills(options?: {
    cycleType?: 'Hour' | 'Day' | 'Week' | 'Month'; // 账单统计粒度
    productCategory?: 'llm' | 'gen_api' | 'summary' | 'gpu' | 'serverless' | 'cloud_storage' | 'cloud_sandbox' | 'llm_dedicated_endpoint' | 'web_search' | string; // 产品类型
    startTime?: string; // 开始时间（Unix 时间戳）
    endTime?: string; // 结束时间（Unix 时间戳）
  }): Promise<{
    bills: Array<{
      userId: string;
      startTime: string;
      endTime: string;
      billingMethod: string | number; // 计费方式，0 或 "1" 表示按量计费
      productName: string;
      category: string;
      ownerID: string;
      billNum0: string; // llm 时表示输入 Token
      billNum1: string; // llm 时表示输出 Token
      basePrice0: string; // 原价
      basePrice1: string;
      discountPrice0: string; // 单价（llm 时表示输入 Token 单价）
      discountPrice1: string; // llm 时表示输出 Token 单价
      amount: string; // 总价
      voucherAmount: string; // 代金券抵扣费用
      payAmount: string; // 现金支付费用
      payAmountDisplay?: number; // 现金支付费用（显示值）
      pricePrecision: string | number; // 价格精度
      productId?: string; // 产品 ID
      basePrice2?: string; // 扩展价格字段
      basePrice3?: string;
      basePrice4?: string;
      discountPrice2?: string; // 扩展单价字段
      discountPrice3?: string;
      discountPrice4?: string;
      billNum2?: string; // 扩展数量字段
      billNum3?: string;
      billNum4?: string;
      llmSeries?: string; // LLM 系列
    }>;
  }> {
    const url = new URL(`${this.baseUrl}/openapi/v1/billing/bill/list`);

    // 添加查询参数（所有参数都是可选的）
    // 如果不传参数，API 会返回所有数据
    if (options?.cycleType) {
      url.searchParams.append('cycleType', options.cycleType);
    }
    if (options?.productCategory) {
      url.searchParams.append('productCategory', options.productCategory);
    }
    if (options?.startTime) {
      url.searchParams.append('startTime', options.startTime);
    }
    if (options?.endTime) {
      url.searchParams.append('endTime', options.endTime);
    }

    // 调试日志
    if (process.env.DEBUG_PPIO) {
      console.log(`[PPIO Client] 查询账单: ${url.toString()}`);
    }

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
      });
    } catch (fetchError) {
      const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
      console.error(`[PPIO Client] 查询账单失败:`, {
        url: url.toString(),
        error: errorMessage,
      });
      throw new Error(`PPIO 查询账单失败: fetch 调用失败 - ${errorMessage}`);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[PPIO Client] 查询账单 API 错误:`, {
        status: response.status,
        statusText: response.statusText,
        errorText,
        url: url.toString(),
      });
      throw new Error(`PPIO 查询账单失败: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return (await response.json()) as any;
  }
}
