/**
 * Sora 2 视频生成
 * 
 * 支持文本生成视频，可选图像参考
 */

import { providerFactory, GenerateParams, GenerateResult, ProviderType } from '../providers';

export interface Sora2Params extends GenerateParams {
  seconds?: '4' | '8' | '12';
  size?: '720x1280' | '1280x720' | '1024x1792' | '1792x1024';
  input_reference?: string; // 图像参考（base64 或 URL）
  enableProgress?: boolean; // 是否启用进度监控（默认 true）
}

export interface Sora2Result extends GenerateResult {
  video_urls: string[];
  progress?: AsyncIterable<any>; // 进度监控流
}

/**
 * 生成视频
 */
export async function generate(
  params: Sora2Params,
  provider?: ProviderType
): Promise<Sora2Result> {
  const modelName = 'sora-2'; // 固定使用 sora-2 模型
  
  try {
    const modelProvider = providerFactory.getProviderForModel(modelName, provider);
    
    // 构建生成参数（不包含 model，由 provider 根据模型名自动设置）
    const generateParams: GenerateParams = {
      prompt: params.prompt,
      enableProgress: params.enableProgress,
      parameters: {
        seconds: params.seconds,
        size: params.size,
        input_reference: params.input_reference,
        ...params.parameters,
      },
    };

    const result = await modelProvider.generate(modelName, generateParams);

    return {
      ...result,
      video_urls: result.mediaUrls,
      progress: result.progress, // 传递进度流
    };
  } catch (error) {
    throw new Error(`Sora 2 视频生成失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}
