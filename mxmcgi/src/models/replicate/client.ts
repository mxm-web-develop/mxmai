/**
 * Replicate 客户端
 *
 * 用于通过 Replicate 调用各种 AI 模型
 * 支持图片生成、文本生成等功能
 */

import Replicate from 'replicate';

export interface ReplicateConfig {
  apiKey?: string;
}

export interface ReplicateTextToImageRequest {
  prompt: string;
  aspect_ratio?:
    | '1:1'
    | '3:2'
    | '2:3'
    | '3:4'
    | '4:3'
    | '4:5'
    | '5:4'
    | '9:16'
    | '16:9'
    | '21:9';
  image_size?: '1K' | '2K' | '4K';
}

export interface ReplicateImageEditRequest {
  prompt: string;
  image?: string; // 图片 URL 或 base64
  aspect_ratio?:
    | '1:1'
    | '3:2'
    | '2:3'
    | '3:4'
    | '4:3'
    | '4:5'
    | '5:4'
    | '9:16'
    | '16:9'
    | '21:9';
  image_size?: '1K' | '2K' | '4K';
}

export interface ReplicateTextToImageResponse {
  image_urls: string[];
}

export interface ReplicateImageEditResponse {
  image_urls: string[];
}

/**
 * Replicate 客户端类
 */
export class ReplicateClient {
  private replicate: Replicate;

  constructor(config?: ReplicateConfig) {
    const apiKey = config?.apiKey || process.env.REPLICATE_API_TOKEN;

    if (!apiKey) {
      throw new Error(
        'REPLICATE_API_TOKEN 环境变量必须设置，或通过 config.apiKey 提供',
      );
    }

    this.replicate = new Replicate({
      auth: apiKey,
    });
  }

  /**
   * 从环境变量创建客户端
   */
  static fromEnv(): ReplicateClient {
    return new ReplicateClient();
  }

  /**
   * 获取 Replicate 实例（用于直接调用 Replicate API）
   */
  getReplicate(): Replicate {
    return this.replicate;
  }

  /**
   * 文本生成图片（使用 nano-banana-pro 模型）
   *
   * @param request 文生图请求参数
   * @param model 模型标识符，默认为 'google/nano-banana-pro'
   * @returns 生成的图片 URL 列表
   */
  async textToImage(
    request: ReplicateTextToImageRequest,
    model: `${string}/${string}` = 'google/nano-banana-pro',
  ): Promise<ReplicateTextToImageResponse> {
    if (process.env.DEBUG_REPLICATE) {
      console.log(`📤 使用 Replicate 调用 ${model}...`);
      console.log('📤 请求参数:', JSON.stringify(request, null, 2));
    }

    try {
      // Replicate 的输入格式
      const input: Record<string, any> = {
        prompt: request.prompt,
      };

      // 添加可选参数
      if (request.aspect_ratio) {
        input.aspect_ratio = request.aspect_ratio;
      }
      if (request.image_size) {
        input.image_size = request.image_size;
      }

      if (process.env.DEBUG_REPLICATE) {
        console.log('📤 Replicate 输入:', JSON.stringify(input, null, 2));
      }

      // 调用 Replicate API
      const output = (await this.replicate.run(model, {
        input,
      })) as string | string[];

      // Replicate 返回的可能是单个 URL 或 URL 数组
      const imageUrls = Array.isArray(output) ? output : [output];

      if (process.env.DEBUG_REPLICATE) {
        console.log('📥 Replicate 响应:', imageUrls);
      }

      return {
        image_urls: imageUrls.filter(
          (url): url is string => typeof url === 'string' && url.length > 0,
        ),
      };
    } catch (error) {
      console.error('❌ Replicate 请求失败:', error);
      throw new Error(
        `Replicate 文生图请求失败: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * 图片编辑（使用 nano-banana-pro 模型）
   *
   * @param request 图片编辑请求参数
   * @param model 模型标识符，默认为 'google/nano-banana-pro'
   * @returns 编辑后的图片 URL 列表
   */
  async editImage(
    request: ReplicateImageEditRequest,
    model: `${string}/${string}` = 'google/nano-banana-pro',
  ): Promise<ReplicateImageEditResponse> {
    if (process.env.DEBUG_REPLICATE) {
      console.log(`📤 使用 Replicate 调用 ${model} 进行图片编辑...`);
      console.log(
        '📤 请求参数:',
        JSON.stringify(
          { ...request, image: request.image ? '[已提供]' : undefined },
          null,
          2,
        ),
      );
    }

    if (!request.image) {
      throw new Error('必须提供 image 参数（图片 URL 或 base64）');
    }

    try {
      const input: Record<string, any> = {
        prompt: request.prompt,
        image: request.image,
      };

      // 添加可选参数
      if (request.aspect_ratio) {
        input.aspect_ratio = request.aspect_ratio;
      }
      if (request.image_size) {
        input.image_size = request.image_size;
      }

      if (process.env.DEBUG_REPLICATE) {
        console.log(
          '📤 Replicate 输入:',
          JSON.stringify({ ...input, image: '[已提供]' }, null, 2),
        );
      }

      // 调用 Replicate API
      const output = (await this.replicate.run(model, {
        input,
      })) as string | string[];

      // Replicate 返回的可能是单个 URL 或 URL 数组
      const imageUrls = Array.isArray(output) ? output : [output];

      if (process.env.DEBUG_REPLICATE) {
        console.log('📥 Replicate 响应:', imageUrls);
      }

      return {
        image_urls: imageUrls.filter(
          (url): url is string => typeof url === 'string' && url.length > 0,
        ),
      };
    } catch (error) {
      console.error('❌ Replicate 请求失败:', error);
      throw new Error(
        `Replicate 图片编辑请求失败: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * 将本地图片文件转换为 base64
   *
   * @param filePath 图片文件路径
   * @returns base64 编码的图片字符串（带 data URI 前缀）
   */
  async imageToBase64(filePath: string): Promise<string> {
    const fs = await import('fs/promises');
    const imageBuffer = await fs.readFile(filePath);
    const base64 = imageBuffer.toString('base64');

    // 检测 MIME 类型
    const ext = filePath.toLowerCase().split('.').pop();
    const mimeType =
      ext === 'png'
        ? 'image/png'
        : ext === 'jpg' || ext === 'jpeg'
        ? 'image/jpeg'
        : ext === 'webp'
        ? 'image/webp'
        : 'image/png';

    return `data:${mimeType};base64,${base64}`;
  }

  /**
   * 从 URL 下载图片并转换为 base64 data URI
   *
   * @param imageUrl 图片 URL
   * @returns base64 data URI 字符串
   */
  async imageUrlToBase64(imageUrl: string): Promise<string> {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`下载图片失败: ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString('base64');

    // 从 Content-Type 获取 MIME 类型，或从 URL 推断
    const contentType = response.headers.get('content-type') || 'image/png';

    return `data:${contentType};base64,${base64}`;
  }
}

