/**
 * Nano Banana (Google Gemini 3 Pro Image Preview)
 * 
 * 支持图片生成和编辑
 * 支持多图理解和合成
 */

import { providerFactory, GenerateParams, GenerateResult, ProviderType } from '../providers';

export interface NanoBananaParams extends GenerateParams {
  aspect_ratio?: '1:1' | '3:2' | '2:3' | '3:4' | '4:3' | '4:5' | '5:4' | '9:16' | '16:9' | '21:9';
  image_size?: '1K' | '2K' | '4K';
  image?: string; // 图片 URL 或 base64（用于编辑）
  image_urls?: string[]; // 多图 URL 列表
  image_base64s?: string[]; // 多图 base64 列表
  enableProgress?: boolean; // 是否启用进度监控（默认 true）
}

export interface NanoBananaResult extends GenerateResult {
  image_urls: string[];
  progress?: AsyncIterable<any>; // 进度监控流
}

/**
 * 生成图片
 */
export async function generate(
  params: NanoBananaParams,
  provider?: ProviderType
): Promise<NanoBananaResult> {
  const modelName = 'nano-banana';
  
  try {
    const modelProvider = providerFactory.getProviderForModel(modelName, provider);
    
    // 构建生成参数
    const generateParams: GenerateParams = {
      prompt: params.prompt,
      negativePrompt: params.negativePrompt,
      enableProgress: params.enableProgress,
      parameters: {
        aspect_ratio: params.aspect_ratio,
        image_size: params.image_size,
        ...params.parameters,
      },
    };

    // 如果是编辑模式，添加图片参数
    if (params.image) {
      generateParams.parameters = {
        ...generateParams.parameters,
        image: params.image,
      };
      console.log(`[nano-banana] 使用单张图片参数 (image):`, typeof params.image === 'string' ? params.image.substring(0, 100) : params.image);
    } else if (params.image_urls && params.image_urls.length > 0) {
      generateParams.parameters = {
        ...generateParams.parameters,
        image_urls: params.image_urls,
      };
      console.log(`[nano-banana] 使用多图URL参数 (image_urls):`, {
        count: params.image_urls.length,
        urls: params.image_urls.slice(0, 2)
      });
    } else if (params.image_base64s && params.image_base64s.length > 0) {
      generateParams.parameters = {
        ...generateParams.parameters,
        image_base64s: params.image_base64s,
      };
      console.log(`[nano-banana] 使用多图Base64参数 (image_base64s):`, {
        count: params.image_base64s.length,
        preview: params.image_base64s[0]?.substring(0, 50) + '...'
      });
    } else {
      console.warn(`[nano-banana] 没有找到图片参数，params keys:`, Object.keys(params));
    }

    const result = await modelProvider.generate(modelName, generateParams);

    return {
      ...result,
      image_urls: result.mediaUrls,
      progress: result.progress, // 传递进度流
    };
  } catch (error) {
    throw new Error(`Nano Banana 生成失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 文本生成图片
 */
export async function textToImage(
  prompt: string,
  options?: {
    aspect_ratio?: NanoBananaParams['aspect_ratio'];
    image_size?: NanoBananaParams['image_size'];
    provider?: ProviderType;
  }
): Promise<NanoBananaResult> {
  return generate({
    prompt,
    aspect_ratio: options?.aspect_ratio,
    image_size: options?.image_size,
  }, options?.provider);
}

/**
 * 图片编辑
 */
export async function editImage(
  prompt: string,
  image: string,
  options?: {
    aspect_ratio?: NanoBananaParams['aspect_ratio'];
    image_size?: NanoBananaParams['image_size'];
    provider?: ProviderType;
  }
): Promise<NanoBananaResult> {
  return generate({
    prompt,
    image,
    aspect_ratio: options?.aspect_ratio,
    image_size: options?.image_size,
  }, options?.provider);
}

/**
 * 多图理解和合成
 */
export async function multiImageGeneration(
  prompt: string,
  images: string[] | { urls?: string[]; base64s?: string[] },
  options?: {
    aspect_ratio?: NanoBananaParams['aspect_ratio'];
    image_size?: NanoBananaParams['image_size'];
    provider?: ProviderType;
  }
): Promise<NanoBananaResult> {
  const params: NanoBananaParams = {
    prompt,
    aspect_ratio: options?.aspect_ratio,
    image_size: options?.image_size,
  };

  if (Array.isArray(images)) {
    params.image_urls = images;
  } else {
    params.image_urls = images.urls;
    params.image_base64s = images.base64s;
  }

  return generate(params, options?.provider);
}
