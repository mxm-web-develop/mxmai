/**
 * Recraft V3 Crisp Upscale
 * 
 * 支持图片生成和编辑
 * 提供高质量图片放大
 */

import { providerFactory, GenerateParams, GenerateResult, ProviderType } from '../providers';

export interface RecraftCrispUpscaleParams extends GenerateParams {
  image_size?: 'square_hd' | 'square' | 'portrait_4_3' | 'portrait_16_9' | 'landscape_4_3' | 'landscape_16_9';
  style?: 'realistic_image' | 'digital_illustration' | 'vector_illustration' | 
         'realistic_image/b_and_w' | 'digital_illustration/pixel_art' | 'vector_illustration/line_art' | string;
  colors?: Array<{ r: number; g: number; b: number }>; // 颜色约束
  num_images?: number; // 生成图片数量
  input_image?: string; // 输入图片（用于编辑或放大）
}

export interface RecraftCrispUpscaleResult extends GenerateResult {
  image_urls: string[];
}

/**
 * 生成图片
 */
export async function generate(
  params: RecraftCrispUpscaleParams,
  provider?: ProviderType
): Promise<RecraftCrispUpscaleResult> {
  const modelName = 'recraft-crisp-upscale';
  
  try {
    const modelProvider = providerFactory.getProviderForModel(modelName, provider);
    
    const generateParams: GenerateParams = {
      prompt: params.prompt || '', // recraft-crisp-upscale 可能不需要 prompt（放大模式）
      negativePrompt: params.negativePrompt,
      parameters: {
        image_size: params.image_size,
        style: params.style,
        colors: params.colors,
        num_images: params.num_images,
        // 注意：Replicate 的 recraft-crisp-upscale 使用 'image' 而不是 'input_image'
        image: params.input_image, // 转换为 'image' 参数
        ...params.parameters,
      },
    };
    
    // 如果 parameters 中已经有 image，使用它；否则使用 input_image
    if (params.parameters?.image) {
      generateParams.parameters!.image = params.parameters.image;
    } else if (params.input_image) {
      generateParams.parameters!.image = params.input_image;
    }
    
    // 移除 input_image，因为已经转换为 image
    if (generateParams.parameters!.input_image) {
      delete generateParams.parameters!.input_image;
    }

    const result = await modelProvider.generate(modelName, generateParams);

    return {
      ...result,
      image_urls: result.mediaUrls,
    };
  } catch (error) {
    throw new Error(`Recraft Crisp Upscale 生成失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 文本生成图片
 */
export async function textToImage(
  prompt: string,
  options?: {
    image_size?: RecraftCrispUpscaleParams['image_size'];
    style?: RecraftCrispUpscaleParams['style'];
    colors?: RecraftCrispUpscaleParams['colors'];
    num_images?: number;
    provider?: ProviderType;
  }
): Promise<RecraftCrispUpscaleResult> {
  return generate({
    prompt,
    image_size: options?.image_size,
    style: options?.style,
    colors: options?.colors,
    num_images: options?.num_images,
  }, options?.provider);
}

/**
 * 图片放大
 */
export async function upscaleImage(
  inputImage: string,
  options?: {
    style?: RecraftCrispUpscaleParams['style'];
    provider?: ProviderType;
  }
): Promise<RecraftCrispUpscaleResult> {
  // recraft-crisp-upscale 是专门的放大模型，只需要 image 参数
  // 注意：Replicate 的 recraft-crisp-upscale 使用 'image' 而不是 'input_image'
  return generate({
    prompt: '', // 放大模型不需要 prompt
    parameters: {
      image: inputImage, // 使用 'image' 参数
      style: options?.style,
    },
  }, options?.provider);
}
