export const STORAGE_PROVIDERS = ['minio', 'r2', 'aliyun_oss'] as const;

export type StorageProvider = (typeof STORAGE_PROVIDERS)[number];

export type StorageAccessMode = 'proxy' | 'public' | 'presigned';

export function isStorageProvider(value: string): value is StorageProvider {
  return (STORAGE_PROVIDERS as readonly string[]).includes(value);
}

export interface ProviderCredentials {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
  publicBaseUrl?: string;
}
