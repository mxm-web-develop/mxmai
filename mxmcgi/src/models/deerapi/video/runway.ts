/**
 * Runway 统一视频生成（DeerAPI）
 * 根据参数自动选择：图片转视频 / 视频转视频。不支持纯文本转视频。
 */

import { providerFactory, type GenerateParams, type GenerateResult, type ProviderType } from '../../../core/providers';
import type { ModelDefinition, ModelContext } from '../../types';
import { registerModel } from '../../registry';

export type RunwayParams = GenerateParams & {
  prompt?: string;
  ratio?: '1280:720' | '720:1280' | '1080:1920' | '1920:1080' | '1104:832' | '832:1104' | '960:960' | '1584:672' | '1280:768' | '768:1280';
  seed?: number;
  duration?: 5 | 6 | 7 | 8 | 9 | 10;
  enableProgress?: boolean;
  promptImage?: string;
  imageToVideoModel?: 'gen4_turbo' | 'veo3.1' | 'gen3a_turbo' | 'veo3.1_fast' | 'veo3';
  watermark?: boolean;
  contentModeration?: { publicFigureThreshold?: 'auto' | 'low' };
  videoUri?: string;
  references?: Array<{ type: 'image'; uri: string }>;
};

export interface RunwayResult extends GenerateResult {
  video_urls: string[];
  progress?: AsyncIterable<any>;
  mode?: 'image-to-video' | 'video-to-video';
}

const modelKey = 'runway';
const logicalProvider = 'deer';

async function generateImpl(
  params: RunwayParams,
  _ctx?: ModelContext & { providerOverride?: ProviderType }
): Promise<RunwayResult> {
  const preferred = _ctx?.providerOverride;
  const modelProvider = providerFactory.getProviderForModel(modelKey, preferred);

  let mode: 'image-to-video' | 'video-to-video';
  let generateParams: GenerateParams;

  if (params.promptImage) {
    mode = 'image-to-video';
    generateParams = {
      prompt: params.prompt || (params as any).promptText || '',
      enableProgress: params.enableProgress,
      parameters: {
        mode: 'image-to-video',
        model: params.imageToVideoModel || 'gen3a_turbo',
        promptImage: params.promptImage,
        ratio: params.ratio || '1280:720',
        seed: params.seed,
        duration: params.duration,
        contentModeration: params.contentModeration,
        watermark: params.watermark,
        ...params.parameters,
      },
    };
  } else if (params.videoUri) {
    mode = 'video-to-video';
    generateParams = {
      prompt: params.prompt || (params as any).promptText || '',
      enableProgress: params.enableProgress,
      parameters: {
        mode: 'video-to-video',
        model: 'gen4_aleph',
        videoUri: params.videoUri,
        ratio: params.ratio || '1280:720',
        seed: params.seed,
        duration: params.duration,
        references: params.references,
        contentModeration: params.contentModeration,
        ...params.parameters,
      },
    };
  } else {
    throw new Error('Runway 不支持纯文本转视频。必须提供以下参数之一：promptImage（图片转视频）或 videoUri（视频转视频）');
  }

  const result = await modelProvider.generate(modelKey, generateParams);

  return {
    ...result,
    video_urls: result.mediaUrls,
    progress: result.progress,
    mode,
  };
}

const definition: ModelDefinition<RunwayParams, RunwayResult> = {
  provider: logicalProvider,
  scope: 'video',
  modelKey,
  generate: generateImpl,
};

registerModel(definition);

export default definition;
