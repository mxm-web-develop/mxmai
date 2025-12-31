/**
 * Flux Kontext Fast
 * flux-kontext-pro $0.08
 * 支持图编辑，快速，便宜
 */

import { providerFactory, GenerateParams, GenerateResult, ProviderType } from '../providers';

export interface FluxKontextFastParams extends GenerateParams {
  aspect_ratio?: '1:1' | '3:2' | '2:3' | '3:4' | '4:3' | '4:5' | '5:4' | '9:16' | '16:9' | '21:9';
  input_image?: string; // 输入图片 URL 或 base64（用于编辑）
  num_outputs?: number; // 生成图片数量
  output_format?: 'png' | 'jpg' | 'webp';
  safety_tolerance?: number; // 安全过滤级别
}

export interface FluxKontextFastResult extends GenerateResult {
  image_urls: string[];
}

/**
 * 生成图片
 */
export async function generate(
  params: FluxKontextFastParams,
  provider?: ProviderType
): Promise<FluxKontextFastResult> {
  const modelName = 'flux-kontext-fast';
  
  try {
    const modelProvider = providerFactory.getProviderForModel(modelName, provider);
    
    const generateParams: GenerateParams = {
      prompt: params.prompt,
      negativePrompt: params.negativePrompt,
      parameters: {
        aspect_ratio: params.aspect_ratio,
        input_image: params.input_image,
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
    throw new Error(`Flux Kontext Fast 生成失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 文本生成图片
 */
export async function textToImage(
  prompt: string,
  options?: {
    aspect_ratio?: FluxKontextFastParams['aspect_ratio'];
    num_outputs?: number;
    output_format?: FluxKontextFastParams['output_format'];
    provider?: ProviderType;
  }
): Promise<FluxKontextFastResult> {
  return generate({
    prompt,
    aspect_ratio: options?.aspect_ratio,
    num_outputs: options?.num_outputs,
    output_format: options?.output_format,
  }, options?.provider);
}

/**
 * 图片编辑
 */
export async function editImage(
  prompt: string,
  inputImage: string,
  options?: {
    aspect_ratio?: FluxKontextFastParams['aspect_ratio'];
    num_outputs?: number;
    output_format?: FluxKontextFastParams['output_format'];
    provider?: ProviderType;
  }
): Promise<FluxKontextFastResult> {
  return generate({
    prompt,
    input_image: inputImage,
    aspect_ratio: options?.aspect_ratio,
    num_outputs: options?.num_outputs,
    output_format: options?.output_format,
  }, options?.provider);
}
