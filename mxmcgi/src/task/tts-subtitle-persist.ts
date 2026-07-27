/**
 * TTS 句级字幕持久化：MiniMax subtitle_file 为短期 URL，任务完成时拉取并写入 metadata / MinIO。
 */

import { RepositoryFactory } from '@mxmai/mxmdata';
import { getGeneratedBucket } from '../storage/generated-temp';
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

export function hasPersistedSubtitle(meta: Record<string, unknown> | undefined): boolean {
  if (!meta || typeof meta !== 'object') return false;
  if (meta.subtitle_data !== undefined && meta.subtitle_data !== null) return true;
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

/**
 * 将 MiniMax subtitle_file 拉取后写入 result.metadata（内联 JSON 或 MinIO）。
 * 失败时保留上游 URL，不阻断任务完成。
 */
export async function persistTtsSubtitleInResult(task: Task, result: TaskResult): Promise<TaskResult> {
  if (task.type !== 'audio' && task.type !== 'music') return result;

  const meta = { ...(result.metadata ?? {}) } as Record<string, unknown>;
  if (hasPersistedSubtitle(meta)) {
    return { ...result, metadata: meta };
  }

  const upstreamUrl = pickSubtitleFileUrl(meta);
  if (!upstreamUrl) return result;

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
    delete meta.subtitle_file;

    return { ...result, metadata: meta };
  } catch (error) {
    console.warn('[persistTtsSubtitle] 字幕持久化失败，仍保留上游 URL', {
      taskId: task.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return result;
  }
}

export async function loadPersistedSubtitlePayload(
  meta: Record<string, unknown> | undefined
): Promise<unknown | null> {
  if (!meta || typeof meta !== 'object') return null;
  if (meta.subtitle_data !== undefined && meta.subtitle_data !== null) {
    return meta.subtitle_data;
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
