import { loadStorageConfig, RepositoryFactory, resolveStorageUrl } from '@mxmai/mxmdata';
import type { VoiceLanguage } from './minimax-voice-taxonomy';
import { getFirstProviderKey } from '../providers/provider-keys';

const DEFAULT_BASE_URL = 'https://api.minimaxi.com';
const PREVIEW_CATEGORY = 'minimax-voice-previews';
const PREVIEW_VERSION = 'v1';
export const DEFAULT_PREVIEW_MODEL = 'speech-2.8-hd';

export const PREVIEW_TEXT: Record<VoiceLanguage, string> = {
  zh: '你好，欢迎试听这段语音样本，感受音色与自然节奏。',
  en: 'Hello, welcome to this voice preview sample.',
  other: 'Hello, this is a short voice preview sample for you.',
};

export function voiceIdToPreviewFilename(voiceId: string): string {
  const safe = voiceId
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `${safe || 'voice'}.mp3`;
}

export function buildVoicePreviewObjectKey(voiceId: string): string {
  return `sys/${PREVIEW_CATEGORY}/${PREVIEW_VERSION}/${voiceIdToPreviewFilename(voiceId)}`;
}

export function resolveVoicePreviewUrl(voiceId: string): string {
  const key = buildVoicePreviewObjectKey(voiceId);
  const cfg = loadStorageConfig().domains.system_static;
  return resolveStorageUrl({
    domain: 'system_static',
    domainConfig: cfg,
    bucket: cfg.bucket,
    key,
  });
}

function getBaseUrl(): string {
  const base = process.env.MAXPLAN_BASE_URL?.trim() || DEFAULT_BASE_URL;
  return base.replace(/\/+$/, '');
}

function hexToMp3Buffer(hex: string): Buffer {
  return Buffer.from(hex.replace(/\s/g, ''), 'hex');
}

/** 调用 MiniMax t2a_v2 生成短试听音频 */
export async function synthesizeMaxplanVoicePreview(params: {
  voiceId: string;
  text: string;
  model?: string;
}): Promise<Buffer> {
  const apiKey = await getFirstProviderKey('maxplan');
  if (!apiKey?.trim()) {
    throw new Error('Admin 中 provider=maxplan 的 API Key 未配置');
  }

  const model = params.model?.trim() || DEFAULT_PREVIEW_MODEL;
  const res = await fetch(`${getBaseUrl()}/v1/t2a_v2`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      text: params.text,
      stream: false,
      voice_setting: {
        voice_id: params.voiceId,
        speed: 1,
        vol: 1,
        pitch: 0,
      },
      audio_setting: {
        format: 'mp3',
        sample_rate: 32000,
        bitrate: 128000,
        channel: 1,
      },
    }),
  });

  const json = (await res.json()) as {
    data?: { audio?: string };
    base_resp?: { status_code?: number; status_msg?: string };
  };

  if (!res.ok) {
    throw new Error(`MiniMax t2a_v2 HTTP ${res.status}: ${JSON.stringify(json).slice(0, 400)}`);
  }

  const statusCode = json.base_resp?.status_code;
  if (statusCode != null && Number(statusCode) !== 0) {
    throw new Error(
      `MiniMax t2a_v2 失败: status_code=${statusCode} ${json.base_resp?.status_msg ?? ''}`.trim(),
    );
  }

  const hex = json.data?.audio;
  if (!hex || typeof hex !== 'string') {
    throw new Error(`MiniMax t2a_v2 未返回 audio: voice_id=${params.voiceId}`);
  }

  return hexToMp3Buffer(hex);
}

export async function uploadVoicePreviewToSystemStatic(params: {
  voiceId: string;
  buffer: Buffer;
}): Promise<{ objectKey: string; url: string }> {
  const filename = voiceIdToPreviewFilename(params.voiceId);
  const storage = RepositoryFactory.getStorageService();
  const stored = await storage.upload({
    domain: 'system_static',
    purpose: PREVIEW_CATEGORY,
    buffer: params.buffer,
    contentType: 'audio/mpeg',
    pathVars: {
      category: PREVIEW_CATEGORY,
      version: PREVIEW_VERSION,
      filename,
      ext: 'mp3',
    },
  });

  return {
    objectKey: stored.key,
    url: stored.url || resolveVoicePreviewUrl(params.voiceId),
  };
}
