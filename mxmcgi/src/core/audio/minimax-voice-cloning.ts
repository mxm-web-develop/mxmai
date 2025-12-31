/**
 * MiniMax 音频快速复刻（Voice Cloning）
 * 
 * 支持音色快速复刻，返回 voice_id 可用于后续 T2A 语音合成
 * 参考文档：https://ppio.com/docs/models/reference-minimax-voice-cloning
 */

import { providerFactory, GenerateParams, GenerateResult, ProviderType } from '../providers';

export interface MinimaxVoiceCloningParams extends GenerateParams {
  audio_url: string; // 需要复刻音色的音频文件 URL（mp3、m4a、wav，10秒-5分钟，<20MB）
  text?: string; // 复刻试听参数，模型将使用复刻后的音色念诵本段文本
  model?: 'speech-02-hd' | 'speech-02-turbo' | 'speech-2.5-hd-preview' | 'speech-2.5-turbo-preview'; // 试听使用的语音模型
  clone_prompt?: {
    prompt_audio_url: string; // 示例音频 URL（时长 < 8s）
    prompt_text: string; // 示例音频的对应文本
  };
  accuracy?: number; // 文本校验准确率阈值 [0,1]，默认 0.7
  need_noise_reduction?: boolean; // 是否开启降噪，默认 false
  need_volume_normalization?: boolean; // 是否开启音量归一化，默认 false
}

export interface MinimaxVoiceCloningResult extends GenerateResult {
  voice_id: string; // 生成的 voice_id
  demo_audio_url?: string; // 试听音频 URL（如果传了 text 和 model）
}

/**
 * 生成音色复刻
 */
export async function generate(
  params: MinimaxVoiceCloningParams,
  provider?: ProviderType
): Promise<MinimaxVoiceCloningResult> {
  const modelName = 'minimax-voice-cloning';
  
  try {
    const modelProvider = providerFactory.getProviderForModel(modelName, provider);
    
    // 构建生成参数
    const generateParams: GenerateParams = {
      prompt: params.audio_url, // 使用 audio_url 作为 prompt（兼容性处理）
      parameters: {
        audio_url: params.audio_url,
        text: params.text,
        model: params.model,
        clone_prompt: params.clone_prompt,
        accuracy: params.accuracy,
        need_noise_reduction: params.need_noise_reduction,
        need_volume_normalization: params.need_volume_normalization,
        ...params.parameters,
      },
    };

    const result = await modelProvider.generate(modelName, generateParams);

    return {
      ...result,
      voice_id: result.metadata?.voice_id || '',
      demo_audio_url: result.mediaUrls?.[0],
    };
  } catch (error) {
    throw new Error(`MiniMax Voice Cloning 生成失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 快速复刻音色
 */
export async function cloneVoice(
  audioUrl: string,
  options?: {
    text?: string;
    model?: MinimaxVoiceCloningParams['model'];
    clone_prompt?: MinimaxVoiceCloningParams['clone_prompt'];
    accuracy?: number;
    need_noise_reduction?: boolean;
    need_volume_normalization?: boolean;
    provider?: ProviderType;
  }
): Promise<MinimaxVoiceCloningResult> {
  return generate({
    audio_url: audioUrl,
    text: options?.text,
    model: options?.model,
    clone_prompt: options?.clone_prompt,
    accuracy: options?.accuracy,
    need_noise_reduction: options?.need_noise_reduction,
    need_volume_normalization: options?.need_volume_normalization,
  }, options?.provider);
}
