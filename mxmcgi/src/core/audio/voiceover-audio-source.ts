/**
 * 口播音频：Worker 内将各类 URL/路径解析为可读取的二进制（避免 ffprobe/fetch 打内网 MinIO 403）
 */
import { RepositoryFactory } from '@mxmai/mxmdata';
import { parseReferenceImageLocator } from '../../task/reference-image';

function guessAudioMime(key: string, contentType?: string | null): string {
  if (contentType?.startsWith('audio/')) return contentType.split(';')[0].trim();
  const lower = key.toLowerCase();
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.m4a')) return 'audio/mp4';
  if (lower.endsWith('.ogg')) return 'audio/ogg';
  if (lower.endsWith('.flac')) return 'audio/flac';
  if (lower.endsWith('.aac')) return 'audio/aac';
  return 'audio/mpeg';
}

function guessFilename(key: string, fallback = 'voiceover.mp3'): string {
  const base = key.split('/').pop();
  return base && base.trim() ? base : fallback;
}

function isInternalMinioHost(hostname: string, port: string): boolean {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === 'minio') return true;
  if (host.includes('minio')) return true;
  if (port === '9000') return true;
  const endpoint = (process.env.MINIO_ENDPOINT || 'localhost').toLowerCase();
  return host === endpoint;
}

/** 将内网 MinIO / Gateway 绝对地址转为前端可访问的相对媒体路径 */
export function normalizeClientAccessibleMediaUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;

  const minio = parseMinioDirectObjectUrl(trimmed);
  if (minio) {
    return `/api/v1/media/asset?bucket=${encodeURIComponent(minio.bucket)}&key=${encodeURIComponent(minio.key)}`;
  }

  const base = (process.env.PUBLIC_GATEWAY_ORIGIN || '').replace(/\/+$/, '');
  if (base && trimmed.startsWith(`${base}/`)) {
    return trimmed.slice(base.length);
  }

  return trimmed;
}

/** 解析 MinIO 直链：http://127.0.0.1:9000/{bucket}/{key...} */
export function parseMinioDirectObjectUrl(url: string): { bucket: string; key: string } | null {
  try {
    const u = new URL(url.trim());
    if (!isInternalMinioHost(u.hostname, u.port)) return null;
    const parts = u.pathname.replace(/^\/+/, '').split('/').filter(Boolean);
    if (parts.length < 2) return null;
    return { bucket: parts[0], key: parts.slice(1).join('/') };
  } catch {
    return null;
  }
}

