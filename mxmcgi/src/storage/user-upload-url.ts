/**
 * 用户上传参考图 URL：按 STORAGE_USER_UPLOAD_ACCESS 返回 UI 代理 / 公网 / 预签名地址。
 */
import {
  RepositoryFactory,
  loadStorageConfig,
  userUploadObjectProxyPath,
  userUploadPublicObjectPath,
} from '@mxmai/mxmdata';

type UserUploadDomainConfig = ReturnType<typeof loadStorageConfig>['domains']['user_upload'];

const DEFAULT_PRESIGNED_TTL_SEC = 7 * 24 * 3600;

function presignedTtlSeconds(): number {
  const n = Number(process.env.STORAGE_USER_UPLOAD_PRESIGNED_TTL_SECONDS || DEFAULT_PRESIGNED_TTL_SEC);
  return Number.isFinite(n) && n > 60 ? Math.floor(n) : DEFAULT_PRESIGNED_TTL_SEC;
}

function resolveUserUploadAccessUrlFromConfig(
  config: UserUploadDomainConfig,
  params: { objectId: string; bucket: string; key: string }
): string | null {
  const { objectId, bucket, key } = params;

  if (config.accessMode === 'public') {
    if (config.publicBaseUrl?.includes('/api/v1/media/public')) {
      return userUploadPublicObjectPath(objectId);
    }
    if (config.publicBaseUrl) {
      return `${config.publicBaseUrl.replace(/\/+$/, '')}/${key}`;
    }
    return userUploadPublicObjectPath(objectId);
  }

  if (config.accessMode === 'proxy') {
    return userUploadObjectProxyPath(objectId);
  }

  return null;
}

/** 列表批量映射：proxy/public 同步生成 URL，仅 presigned 走 MinIO */
export async function resolveStorageObjectAccessUrls(
  objects: Array<{ id: string; bucket: string; object_key: string; provider: string }>
): Promise<string[]> {
  const config = loadStorageConfig().domains.user_upload;
  const needsPresign = config.accessMode === 'presigned';
  if (!needsPresign) {
    return objects.map((o) =>
      resolveUserUploadAccessUrlFromConfig(config, {
        objectId: o.id,
        bucket: o.bucket,
        key: o.object_key,
      })!
    );
  }
  const service = RepositoryFactory.getStorageService();
  const adapter = service.forDomain('user_upload');
  const ttl = presignedTtlSeconds();
  return Promise.all(objects.map((o) => adapter.getPresignedUrl(o.bucket, o.object_key, ttl)));
}

/** 列表接口：按 storage_objects 行解析当前 accessMode 下的 URL */
export async function resolveStorageObjectAccessUrl(object: {
  id: string;
  bucket: string;
  object_key: string;
  provider: string;
}): Promise<string> {
  return resolveUserUploadAccessUrl({
    objectId: object.id,
    bucket: object.bucket,
    key: object.object_key,
    provider: object.provider,
  });
}

export async function resolveUserUploadAccessUrl(params: {
  objectId: string;
  bucket: string;
  key: string;
  provider: string;
}): Promise<string> {
  const config = loadStorageConfig().domains.user_upload;
  const sync = resolveUserUploadAccessUrlFromConfig(config, {
    objectId: params.objectId,
    bucket: params.bucket,
    key: params.key,
  });
  if (sync) return sync;

  const service = RepositoryFactory.getStorageService();
  const adapter = service.forDomain('user_upload');
  return adapter.getPresignedUrl(params.bucket, params.key, presignedTtlSeconds());
}

/** 外网（大模型 Provider）可直接 GET 的 URL：public / presigned / 已是公网 CDN */
export function isExternallyFetchableReferenceUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) return false;
  try {
    const u = new URL(trimmed);
    const host = u.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === 'minio') return false;
    if (u.pathname.includes('/api/v1/media/object/') && !u.pathname.includes('/media/public/')) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
