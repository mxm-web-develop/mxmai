import type { StorageDomain } from './StorageDomain';
import type { DomainBackendConfig, SystemStorageConfig } from './StorageDomainConfig';
import type { StorageAccessMode, StorageProvider } from './StorageProvider';
import { isStorageProvider } from './StorageProvider';
import { defaultUserUploadGatewayPublicBase } from './MediaUrlResolver';

const DOMAIN_ENV_PREFIX: Record<StorageDomain, string> = {
  generated: 'STORAGE_GENERATED',
  user_upload: 'STORAGE_USER_UPLOAD',
  system_static: 'STORAGE_SYSTEM_STATIC',
};

function parseProvider(raw: string | undefined, fallback: StorageProvider): StorageProvider {
  const v = (raw || fallback).toLowerCase();
  return isStorageProvider(v) ? v : fallback;
}

function parseAccess(raw: string | undefined, fallback: StorageAccessMode): StorageAccessMode {
  const v = (raw || fallback).toLowerCase();
  if (v === 'proxy' || v === 'public' || v === 'presigned') return v;
  return fallback;
}

function legacyBucket(): string {
  return process.env.CGI_STORAGE_BUCKET || 'user-media';
}

/** 未显式配置时：有 R2 凭证则用户上传走 R2（与现网 r2-reference 一致） */
function defaultUserUploadProvider(): StorageProvider {
  if (process.env.STORAGE_USER_UPLOAD_PROVIDER) {
    return parseProvider(process.env.STORAGE_USER_UPLOAD_PROVIDER, 'minio');
  }
  if (process.env.R2_ACCESS_KEY?.trim() && process.env.R2_SECRET_KEY?.trim()) {
    return 'r2';
  }
  return 'minio';
}

function defaultUserUploadBucket(provider: StorageProvider): string {
  if (process.env.STORAGE_USER_UPLOAD_BUCKET) {
    return process.env.STORAGE_USER_UPLOAD_BUCKET;
  }
  if (provider === 'r2') {
    return process.env.R2_BUCKET || 'user-assets';
  }
  return legacyBucket();
}

function defaultMinioPublicBase(): string {
  const useSSL = process.env.MINIO_USE_SSL === 'true';
  const host = process.env.MINIO_ENDPOINT || 'localhost';
  const port = process.env.MINIO_PORT || '9000';
  const protocol = useSSL ? 'https' : 'http';
  return `${protocol}://${host}:${port}`;
}

function loadDomainConfig(domain: StorageDomain): DomainBackendConfig {
  const prefix = DOMAIN_ENV_PREFIX[domain];
  const bucketLegacy = legacyBucket();
  const userUploadProvider = defaultUserUploadProvider();

  const defaults: Record<StorageDomain, DomainBackendConfig> = {
    generated: {
      provider: 'minio',
      bucket: bucketLegacy,
      accessMode: 'proxy',
    },
    user_upload: {
      provider: userUploadProvider,
      bucket: defaultUserUploadBucket(userUploadProvider),
      accessMode: userUploadProvider === 'r2' ? 'public' : 'proxy',
      ...(userUploadProvider === 'r2'
        ? { publicBaseUrl: (process.env.R2_PUBLIC_URL || '').replace(/\/+$/, '') || undefined }
        : {}),
    },
    system_static: {
      // 本地默认 MinIO，避免未配 OSS 导致系统静态不可用
      provider: 'minio',
      bucket: bucketLegacy,
      accessMode: 'public',
      publicBaseUrl:
        process.env.STORAGE_SYSTEM_STATIC_PUBLIC_URL ||
        `${defaultMinioPublicBase()}/${bucketLegacy}`,
    },
  };

  const base = defaults[domain];
  const provider = parseProvider(process.env[`${prefix}_PROVIDER`], base.provider);
  const bucket = process.env[`${prefix}_BUCKET`] || base.bucket;
  const accessMode = parseAccess(process.env[`${prefix}_ACCESS`], base.accessMode);
  let publicBaseUrl = process.env[`${prefix}_PUBLIC_URL`];
  if (!publicBaseUrl && domain === 'user_upload' && accessMode === 'public' && provider === 'minio') {
    publicBaseUrl = defaultUserUploadGatewayPublicBase();
  }
  if (!publicBaseUrl && domain === 'system_static') {
    if (provider === 'r2') {
      publicBaseUrl = (process.env.R2_PUBLIC_URL || '').replace(/\/+$/, '') || undefined;
    } else if (provider === 'minio') {
      publicBaseUrl = base.publicBaseUrl;
    }
  }

  return {
    provider,
    bucket,
    accessMode,
    ...(publicBaseUrl ? { publicBaseUrl } : {}),
  };
}

export function loadStorageConfig(): SystemStorageConfig {
  return {
    version: 1,
    domains: {
      generated: loadDomainConfig('generated'),
      user_upload: loadDomainConfig('user_upload'),
      system_static: loadDomainConfig('system_static'),
    },
  };
}

/** Optional separate bucket for user_upload temp objects (P2). */
export function loadUserTempUploadConfig(): DomainBackendConfig | null {
  const bucket = process.env.STORAGE_USER_TEMP_BUCKET?.trim();
  if (!bucket) return null;
  const provider = parseProvider(
    process.env.STORAGE_USER_TEMP_PROVIDER,
    defaultUserUploadProvider()
  );
  const accessMode = parseAccess(process.env.STORAGE_USER_TEMP_ACCESS, 'proxy');
  let publicBaseUrl = process.env.STORAGE_USER_TEMP_PUBLIC_URL;
  if (!publicBaseUrl && provider === 'r2') {
    publicBaseUrl = (process.env.R2_PUBLIC_URL || '').replace(/\/+$/, '') || undefined;
  }
  return {
    provider,
    bucket,
    accessMode,
    ...(publicBaseUrl ? { publicBaseUrl } : {}),
  };
}

/** 用户上传临时文件 TTL（毫秒）。优先 `STORAGE_USER_TEMP_TTL_MINUTES`，否则 `STORAGE_USER_TEMP_TTL_DAYS`，默认 7 天。 */
export function userTempTtlMs(): number {
  const minutesRaw = process.env.STORAGE_USER_TEMP_TTL_MINUTES;
  if (minutesRaw != null && String(minutesRaw).trim() !== '') {
    const minutes = Number(minutesRaw);
    if (Number.isFinite(minutes) && minutes > 0) {
      return Math.round(minutes * 60 * 1000);
    }
  }
  const daysRaw = process.env.STORAGE_USER_TEMP_TTL_DAYS;
  if (daysRaw != null && String(daysRaw).trim() !== '') {
    const days = Number(daysRaw);
    if (Number.isFinite(days) && days > 0) {
      return Math.round(days * 24 * 60 * 60 * 1000);
    }
  }
  return 7 * 24 * 60 * 60 * 1000;
}

/** @deprecated 使用 userTempTtlMs；保留供文档/旧调用方 */
export function userTempTtlDays(): number {
  return userTempTtlMs() / (24 * 60 * 60 * 1000);
}
