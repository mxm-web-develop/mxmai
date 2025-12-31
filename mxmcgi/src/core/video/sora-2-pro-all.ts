/**
 * Sora 2 Pro All（逆向异步，自研格式）视频生成
 *
 * 使用 DeerAPI 的自研 Sora 接口：
 * - 文档：https://apidoc.deerapi.com/sora/self-developed/create
 *
 * 注意：
 * - 模型 ID 固定为 sora-2-pro-all
 * - 支持的 seconds：10 / 15 / 25（25 秒仅 pro-all 支持）
 * - 支持的分辨率：720x1280 / 1280x720 / 1024x1792 / 1792x1024
 * - 也支持角色一致性参数（character_url, character_timestamps）
 */

import { providerFactory, GenerateParams, GenerateResult, ProviderType } from '../providers';
import type { Sora2AllParams, Sora2AllResult } from './sora-2-all';

export interface Sora2ProAllParams extends Sora2AllParams {
  seconds?: '10' | '15' | '25';
}

export interface Sora2ProAllResult extends Sora2AllResult {}

/**
 * 生成视频（使用 sora-2-pro-all 模型）
 */
export async function generate(
  params: Sora2ProAllParams,
  provider?: ProviderType,
): Promise<Sora2ProAllResult> {
  const modelName = 'sora-2-pro-all';

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
      `Sora 2 Pro All 视频生成失败: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

