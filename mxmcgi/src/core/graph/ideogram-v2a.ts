/**
 * Ideogram V2 $0.08
 * 'None' | 'Auto' | 'General' | 'Realistic' | 'Design' | 'Render 3D' | 'Anime'
 * 用于生产插图的模型
 * 擅长生成包含文字的图片
 */

import { providerFactory, GenerateParams, GenerateResult, ProviderType } from '../providers';

export interface IdeogramV2AParams extends GenerateParams {
  aspect_ratio?: '1:1' | '3:2' | '2:3' | '3:4' | '4:3' | '4:5' | '5:4' | '9:16' | '16:9' | '21:9';
  resolution?: 'Auto' | string;
  turbo?: boolean; // 是否使用快速模式
  magic_prompt_option?: 'AUTO' | 'ON' | 'OFF';
  seed?: number; // 随机种子 (0-2147483647)
  style_type?: 'None' | 'Auto' | 'General' | 'Realistic' | 'Design' | 'Render 3D' | 'Anime'; // 注意：API 要求首字母大写格式
  num_images?: number; // 生成图片数量 (1-8)
}

export interface IdeogramV2AResult extends GenerateResult {
  image_urls: string[];
}

/**
 * 生成图片
 */
export async function generate(
  params: IdeogramV2AParams,
  provider?: ProviderType
): Promise<IdeogramV2AResult> {
  const modelName = 'ideogram-v2a';
  
  try {
    const modelProvider = providerFactory.getProviderForModel(modelName, provider);
    
    const generateParams: GenerateParams = {
      prompt: params.prompt,
      negativePrompt: params.negativePrompt,
      parameters: {
        aspect_ratio: params.aspect_ratio,
        resolution: params.resolution,
        turbo: params.turbo,
        magic_prompt_option: params.magic_prompt_option,
        seed: params.seed,
        style_type: params.style_type,
        num_images: params.num_images,
        ...params.parameters,
      },
    };

    const result = await modelProvider.generate(modelName, generateParams);

    return {
      ...result,
      image_urls: result.mediaUrls,
    };
  } catch (error) {
    throw new Error(`Ideogram V2A 生成失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 文本生成图片
 */
export async function textToImage(
  prompt: string,
  options?: {
    aspect_ratio?: IdeogramV2AParams['aspect_ratio'];
    resolution?: IdeogramV2AParams['resolution'];
    turbo?: boolean;
    style_type?: IdeogramV2AParams['style_type'];
    num_images?: number;
    provider?: ProviderType;
  }
): Promise<IdeogramV2AResult> {
  return generate({
    prompt,
    aspect_ratio: options?.aspect_ratio,
    resolution: options?.resolution,
    turbo: options?.turbo,
    style_type: options?.style_type,
    num_images: options?.num_images,
  }, options?.provider);
}
