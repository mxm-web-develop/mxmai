/**
 * Runway 统一视频生成接口
 * 
 * 根据用户提供的参数自动选择调用：
 * - Image to Video（提供 promptImage）- 图片转视频
 * - Video to Video（提供 videoUri）- 视频转视频
 * 
 * 注意：Runway 不支持纯文本转视频，必须提供图片或视频作为输入
 * 
 * 通过 DeerAPI 调用 Runway API
 * 参考文档: https://docs.dev.runwayml.com/api/
 */

import { providerFactory, GenerateParams, GenerateResult, ProviderType } from '../providers';

export interface RunwayParams extends Omit<GenerateParams, 'prompt'> {
  // ========== 通用参数 ==========
  // 文本提示词（可选，用于图片转视频或视频转视频时的描述）
  prompt?: string;
  // 视频比例
  ratio?: '1280:720' | '720:1280' | '1080:1920' | '1920:1080' | '1104:832' | '832:1104' | '960:960' | '1584:672' | '1280:768' | '768:1280';
  // 随机种子
  seed?: number;
  // 视频时长（5-10 秒，根据 Runway API 文档）
  duration?: 5 | 6 | 7 | 8 | 9 | 10;
  // 是否启用进度监控（默认 true）
  enableProgress?: boolean;

  // ========== Image to Video 参数 ==========
  // 图片输入（base64 或 URL）- 如果提供此参数，将使用 Image to Video
  promptImage?: string;
  // Image to Video 模型选择
  imageToVideoModel?: 'gen4_turbo' | 'veo3.1' | 'gen3a_turbo' | 'veo3.1_fast' | 'veo3';
  // 水印设置
  watermark?: boolean;
  // 内容审核设置
  contentModeration?: {
    publicFigureThreshold?: 'auto' | 'low';
  };

  // ========== Video to Video 参数 ==========
  // 视频输入（URL 或 Runway URI）- 如果提供此参数，将使用 Video to Video
  videoUri?: string;
  // 参考图片（可选，仅 Video to Video）
  references?: Array<{
    type: 'image';
    uri: string;
  }>;
}

export interface RunwayResult extends GenerateResult {
  video_urls: string[];
  progress?: AsyncIterable<any>; // 进度监控流
  // 自动选择的接口类型
  mode?: 'image-to-video' | 'video-to-video';
}

/**
 * 生成视频（自动选择接口类型）
 */
export async function generate(
  params: RunwayParams,
  provider?: ProviderType
): Promise<RunwayResult> {
  const modelName = 'runway'; // 统一使用 runway 模型
  
  try {
    const modelProvider = providerFactory.getProviderForModel(modelName, provider);
    
    // 自动判断使用哪个接口
    // 优先级：promptImage > videoUri
    // 注意：Runway 不支持纯文本转视频，必须提供图片或视频作为输入
    let mode: 'image-to-video' | 'video-to-video';
    let generateParams: GenerateParams;

    // 1. 优先检查 promptImage（图片转视频）
    if (params.promptImage) {
      mode = 'image-to-video';
      // promptText 是可选的，如果没有提供，使用空字符串
      
      generateParams = {
        prompt: params.prompt || params.promptText || '', // promptText 可选，如果没有则使用空字符串
        enableProgress: params.enableProgress,
        parameters: {
          mode: 'image-to-video',
          model: params.imageToVideoModel || 'gen3a_turbo', // 默认使用 gen3a_turbo（根据文档）
          promptImage: params.promptImage,
          ratio: params.ratio || '1280:720',
          seed: params.seed,
          duration: params.duration,
          contentModeration: params.contentModeration,
          watermark: params.watermark,
          ...params.parameters,
        },
      };
    } 
    // 2. 检查 videoUri（视频转视频）
    else if (params.videoUri) {
      mode = 'video-to-video';
      
      generateParams = {
        prompt: params.prompt || params.promptText || '', // 可选
        enableProgress: params.enableProgress,
        parameters: {
          mode: 'video-to-video',
          model: 'gen4_aleph', // 固定使用 gen4_aleph
          videoUri: params.videoUri,
          ratio: params.ratio || '1280:720',
          seed: params.seed,
          duration: params.duration,
          references: params.references,
          contentModeration: params.contentModeration,
          ...params.parameters,
        },
      };
    } 
    // 3. 如果都没有提供，抛出错误
    else {
      throw new Error('Runway 不支持纯文本转视频。必须提供以下参数之一：promptImage（图片转视频）或 videoUri（视频转视频）');
    }

    const result = await modelProvider.generate(modelName, generateParams);

    return {
      ...result,
      video_urls: result.mediaUrls,
      progress: result.progress,
      mode,
    };
  } catch (error) {
    throw new Error(`Runway 视频生成失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

