/**
 * MiniMax Speech-2.6-hd 异步语音合成
 * 
 * 支持基于文本到语音的异步生成，单次文本生成传输最大支持 100 万字符
 * 参考文档：https://ppio.com/docs/models/reference-minimax-speech-2.6-hd-async
 */

import { providerFactory, GenerateParams, GenerateResult, ProviderType } from '../providers';

export interface MinimaxSpeech26HdAsyncParams extends GenerateParams {
  voice_setting?: {
    speed?: number; // 语速 [0.5,2]，默认 1.0
    vol?: number; // 音量 (0,10]，默认 1.0
    pitch?: number; // 语调 [-12,12]，默认 0
    voice_id?: string; // 音色编号（系统音色或复刻音色）
    emotion?: 'happy' | 'sad' | 'angry' | 'fearful' | 'disgusted' | 'surprised' | 'neutral'; // 情绪
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
  language_boost?: string; // 语言增强，如 'Chinese', 'English', 'auto' 等
  voice_modify?: {
    pitch?: number; // 音高调整 [-100,100]
    intensity?: number; // 强度调整 [-100,100]
    timbre?: number; // 音色调整 [-100,100]
    sound_effects?: 'spacious_echo' | 'auditorium_echo' | 'lofi_telephone' | 'robotic'; // 音效
  };
}

export interface MinimaxSpeech26HdAsyncResult extends GenerateResult {
  task_id?: string; // 异步任务的 task_id
  progress?: AsyncIterable<any>; // 进度监控流
}

/**
 * 生成语音
 */
export async function generate(
  params: MinimaxSpeech26HdAsyncParams,
  provider?: ProviderType
): Promise<MinimaxSpeech26HdAsyncResult> {
  const modelName = 'minimax-speech-2.6-hd-async';
  
  try {
    const modelProvider = providerFactory.getProviderForModel(modelName, provider);
    
    // 构建生成参数
    const generateParams: GenerateParams = {
      prompt: params.prompt,
      parameters: {
        voice_setting: params.voice_setting,
        audio_setting: params.audio_setting,
        pronunciation_dict: params.pronunciation_dict,
        language_boost: params.language_boost,
        voice_modify: params.voice_modify,
        ...params.parameters,
      },
      enableProgress: params.enableProgress,
    };

    const result = await modelProvider.generate(modelName, generateParams);

    return {
      ...result,
      task_id: result.metadata?.task_id,
      progress: result.progress,
    };
  } catch (error) {
    throw new Error(`MiniMax Speech-2.6-hd 异步语音合成失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 文本转语音（高清版，异步）
 */
export async function textToSpeech(
  text: string,
  options?: {
    voice_setting?: MinimaxSpeech26HdAsyncParams['voice_setting'];
    audio_setting?: MinimaxSpeech26HdAsyncParams['audio_setting'];
    pronunciation_dict?: MinimaxSpeech26HdAsyncParams['pronunciation_dict'];
    language_boost?: string;
    voice_modify?: MinimaxSpeech26HdAsyncParams['voice_modify'];
    provider?: ProviderType;
  }
): Promise<MinimaxSpeech26HdAsyncResult> {
  return generate({
    prompt: text,
    voice_setting: options?.voice_setting,
    audio_setting: options?.audio_setting,
    pronunciation_dict: options?.pronunciation_dict,
    language_boost: options?.language_boost,
    voice_modify: options?.voice_modify,
  }, options?.provider);
}
