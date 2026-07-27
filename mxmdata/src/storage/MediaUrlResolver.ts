import type { StorageDomain } from './StorageDomain';
import type { DomainBackendConfig } from './StorageDomainConfig';

export interface ResolveUrlParams {
  domain: StorageDomain;
  domainConfig: DomainBackendConfig;
  bucket: string;
  key: string;
  objectId?: string;
  gatewayOrigin?: string;
}

export function resolveStorageUrl(params: ResolveUrlParams): string {
  const { domain, domainConfig, bucket, key, objectId, gatewayOrigin } = params;
  const base = (gatewayOrigin || process.env.PUBLIC_GATEWAY_ORIGIN || '').replace(/\/+$/, '');

  if (domainConfig.accessMode === 'public' && domainConfig.publicBaseUrl) {
    const pub = domainConfig.publicBaseUrl.replace(/\/+$/, '');
    if (domain === 'user_upload' && isGatewayPublicUserUploadBase(pub) && objectId) {
      return buildGatewayPublicUserUploadUrl(pub, objectId, base);
    }
    return `${pub}/${key}`;
  }

  if (domain === 'user_upload' && objectId) {
    return userUploadObjectProxyPath(objectId);
  }

  if (domain === 'user_upload') {
    const path = `/api/v1/media/asset?bucket=${encodeURIComponent(bucket)}&key=${encodeURIComponent(key)}`;
    return base ? `${base}${path}` : path;
  }

  if (domain === 'system_static') {
    const path = `/api/v1/static/${key.replace(/^sys\//, '')}`;
    return base ? `${base}${path}` : path;
  }

  // generated: caller typically uses task-based proxy; fallback to asset
  const path = `/api/v1/media/asset?bucket=${encodeURIComponent(bucket)}&key=${encodeURIComponent(key)}`;
  return base ? `${base}${path}` : path;
}

export function userUploadObjectProxyPath(objectId: string): string {
  const path = `/api/v1/media/object/${encodeURIComponent(objectId)}`;
  // 默认返回相对路径，前端走同源/Vite proxy；需绝对 URL 时设 PUBLIC_GATEWAY_ABSOLUTE_URLS=1
  if (process.env.PUBLIC_GATEWAY_ABSOLUTE_URLS !== '1') {
    return path;
  }
  const base = (process.env.PUBLIC_GATEWAY_ORIGIN || '').replace(/\/+$/, '');
  return base ? `${base}${path}` : path;
}

/** Gateway 公网读（无 JWT），供大模型等外网拉取参考图 */
export function userUploadPublicObjectPath(objectId: string): string {
  const path = `/api/v1/media/public/object/${encodeURIComponent(objectId)}`;
  if (process.env.PUBLIC_GATEWAY_ABSOLUTE_URLS !== '1') {
    return path;
  }
  const base = (process.env.PUBLIC_GATEWAY_ORIGIN || '').replace(/\/+$/, '');
  return base ? `${base}${path}` : path;
}

function isGatewayPublicUserUploadBase(publicBaseUrl: string): boolean {
  return publicBaseUrl.includes('/api/v1/media/public');
}

function buildGatewayPublicUserUploadUrl(
  publicBase: string,
  objectId: string,
  gatewayOrigin: string
): string {
  const path = `${publicBase.replace(/\/+$/, '')}/object/${encodeURIComponent(objectId)}`;
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  return gatewayOrigin ? `${gatewayOrigin}${path}` : path;
}

/** MinIO 等无 CDN 时，默认走 Gateway 公网代理前缀 */
export function defaultUserUploadGatewayPublicBase(): string | undefined {
  const origin = (process.env.PUBLIC_GATEWAY_ORIGIN || '').replace(/\/+$/, '');
  return origin ? `${origin}/api/v1/media/public` : undefined;
}

export function isUserUploadPublicAccessEnabled(): boolean {
  const mode = (process.env.STORAGE_USER_UPLOAD_ACCESS || '').toLowerCase();
  if (mode === 'public') return true;
  return false;
}
