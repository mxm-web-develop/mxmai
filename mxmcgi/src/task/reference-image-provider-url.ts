import { RepositoryFactory, loadStorageConfig } from '@mxmai/mxmdata';
import {
  isBase64,
  isUrl,
  parseReferenceImageLocator,
} from './reference-image';
import {
  isExternallyFetchableReferenceUrl,
  resolveUserUploadAccessUrl,
} from '../storage/user-upload-url';

/**
 * 将参考图定位符转为外网 Provider 可拉取的 URL。
 * - public：Gateway /media/public/object 或 R2 CDN
 * - presigned：MinIO/S3 预签名
 * - proxy：仍返回鉴权代理路径（由调用方 fallback 为下载+中转）
 */
export async function resolveReferenceImageForExternalProvider(
  content: string,
  _userId?: string
): Promise<string> {
  const trimmed = content.trim();
  if (!trimmed || isBase64(trimmed)) return trimmed;

  if (isExternallyFetchableReferenceUrl(trimmed)) {
    return trimmed;
  }

  const loc = parseReferenceImageLocator(trimmed);
  const config = loadStorageConfig().domains.user_upload;

  if (loc?.kind === 'media-object') {
    const repo = RepositoryFactory.createStorageObjectRepository();
    const record = await repo.findById(loc.objectId);
    if (!record || record.domain !== 'user_upload') {
      throw new Error(`storage object 不存在: ${loc.objectId}`);
    }
    return resolveUserUploadAccessUrl({
      objectId: record.id,
      bucket: record.bucket,
      key: record.object_key,
      provider: record.provider,
    });
  }

  if (loc?.kind === 'media-asset') {
    if (config.accessMode === 'public' && config.publicBaseUrl && !config.publicBaseUrl.includes('/media/public')) {
      return `${config.publicBaseUrl.replace(/\/+$/, '')}/${loc.key}`;
    }
    if (config.accessMode === 'presigned') {
      const service = RepositoryFactory.getStorageService();
      const adapter = service.forDomain('user_upload');
      const ttl = Number(process.env.STORAGE_USER_UPLOAD_PRESIGNED_TTL_SECONDS || 7 * 24 * 3600);
      return adapter.getPresignedUrl(loc.bucket, loc.key, ttl);
    }
  }

  if (isUrl(trimmed)) {
    return trimmed;
  }

  return trimmed;
}
