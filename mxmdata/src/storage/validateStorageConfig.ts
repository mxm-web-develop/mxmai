import type { StorageDomain } from './StorageDomain';
import type { SystemStorageConfig } from './StorageDomainConfig';
import { loadStorageConfig } from './loadStorageConfig';
import type { StorageProvider } from './StorageProvider';

const R2_BUCKET_RE = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;
const S3_DNS_BUCKET_RE = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;

export function assertValidStorageBucketName(provider: StorageProvider, bucket: string): void {
  if (bucket.length < 3 || bucket.length > 63) {
    throw new Error(`[storage] 桶名 "${bucket}" 长度须为 3–63（provider=${provider}）`);
  }
  if (provider === 'r2') {
    if (!R2_BUCKET_RE.test(bucket)) {
      throw new Error(
        `[storage] 桶名 "${bucket}" 不符合 R2 规则（仅 a-z、0-9、-，禁止下划线 _）。` +
          `请改 STORAGE_*_BUCKET 后重启 gateway/mxmcgi。`
      );
    }
    return;
  }
  if (!S3_DNS_BUCKET_RE.test(bucket)) {
    throw new Error(`[storage] 桶名 "${bucket}" 不符合 ${provider} 命名规则。`);
  }
}

export function validateStorageConfig(config: SystemStorageConfig = loadStorageConfig()): void {
  const domains: StorageDomain[] = ['generated', 'user_upload', 'system_static'];
  for (const domain of domains) {
    const d = config.domains[domain];
    assertValidStorageBucketName(d.provider, d.bucket);
  }
}

export function formatStorageConfigSummary(config: SystemStorageConfig = loadStorageConfig()): string {
  const parts = (['generated', 'user_upload', 'system_static'] as const).map((domain) => {
    const d = config.domains[domain];
    return `${domain}=${d.provider}/${d.bucket}`;
  });
  return parts.join(', ');
}
