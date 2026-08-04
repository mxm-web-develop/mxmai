/**
 * TTS 句级字幕持久化：MiniMax subtitle_file 为短期 URL，任务完成时拉取并写入 metadata / MinIO。
 * 上游未返回 subtitle_file 时，回退用口播文稿 + 时长估算（script_only）。
 */

import { RepositoryFactory } from '@mxmai/mxmdata';
import { getGeneratedBucket } from '../storage/generated-temp';
import {
  estimateSegmentsFromScript,
} from '../core/audio/voiceover-subtitle-normalize';
import type { Task, TaskResult } from './types';
import { isCompleteStorageConfig } from './task-result-media-persist';

const MAX_INLINE_SUBTITLE_BYTES = 48 * 1024;
const SUBTITLE_FETCH_TIMEOUT_MS = 20_000;

export function pickSubtitleFileUrl(meta: Record<string, unknown> | undefined): string | null {
  if (!meta || typeof meta !== 'object') return null;
  const direct = meta.subtitle_file;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const upstream = meta.subtitle_file_upstream;
  if (typeof upstream === 'string' && upstream.trim()) return upstream.trim();
  const raw = meta.raw;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const data = (raw as { data?: { subtitle_file?: unknown } }).data;
    if (typeof data?.subtitle_file === 'string' && data.subtitle_file.trim()) {
      return data.subtitle_file.trim();
    }
  }
  return null;
}

/** 去掉 TTS 停顿标签，供字幕估算 */
export function plainTtsScriptText(markupOrText: string): string {
  return String(markupOrText ?? '')
    .replace(/<#([\d.]+)#>/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function countUsableSubtitleRows(payload: unknown): number {
  if (!payload || typeof payload !== 'object') return 0;
  if (Array.isArray(payload)) return payload.length;
  const o = payload as Record<string, unknown>;
  for (const key of ['sentences', 'subtitle', 'subtitles', 'segments', 'data', 'items', 'list']) {
    const v = o[key];
    if (Array.isArray(v) && v.length > 0) return v.length;
  }
  return 0;
}

export function hasPersistedSubtitle(meta: Record<string, unknown> | undefined): boolean {
  if (!meta || typeof meta !== 'object') return false;
  if (meta.subtitle_data !== undefined && meta.subtitle_data !== null) {
    return countUsableSubtitleRows(meta.subtitle_data) > 0;
  }
  return (
    typeof meta.subtitle_storage_bucket === 'string' &&
    meta.subtitle_storage_bucket.trim().length > 0 &&
    typeof meta.subtitle_storage_key === 'string' &&
    meta.subtitle_storage_key.trim().length > 0
  );
}

export async function fetchSubtitleJsonFromUrl(subtitleFileUrl: string): Promise<unknown> {
  const res = await fetch(subtitleFileUrl, { signal: AbortSignal.timeout(SUBTITLE_FETCH_TIMEOUT_MS) });
  if (!res.ok) {
    throw new Error(`Upstream subtitle fetch failed: HTTP ${res.status}`);
  }
  const text = await res.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error('Invalid subtitle JSON from upstream');
  }
}

function resolveSubtitleStoragePath(task: Task): { bucket: string; key: string } {
  const userId = task.metadata?.userId || 'anonymous';
  const cfg = task.metadata?.storageConfig;
  const bucket =
    isCompleteStorageConfig(cfg) && cfg.bucket.trim()
      ? cfg.bucket.trim()
      : getGeneratedBucket();
  const key = `${userId}/audio/${task.id}-subtitles.json`;
  return { bucket, key };
}

async function uploadSubtitleJson(task: Task, jsonText: string): Promise<{ bucket: string; key: string }> {
  const { bucket, key } = resolveSubtitleStoragePath(task);
  const repo = RepositoryFactory.createStorageRepository('generated');
  await repo.uploadFile(bucket, key, Buffer.from(jsonText, 'utf8'), {
    contentType: 'application/json; charset=utf-8',
    metadata: {
      taskId: task.id,
      kind: 'tts-subtitle',
    },
  });
  return { bucket, key };
}

function readNestedString(...candidates: unknown[]): string {
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return '';
}

/** 从任务请求 / metadata 抽口播文稿 */
export function resolveVoiceoverScriptText(
  task: Task,
  meta: Record<string, unknown> = {}
): string {
  const rp = (task.requestParams ?? {}) as Record<string, unknown>;
  const params = ((rp.params ?? rp) as Record<string, unknown>) || {};
  const inner = ((params.params ?? params) as Record<string, unknown>) || {};
  const parameters =
    ((params.parameters ?? inner.parameters) as Record<string, unknown> | undefined) || {};
  const bps =
    ((params.businessPipelineState ??
      rp.businessPipelineState ??
      meta.businessPipelineState) as Record<string, unknown> | undefined) || {};
  const voicePipe =
    ((bps.voiceOverPipeline ?? meta.voiceOverPipeline) as Record<string, unknown> | undefined) ||
    {};
  const contract = (bps.contract ?? meta.contract) as Record<string, unknown> | undefined;
  const basic = (contract?.basic as Record<string, unknown> | undefined) || {};
  const business = (contract?.business as Record<string, unknown> | undefined) || {};

  const raw = readNestedString(
    meta.text,
    meta.finalPrompt,
    meta.prompt,
    voicePipe.ttsText,
    bps.finalPrompt,
    bps.promptForModel,
    business.tts_markup,
    business.script,
    business.voice_script,
    basic.script,
    rp.prompt,
    params.prompt,
    inner.prompt,
    parameters.text,
    parameters.prompt
  );
  return plainTtsScriptText(raw);
}

