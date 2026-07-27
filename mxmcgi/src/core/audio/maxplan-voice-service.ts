/**
 * MiniMax（maxplan）音色列表与快速克隆 — 代理 api.minimaxi.com
 */

import { randomBytes } from 'crypto';
import { getFirstProviderKey } from '../providers/provider-keys';
import {
  enrichMinimaxVoice,
  isCatalogVisibleVoice,
  type EnrichedMinimaxVoiceItem,
  type VoiceGender,
  type VoiceLanguage,
} from './minimax-voice-taxonomy';

const DEFAULT_BASE_URL = 'https://api.minimaxi.com';

export type MinimaxVoiceType = 'system' | 'voice_cloning' | 'voice_generation' | 'all';

export type MinimaxVoiceItem = {
  voice_id: string;
  voice_name: string;
  description?: string[];
  created_time?: string;
  source: 'system' | 'voice_cloning' | 'voice_generation';
  gender?: VoiceGender;
  language?: VoiceLanguage;
};

export type { EnrichedMinimaxVoiceItem, VoiceGender, VoiceLanguage };

type GetVoiceResponse = {
  system_voice?: Array<{
    voice_id?: string;
    voice_name?: string;
    description?: string[];
    created_time?: string;
  }>;
  voice_cloning?: Array<{
    voice_id?: string;
    voice_name?: string;
    description?: string[];
    created_time?: string;
  }>;
  voice_generation?: Array<{
    voice_id?: string;
    voice_name?: string;
    description?: string[];
    created_time?: string;
  }>;
  base_resp?: { status_code?: number; status_msg?: string };
};

function assertBaseResp(json: Record<string, unknown>, label: string): void {
  const base = json.base_resp as { status_code?: number; status_msg?: string } | undefined;
  if (base?.status_code != null && Number(base.status_code) !== 0) {
    throw new Error(
      `MiniMax ${label} 失败: status_code=${base.status_code} ${base.status_msg ?? ''}`.trim(),
    );
  }
}

async function getApiKey(): Promise<string> {
  const key = await getFirstProviderKey('maxplan');
  if (!key?.trim()) {
    throw new Error('Admin 中 provider=maxplan 的 API Key 未配置');
  }
  return key.trim();
}

function getBaseUrl(): string {
  const base = process.env.MAXPLAN_BASE_URL?.trim() || DEFAULT_BASE_URL;
  return base.replace(/\/+$/, '');
}

function normalizeVoiceRows(
  rows: GetVoiceResponse['system_voice'],
  source: MinimaxVoiceItem['source'],
): MinimaxVoiceItem[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      const voiceId = typeof row?.voice_id === 'string' ? row.voice_id.trim() : '';
      if (!voiceId) return null;
      const voiceName =
        typeof row?.voice_name === 'string' && row.voice_name.trim()
          ? row.voice_name.trim()
          : voiceId;
      const description = Array.isArray(row?.description)
        ? row.description.map((d) => String(d)).filter((d) => d.trim())
        : [];
      return {
        voice_id: voiceId,
        voice_name: voiceName,
        description,
        created_time: typeof row?.created_time === 'string' ? row.created_time : undefined,
        source,
      } satisfies MinimaxVoiceItem;
    })
    .filter((x): x is MinimaxVoiceItem => x != null);
}

function withSystemVoiceMetadata(voices: MinimaxVoiceItem[]): EnrichedMinimaxVoiceItem[] {
  return voices.filter(isCatalogVisibleVoice).map((voice) => enrichMinimaxVoice(voice));
}

/** 查询 MiniMax 可用音色（系统音色：中英文+日语，含 gender / language，不含试听 URL） */
export async function listMaxplanVoices(
  voiceType: MinimaxVoiceType = 'system',
): Promise<EnrichedMinimaxVoiceItem[]> {
  const apiKey = await getApiKey();
  const res = await fetch(`${getBaseUrl()}/v1/get_voice`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ voice_type: voiceType }),
  });

  const json = (await res.json()) as GetVoiceResponse & Record<string, unknown>;
  if (!res.ok) {
    throw new Error(`MiniMax get_voice HTTP ${res.status}: ${JSON.stringify(json).slice(0, 400)}`);
  }
  assertBaseResp(json, 'get_voice');

  if (voiceType === 'system') {
    return withSystemVoiceMetadata(normalizeVoiceRows(json.system_voice, 'system'));
  }
  if (voiceType === 'voice_cloning') {
    return normalizeVoiceRows(json.voice_cloning, 'voice_cloning');
  }
  if (voiceType === 'voice_generation') {
    return normalizeVoiceRows(json.voice_generation, 'voice_generation');
  }

  const system = withSystemVoiceMetadata(normalizeVoiceRows(json.system_voice, 'system'));
  const cloning = normalizeVoiceRows(json.voice_cloning, 'voice_cloning');
  const generation = normalizeVoiceRows(json.voice_generation, 'voice_generation');
  return [...system, ...cloning, ...generation];
}

