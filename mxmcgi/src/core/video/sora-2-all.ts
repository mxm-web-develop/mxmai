/**
 * Sora 2 All（逆向异步，自研格式）视频生成
 *
 * 使用 DeerAPI 的自研 Sora 接口：
 * - 文档：https://apidoc.deerapi.com/sora/self-developed/create
 *
 * 注意：
 * - 模型 ID 固定为 sora-2-all
 * - 支持的 seconds：10 / 15（不支持 25）
 * - 支持的分辨率：720x1280 / 1280x720 / 1024x1792 / 1792x1024
 * - 也支持角色一致性参数（character_url, character_timestamps）
 */

import { providerFactory, GenerateParams, GenerateResult, ProviderType } from '../providers';

export interface Sora2AllParams extends GenerateParams {
  seconds?: '10' | '15';
  size?: '720x1280' | '1280x720' | '1024x1792' | '1792x1024';
  /**
   * 图像参考（Base64 或 URL，经由上层转换为 Base64）
   */
  input_reference?: string;
  /**
   * 角色一致性参数（可选，自研接口支持）
   */
  character_url?: string;
  character_timestamps?: string; // 例如 "1,8"
  enableProgress?: boolean;
}

export interface Sora2AllResult extends GenerateResult {
  video_urls: string[];
  progress?: AsyncIterable<any>;
}

/**
 * 生成视频（使用 sora-2-all 模型）
 */
export async function generate(
  params: Sora2AllParams,
  provider?: ProviderType,
): Promise<Sora2AllResult> {
  const modelName = 'sora-2-all';

  try {
    const modelProvider = providerFactory.getProviderForModel(modelName, provider);

    const generateParams: GenerateParams = {
      prompt: params.prompt,
      enableProgress: params.enableProgress,
      parameters: {
        seconds: params.seconds,
        size: params.size,
        input_reference: params.input_reference,
        character_url: params.character_url,
        character_timestamps: params.character_timestamps,
        ...params.parameters,
      },
    };

    const result = await modelProvider.generate(modelName, generateParams);

    return {
      ...result,
      video_urls: result.mediaUrls,
      progress: result.progress,
    };
  } catch (error) {
    throw new Error(
      `Sora 2 All 视频生成失败: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