export function resolveAudioDurationSeconds(meta: Record<string, unknown> = {}): number {
  const direct = Number(meta.duration ?? meta.audio_seconds);
  if (Number.isFinite(direct) && direct > 0.2) return direct;
  const extra = meta.extra_info as { audio_length?: unknown } | undefined;
  const len = Number(extra?.audio_length);
  if (Number.isFinite(len) && len > 200) return len / 1000;
  return 0;
}

/**
 * 上游未返回字幕时：按文稿句读 + 音频时长估算播放器字幕。
 * 输出 MiniMax 风格 { sentences: [{ text, time_begin, time_end }] }（毫秒）。
 */
export function estimateSubtitlePlayerPayload(
  script: string,
  durationSeconds: number
): { sentences: Array<{ text: string; time_begin: number; time_end: number }>; source: 'script_only' } | null {
  const plain = plainTtsScriptText(script);
  if (!plain || !(durationSeconds > 0.2)) return null;
  const segments = estimateSegmentsFromScript(plain, durationSeconds);
  if (segments.length === 0) return null;
  return {
    source: 'script_only',
    sentences: segments.map((s) => ({
      text: s.text,
      time_begin: Math.round(s.startSeconds * 1000),
      time_end: Math.round(s.endSeconds * 1000),
    })),
  };
}

export function estimateSubtitlePayloadForTask(
  task: Task,
  meta: Record<string, unknown> = {}
): ReturnType<typeof estimateSubtitlePlayerPayload> {
  const script = resolveVoiceoverScriptText(task, meta);
  const duration = resolveAudioDurationSeconds(meta);
  return estimateSubtitlePlayerPayload(script, duration);
}

/**
 * 将 MiniMax subtitle_file 拉取后写入 result.metadata（内联 JSON 或 MinIO）。
 * 无上游字幕时用文稿估算出句级字幕。失败不阻断任务完成。
 */
export async function persistTtsSubtitleInResult(task: Task, result: TaskResult): Promise<TaskResult> {
  if (task.type !== 'audio' && task.type !== 'music') return result;

  const meta = { ...(result.metadata ?? {}) } as Record<string, unknown>;
  if (hasPersistedSubtitle(meta)) {
    return { ...result, metadata: meta };
  }

  const upstreamUrl = pickSubtitleFileUrl(meta);
  if (upstreamUrl) {
    try {
      const payload = await fetchSubtitleJsonFromUrl(upstreamUrl);
      const jsonText = JSON.stringify(payload);
      const byteLen = Buffer.byteLength(jsonText, 'utf8');

      if (byteLen <= MAX_INLINE_SUBTITLE_BYTES) {
        meta.subtitle_data = payload;
      } else {
        const stored = await uploadSubtitleJson(task, jsonText);
        meta.subtitle_storage_bucket = stored.bucket;
        meta.subtitle_storage_key = stored.key;
      }

      meta.subtitle_file_upstream = upstreamUrl;
      meta.subtitle_persisted_at = new Date().toISOString();
      meta.subtitle_enabled = true;
      delete meta.subtitle_file;

      return { ...result, metadata: meta };
    } catch (error) {
      console.warn('[persistTtsSubtitle] 字幕持久化失败，仍保留上游 URL', {
        taskId: task.id,
        error: error instanceof Error ? error.message : String(error),
      });
      // 继续尝试文稿估算
    }
  }

  const estimated = estimateSubtitlePayloadForTask(task, meta);
  if (!estimated) return result;

  meta.subtitle_data = estimated;
  meta.subtitle_enabled = true;
  meta.subtitle_source = 'script_only';
  meta.subtitle_persisted_at = new Date().toISOString();
  return { ...result, metadata: meta };
}

export async function loadPersistedSubtitlePayload(
  meta: Record<string, unknown> | undefined
): Promise<unknown | null> {
  if (!meta || typeof meta !== 'object') return null;
  if (meta.subtitle_data !== undefined && meta.subtitle_data !== null) {
    if (countUsableSubtitleRows(meta.subtitle_data) > 0) return meta.subtitle_data;
    return null;
  }

  const bucket = meta.subtitle_storage_bucket;
  const key = meta.subtitle_storage_key;
  if (typeof bucket === 'string' && bucket.trim() && typeof key === 'string' && key.trim()) {
    const repo = RepositoryFactory.createStorageRepository();
    const buf = await repo.downloadFile(bucket.trim(), key.trim());
    return JSON.parse(buf.toString('utf8')) as unknown;
  }

  return null;
}