async function downloadFromBucketKey(bucket: string, key: string): Promise<Buffer> {
  const domains = ['user_upload', 'generated', 'system_static'] as const;
  let lastErr: unknown;
  for (const domain of domains) {
    try {
      const repo = RepositoryFactory.createStorageRepository(domain);
      const bufAny = await repo.downloadFile(bucket, key);
      return Buffer.isBuffer(bufAny) ? bufAny : Buffer.from(bufAny as ArrayBuffer);
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(
    `无法从存储读取口播音频 (${bucket}/${key})${
      lastErr instanceof Error ? `: ${lastErr.message}` : ''
    }`
  );
}

async function downloadFromMediaObject(objectId: string, userId?: string): Promise<Buffer> {
  const repo = RepositoryFactory.createStorageObjectRepository();
  const record = userId
    ? await repo.findByIdForUser(objectId, userId)
    : await repo.findById(objectId);
  if (!record || record.domain !== 'user_upload') {
    throw new Error(`口播音频 storage object 不存在或无权访问: ${objectId}`);
  }
  return downloadFromBucketKey(record.bucket, record.object_key);
}

async function downloadFromTaskMediaUrl(source: string): Promise<Buffer | null> {
  const loc = parseReferenceImageLocator(source);
  if (!loc) return null;

  const audioTaskMatch = source.match(/\/media\/(?:audio|music)\/([^/?#]+)/);
  if (audioTaskMatch?.[1]) {
    const taskId = decodeURIComponent(audioTaskMatch[1]);
    const { taskExecutor } = await import('../../task/task-executor');
    const snap = await taskExecutor.getTaskManager().getTask(taskId);
    const task = snap?.task;
    if (!task?.result) return null;

    const meta = (task.result.metadata ?? {}) as Record<string, unknown>;
    const bucket = meta.storage_bucket ?? meta.bucket;
    const key = meta.storage_key ?? meta.key;
    if (typeof bucket === 'string' && bucket && typeof key === 'string' && key) {
      return downloadFromBucketKey(bucket, key);
    }

    const storageInfo = task.result.storageInfo as { bucket?: string; keys?: string[] } | undefined;
    if (storageInfo?.bucket && Array.isArray(storageInfo.keys) && storageInfo.keys[0]) {
      return downloadFromBucketKey(storageInfo.bucket, storageInfo.keys[0]);
    }
  }

  if (loc.kind === 'media-object') {
    return downloadFromMediaObject(loc.objectId);
  }

  if (loc.kind === 'media-asset') {
    return downloadFromBucketKey(loc.bucket, loc.key);
  }

  return null;
}

async function fetchHttpAudio(url: string): Promise<Buffer> {
  const trimmed = url.trim();
  let target = trimmed;

  if (trimmed.startsWith('/api/')) {
    const base = (process.env.PUBLIC_GATEWAY_ORIGIN || 'http://127.0.0.1:3000').replace(/\/+$/, '');
    target = `${base}${trimmed}`;
  }

  const res = await fetch(target, { signal: AbortSignal.timeout(90_000) });
  if (!res.ok) {
    throw new Error(`拉取口播音频失败 HTTP ${res.status}: ${target}`);
  }
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

export async function downloadVoiceoverAudioBuffer(
  source: string,
  opts?: { userId?: string }
): Promise<{ buffer: Buffer; mime: string; filename: string }> {
  const trimmed = source.trim();
  if (!trimmed) throw new Error('口播音频 URL 为空');

  const userId = opts?.userId;

  const loc = parseReferenceImageLocator(trimmed);
  if (loc?.kind === 'media-object') {
    const repo = RepositoryFactory.createStorageObjectRepository();
    const record = userId
      ? await repo.findByIdForUser(loc.objectId, userId)
      : await repo.findById(loc.objectId);
    if (!record) throw new Error(`口播音频 object 不存在: ${loc.objectId}`);
    const buffer = await downloadFromBucketKey(record.bucket, record.object_key);
    const storageRepo = RepositoryFactory.createStorageRepository('user_upload');
    const meta = await storageRepo.getFileMetadata(record.bucket, record.object_key).catch(() => null);
    return {
      buffer,
      mime: guessAudioMime(record.object_key, meta?.contentType ?? record.content_type),
      filename: guessFilename(record.object_key),
    };
  }

  if (loc?.kind === 'media-asset') {
    const buffer = await downloadFromBucketKey(loc.bucket, loc.key);
    return {
      buffer,
      mime: guessAudioMime(loc.key),
      filename: guessFilename(loc.key),
    };
  }

  const minio = parseMinioDirectObjectUrl(trimmed);
  if (minio) {
    const buffer = await downloadFromBucketKey(minio.bucket, minio.key);
    return {
      buffer,
      mime: guessAudioMime(minio.key),
      filename: guessFilename(minio.key),
    };
  }

  const fromTask = await downloadFromTaskMediaUrl(trimmed);
  if (fromTask) {
    return {
      buffer: fromTask,
      mime: guessAudioMime(trimmed),
      filename: guessFilename(trimmed),
    };
  }

  if (loc?.kind === 'http' || /^https?:\/\//i.test(trimmed) || trimmed.startsWith('/api/')) {
    const buffer = await fetchHttpAudio(loc?.kind === 'http' ? loc.url : trimmed);
    return {
      buffer,
      mime: guessAudioMime(trimmed),
      filename: guessFilename(trimmed),
    };
  }

  throw new Error(`无法解析口播音频地址: ${trimmed.slice(0, 120)}`);
}
