/**
 * Seedream 4 (ByteDance)
 * $0.03
 * 统一的文本生成图片和图片编辑模型
 * 支持高分辨率（最高 4K）、多参考图片、批量生成
 */

import { providerFactory, GenerateParams, GenerateResult, ProviderType } from '../providers';

export interface Seedream4Params extends GenerateParams {
  size?: '1K' | '2K' | '4K' | 'custom';
  aspect_ratio?: string; // 宽高比，默认 'match_input_image'
  width?: number; // 自定义宽度（1024-4096），当 size='custom' 时使用
  height?: number; // 自定义高度（1024-4096），当 size='custom' 时使用
  image_input?: string[]; // 输入图片数组（1-10张），用于图片编辑或多参考生成
  sequential_image_generation?: 'disabled' | 'auto'; // 是否启用序列图片生成
  max_images?: number; // 最大生成图片数（1-15），当 sequential_image_generation='auto' 时使用
  enableProgress?: boolean; // 是否启用进度监控
}

export interface Seedream4Result extends GenerateResult {
  image_urls: string[];
  progress?: AsyncIterable<any>; // 进度监控流
}

/**
 * 生成图片
 */
export async function generate(
  params: Seedream4Params,
  provider?: ProviderType
): Promise<Seedream4Result> {
  const modelName = 'seedream-4';
  
  try {
    const modelProvider = providerFactory.getProviderForModel(modelName, provider);
    
    const generateParams: GenerateParams = {
      prompt: params.prompt,
      negativePrompt: params.negativePrompt,
      enableProgress: params.enableProgress,
      parameters: {
        size: params.size,
        aspect_ratio: params.aspect_ratio,
        width: params.width,
        height: params.height,
        image_input: params.image_input,
        sequential_image_generation: params.sequential_image_generation,
        max_images: params.max_images,
        ...params.parameters,
      },
    };

    const result = await modelProvider.generate(modelName, generateParams);

    return {
      ...result,
      image_urls: result.mediaUrls,
      progress: result.progress, // 传递进度流
    };
  } catch (error) {
    throw new Error(`Seedream 4 生成失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 文本生成图片
 */
export async function textToImage(
  prompt: string,
  options?: {
    size?: Seedream4Params['size'];
    aspect_ratio?: string;
    width?: number;
    height?: number;
    sequential_image_generation?: Seedream4Params['sequential_image_generation'];
    max_images?: number;
    provider?: ProviderType;
  }
): Promise<Seedream4Result> {
  return generate({
    prompt,
    size: options?.size,
    aspect_ratio: options?.aspect_ratio,
    width: options?.width,
    height: options?.height,
    sequential_image_generation: options?.sequential_image_generation,
    max_images: options?.max_images,
  }, options?.provider);
}

/**
 * 图片编辑
 */
export async function editImage(
  prompt: string,
  inputImage: string | string[],
  options?: {
    size?: Seedream4Params['size'];
    aspect_ratio?: string;
    width?: number;
    height?: number;
    provider?: ProviderType;
  }
): Promise<Seedream4Result> {
  const imageInput = Array.isArray(inputImage) ? inputImage : [inputImage];
  
  return generate({
    prompt,
    image_input: imageInput,
    size: options?.size,
    aspect_ratio: options?.aspect_ratio,
    width: options?.width,
    height: options?.height,
  }, options?.provider);
}

/**
 * 多参考图片生成
 */
export async function multiReferenceGeneration(
  prompt: string,
  referenceImages: string[],
  options?: {
    size?: Seedream4Params['size'];
    aspect_ratio?: string;
    sequential_image_generation?: Seedream4Params['sequential_image_generation'];
    max_images?: number;
    provider?: ProviderType;
  }
): Promise<Seedream4Result> {
  return generate({
    prompt,
    image_input: referenceImages,
    size: options?.size,
    aspect_ratio: options?.aspect_ratio,
    sequential_image_generation: options?.sequential_image_generation,
    max_images: options?.max_images,
  }, options?.provider);
}
