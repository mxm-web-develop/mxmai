/**
 * 服务端 ASR：本地 FunASR（阿里达摩院 Paraformer，中文优先）
 *
 * 宿主机需安装：pip install -r mxmcgi/requirements-asr.txt
 * 环境变量：FUNASR_PYTHON、FUNASR_MODEL、ASR_TIMEOUT_MS
 */
import { transcribeAudioBufferWithFunAsr } from './funasr-runner';
import type { VoiceoverSubtitleBundle } from './voiceover-subtitle-types';

const MAX_AUDIO_BYTES = 24 * 1024 * 1024;

export interface TranscribeAudioOptions {
  /** 保留兼容；当前仅 FunASR，忽略 cloud provider */
  language?: string;
  model?: string;
  userId?: string;
}

async function fetchAudioBytes(
  audioUrl: string,
  userId?: string
): Promise<{ buffer: Buffer; mime: string; filename: string }> {
  const { downloadVoiceoverAudioBuffer } = await import('./voiceover-audio-source');
  return downloadVoiceoverAudioBuffer(audioUrl, { userId });
}

export async function transcribeAudioFromUrl(
  audioUrl: string,
  options?: TranscribeAudioOptions & { userId?: string }
): Promise<VoiceoverSubtitleBundle> {
  const url = audioUrl.trim();
  if (!url) throw new Error('ASR: 缺少音频 URL');

  const { buffer, mime, filename } = await fetchAudioBytes(url, options?.userId);
  if (buffer.byteLength > MAX_AUDIO_BYTES) {
    throw new Error(`ASR: 音频超过 ${MAX_AUDIO_BYTES / (1024 * 1024)}MB 上限`);
  }

  return transcribeAudioBufferWithFunAsr(buffer, mime, filename);
}
