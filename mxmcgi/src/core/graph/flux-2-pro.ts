/**
 * Flux 2 Pro (Flux 2 Professional)
 * 
 * 高质量图片生成模型
 */

import { providerFactory, GenerateParams, GenerateResult, ProviderType } from '../providers';

export interface Flux2ProParams extends GenerateParams {
  aspect_ratio?: '1:1' | '3:2' | '2:3' | '3:4' | '4:3' | '4:5' | '5:4' | '9:16' | '16:9' | '21:9';
  image_size?: '1K' | '2K' | '4K';
  num_outputs?: number;
  output_format?: 'png' | 'jpg' | 'webp';
  safety_tolerance?: number;
  enableProgress?: boolean;
}

export interface Flux2ProResult extends GenerateResult {
  image_urls: string[];
  progress?: AsyncIterable<any>;
}

/**
 * 生成图片
 */
export async function generate(
  params: Flux2ProParams,
  provider?: ProviderType
): Promise<Flux2ProResult> {
  const modelName = 'flux-2-pro';
  
  try {
    const modelProvider = providerFactory.getProviderForModel(modelName, provider);
    
    const generateParams: GenerateParams = {
      prompt: params.prompt,
      negativePrompt: params.negativePrompt,
      enableProgress: params.enableProgress,
      parameters: {
        aspect_ratio: params.aspect_ratio,
        image_size: params.image_size,
        num_outputs: params.num_outputs,
        output_format: params.output_format,
        safety_tolerance: params.safety_tolerance,
        ...params.parameters,
      },
    };

    const result = await modelProvider.generate(modelName, generateParams);

    return {
      ...result,
      image_urls: result.mediaUrls,
      progress: result.progress,
    };
  } catch (error) {
    throw new Error(`Flux 2 Pro 生成失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 文本生成图片
 */
export async function textToImage(
  prompt: string,
  options?: {
    aspect_ratio?: Flux2ProParams['aspect_ratio'];
    num_outputs?: number;
    output_format?: Flux2ProParams['output_format'];
    provider?: ProviderType;
  }
): Promise<Flux2ProResult> {
  return generate({
    prompt,
    aspect_ratio: options?.aspect_ratio,
    num_outputs: options?.num_outputs,
    output_format: options?.output_format,
  }, options?.provider);
}