const CLONE_ALLOWED_MIME = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/mp4',
  'audio/x-m4a',
  'audio/m4a',
]);

const CLONE_ALLOWED_EXT = /\.(mp3|m4a|wav)$/i;

export function assertCloneAudioFormat(filename: string, mimeType?: string): void {
  const mime = (mimeType ?? '').toLowerCase();
  if (mime && CLONE_ALLOWED_MIME.has(mime)) return;
  if (CLONE_ALLOWED_EXT.test(filename)) return;
  throw new Error('克隆音频仅支持 mp3、m4a、wav 格式（时长 10 秒–5 分钟，≤20MB）');
}

/** 上传音频到 MiniMax（purpose=voice_clone） */
export async function uploadMaxplanVoiceCloneFile(
  buffer: Buffer,
  filename: string,
  mimeType?: string,
): Promise<number> {
  assertCloneAudioFormat(filename, mimeType);
  const apiKey = await getApiKey();
  const form = new FormData();
  form.append('purpose', 'voice_clone');
  form.append('file', new Blob([buffer], { type: mimeType || 'application/octet-stream' }), filename);

  const res = await fetch(`${getBaseUrl()}/v1/files/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  const json = (await res.json()) as {
    file?: { file_id?: number };
    base_resp?: { status_code?: number; status_msg?: string };
  };
  if (!res.ok) {
    throw new Error(`MiniMax files/upload HTTP ${res.status}: ${JSON.stringify(json).slice(0, 400)}`);
  }
  assertBaseResp(json as Record<string, unknown>, 'files/upload');

  const fileId = json.file?.file_id;
  if (fileId == null || !Number.isFinite(Number(fileId))) {
    throw new Error('MiniMax files/upload 未返回 file_id');
  }
  return Number(fileId);
}

export function generateCloneVoiceId(userId: string, voiceName?: string): string {
  const uid = userId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'user';
  const slug = (voiceName ?? 'Voice')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 24);
  const suffix = randomBytes(3).toString('hex');
  let id = `Mxm_${uid}_${slug || 'v'}_${suffix}`.replace(/[-_]+$/g, '');
  if (!/^[A-Za-z]/.test(id)) id = `M${id}`;
  if (id.length < 8) id = `MxmVoice${suffix}${uid}`.slice(0, 16);
  return id.slice(0, 256);
}

export type VoiceCloneOptions = {
  fileId: number;
  voiceId: string;
  previewText?: string;
  model?: string;
  needNoiseReduction?: boolean;
  needVolumeNormalization?: boolean;
};

export type VoiceCloneResult = {
  voice_id: string;
  demo_audio?: string;
  input_sensitive_type?: number;
};

/** 调用 MiniMax voice_clone */
export async function cloneMaxplanVoice(opts: VoiceCloneOptions): Promise<VoiceCloneResult> {
  const apiKey = await getApiKey();
  const body: Record<string, unknown> = {
    file_id: opts.fileId,
    voice_id: opts.voiceId,
    need_noise_reduction: opts.needNoiseReduction ?? false,
    need_volume_normalization: opts.needVolumeNormalization ?? false,
  };

  const previewText = opts.previewText?.trim();
  const model = opts.model?.trim() || 'speech-2.8-hd';
  if (previewText) {
    body.text = previewText.slice(0, 1000);
    body.model = model;
  }

  const res = await fetch(`${getBaseUrl()}/v1/voice_clone`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json()) as VoiceCloneResult & {
    base_resp?: { status_code?: number; status_msg?: string };
  };
  if (!res.ok) {
    throw new Error(`MiniMax voice_clone HTTP ${res.status}: ${JSON.stringify(json).slice(0, 400)}`);
  }
  assertBaseResp(json as Record<string, unknown>, 'voice_clone');

  return {
    voice_id: opts.voiceId,
    demo_audio: typeof json.demo_audio === 'string' ? json.demo_audio : undefined,
    input_sensitive_type:
      typeof (json as { input_sensitive?: { type?: number } }).input_sensitive?.type === 'number'
        ? (json as { input_sensitive?: { type?: number } }).input_sensitive?.type
        : undefined,
  };
}

/** 从 URL 下载音频（用户已上传至平台存储） */
export async function downloadAudioBufferFromUrl(url: string): Promise<{ buffer: Buffer; filename: string; mimeType?: string }> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`下载音频失败 HTTP ${res.status}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const mimeType = res.headers.get('content-type') ?? undefined;
  let filename = 'voice-clone.mp3';
  try {
    const u = new URL(url);
    const base = u.pathname.split('/').pop();
    if (base && base.includes('.')) filename = decodeURIComponent(base);
  } catch {
    // ignore
  }
  return { buffer, filename, mimeType };
}
