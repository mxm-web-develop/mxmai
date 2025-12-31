/**
 * Flux Fast (Flux 1.1 Pro)
 * $0.04  
 * 快速图片生成模型
 */

import { providerFactory, GenerateParams, GenerateResult, ProviderType } from '../providers';

export interface FluxFastParams extends GenerateParams {
  aspect_ratio?: '1:1' | '3:2' | '2:3' | '3:4' | '4:3' | '4:5' | '5:4' | '9:16' | '16:9' | '21:9';
  num_outputs?: number;
  output_format?: 'png' | 'jpg' | 'webp';
  safety_tolerance?: number;
}

export interface FluxFastResult extends GenerateResult {
  image_urls: string[];
}

/**
 * 生成图片
 */
export async function generate(
  params: FluxFastParams,
  provider?: ProviderType
): Promise<FluxFastResult> {
  const modelName = 'flux-fast';
  
  try {
    const modelProvider = providerFactory.getProviderForModel(modelName, provider);
    
    const generateParams: GenerateParams = {
      prompt: params.prompt,
      negativePrompt: params.negativePrompt,
      parameters: {
        aspect_ratio: params.aspect_ratio,
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
    };
  } catch (error) {
    throw new Error(`Flux Fast 生成失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 文本生成图片
 */
export async function textToImage(
  prompt: string,
  options?: {
    aspect_ratio?: FluxFastParams['aspect_ratio'];
    num_outputs?: number;
    output_format?: FluxFastParams['output_format'];
    provider?: ProviderType;
  }
): Promise<FluxFastResult> {
  return generate({
    prompt,
    aspect_ratio: options?.aspect_ratio,
    num_outputs: options?.num_outputs,
    output_format: options?.output_format,
  }, options?.provider);
}
