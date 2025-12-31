/**
 * MiniMax Speech-2.5-turbo 同步语音合成
 * 
 * 支持基于文本到语音的同步生成，单次文本传输最大 10000 字符
 * 适用于短句生成、语音聊天、在线社交等场景
 * 参考文档：https://ppio.com/docs/models/reference-minimax-speech-2.5-turbo
 */

import { providerFactory, GenerateParams, GenerateResult, ProviderType } from '../providers';

export interface MinimaxSpeech25TurboParams extends GenerateParams {
  voice_setting?: {
    speed?: number; // 语速 [0.5,2]，默认 1.0
    vol?: number; // 音量 (0,10]，默认 1.0
    pitch?: number; // 语调 [-12,12]，默认 0
    voice_id?: string; // 音色编号（系统音色或复刻音色），与 timbre_weights 二选一必填
    emotion?: 'happy' | 'sad' | 'angry' | 'fearful' | 'disgusted' | 'surprised' | 'neutral'; // 情绪
    latex_read?: boolean; // 是否支持朗读 latex 公式，默认 false
    text_normalization?: boolean; // 英语文本规范化，默认 false
  };
  audio_setting?: {
    sample_rate?: 8000 | 16000 | 22050 | 24000 | 32000 | 44100; // 采样率，默认 32000
    bitrate?: 32000 | 64000 | 128000 | 256000; // 比特率，默认 128000（仅 mp3 格式生效）
    format?: 'mp3' | 'pcm' | 'flac' | 'wav'; // 音频格式，默认 mp3
    channel?: 1 | 2; // 声道数，默认 1（单声道）
  };
  pronunciation_dict?: {
    tone?: string[]; // 替换发音，格式：["燕少飞/(yan4)(shao3)(fei1)"]
  };
  timbre_weights?: Array<{
    voice_id: string; // 音色 ID
    weight: number; // 权重 [1,100]
  }>; // 与 voice_id 二选一必填，支持最多 4 种音色混合
  stream?: boolean; // 是否流式输出，默认 false
  stream_options?: {
    exclude_aggregated_audio?: boolean; // 流式最后一个 chunk 是否排除完整音频，默认 false
  };
  language_boost?: string; // 语言增强，如 'Chinese', 'English', 'auto' 等
  output_format?: 'url' | 'hex'; // 输出格式，默认 'hex'，非流式时生效
  voice_modify?: {
    pitch?: number; // 音高调整 [-100,100]
    intensity?: number; // 强度调整 [-100,100]
    timbre?: number; // 音色调整 [-100,100]
    sound_effects?: 'spacious_echo' | 'auditorium_echo' | 'lofi_telephone' | 'robotic'; // 音效
  };
}

export interface MinimaxSpeech25TurboResult extends GenerateResult {
  status?: number; // 流式输出时的状态：1=合成中，2=合成结束
}

/**
 * 生成语音（同步）
 */
export async function generate(
  params: MinimaxSpeech25TurboParams,
  provider?: ProviderType
): Promise<MinimaxSpeech25TurboResult> {
  const modelName = 'minimax-speech-2.5-turbo';
  
  try {
    const modelProvider = providerFactory.getProviderForModel(modelName, provider);
    
    // 构建生成参数
    const generateParams: GenerateParams = {
      prompt: params.prompt,
      parameters: {
        voice_setting: params.voice_setting,
        audio_setting: params.audio_setting,
        pronunciation_dict: params.pronunciation_dict,
        timbre_weights: params.timbre_weights,
        stream: params.stream,
        stream_options: params.stream_options,
        language_boost: params.language_boost,
        output_format: params.output_format,
        voice_modify: params.voice_modify,
        ...params.parameters,
      },
      enableProgress: params.enableProgress,
    };

    const result = await modelProvider.generate(modelName, generateParams);

    return {
      ...result,
      status: result.metadata?.status,
    };
  } catch (error) {
    throw new Error(`MiniMax Speech-2.5-turbo 同步语音合成失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 文本转语音（Turbo 版本，同步）
 */
export async function textToSpeech(
  text: string,
  options?: {
    voice_setting?: MinimaxSpeech25TurboParams['voice_setting'];
    audio_setting?: MinimaxSpeech25TurboParams['audio_setting'];
    pronunciation_dict?: MinimaxSpeech25TurboParams['pronunciation_dict'];
    timbre_weights?: MinimaxSpeech25TurboParams['timbre_weights'];
    stream?: boolean;
    stream_options?: MinimaxSpeech25TurboParams['stream_options'];
    language_boost?: string;
    output_format?: 'url' | 'hex';
    voice_modify?: MinimaxSpeech25TurboParams['voice_modify'];
    provider?: ProviderType;
  }
): Promise<MinimaxSpeech25TurboResult> {
  return generate({
    prompt: text,
    voice_setting: options?.voice_setting,
    audio_setting: options?.audio_setting,
    pronunciation_dict: options?.pronunciation_dict,
    timbre_weights: options?.timbre_weights,
    stream: options?.stream,
    stream_options: options?.stream_options,
    language_boost: options?.language_boost,
    output_format: options?.output_format,
    voice_modify: options?.voice_modify,
  }, options?.provider);
}
