/**
 * Sora 2 Pro 视频生成
 * 
 * 支持文本生成视频，可选图像参考
 */

import { providerFactory, GenerateParams, GenerateResult, ProviderType } from '../providers';
import { Sora2Params, Sora2Result } from './sora-2';

/**
 * 生成视频（使用 sora-2-pro 模型）
 */
export async function generate(
  params: Sora2Params,
  provider?: ProviderType
): Promise<Sora2Result> {
  const modelName = 'sora-2-pro'; // 固定使用 sora-2-pro 模型
  
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
    throw new Error(`Sora 2 Pro 视频生成失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}
