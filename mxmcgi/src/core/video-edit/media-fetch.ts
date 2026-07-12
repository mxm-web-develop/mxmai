/**
 * Worker 内拉取视频/图片二进制：兼容 Gateway 相对路径与 MinIO 直链
 */
import { RepositoryFactory } from '@mxmai/mxmdata';
import { parseReferenceImageLocator } from '../../task/reference-image';
import { parseMinioDirectObjectUrl } from '../audio/voiceover-audio-source';

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
    `无法从存储读取媒体 (${bucket}/${key})${
      lastErr instanceof Error ? `: ${lastErr.message}` : ''
    }`
  );
}

async function downloadFromMediaObject(objectId: string, userId?: string): Promise<Buffer> {
  const repo = RepositoryFactory.createStorageObjectRepository();
  const record = userId
    ? await repo.findByIdForUser(objectId, userId)
    : await repo.findById(objectId);
  if (!record) {
    throw new Error(`媒体 storage object 不存在: ${objectId}`);
  }
  return downloadFromBucketKey(record.bucket, record.object_key);
}

/** 将 /api/v1/media/* 或 MinIO 直链解析为可下载的二进制 */
export async function fetchMediaBuffer(
  source: string,
  opts?: { userId?: string }
): Promise<Buffer> {
  const trimmed = source.trim();
  if (!trimmed) throw new Error('媒体 URL 为空');

  const loc = parseReferenceImageLocator(trimmed);
  if (loc?.kind === 'media-asset') {
    return downloadFromBucketKey(loc.bucket, loc.key);
  }
  if (loc?.kind === 'media-object') {
    return downloadFromMediaObject(loc.objectId, opts?.userId);
  }

  const minio = parseMinioDirectObjectUrl(trimmed);
  if (minio) {
    return downloadFromBucketKey(minio.bucket, minio.key);
  }

  let target = trimmed;
  if (trimmed.startsWith('/api/')) {
    const base = (process.env.PUBLIC_GATEWAY_ORIGIN || 'http://127.0.0.1:3000').replace(/\/+$/, '');
    target = `${base}${trimmed}`;
  }

  const res = await fetch(target, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) {
    throw new Error(`下载媒体失败 HTTP ${res.status}: ${trimmed}`);
  }
  return Buffer.from(await res.arrayBuffer());
}
