import type { StorageAccessMode, StorageProvider } from './StorageProvider';
import type { StorageDomain } from './StorageDomain';

export interface DomainBackendConfig {
  provider: StorageProvider;
  bucket: string;
  accessMode: StorageAccessMode;
  publicBaseUrl?: string;
}

export interface SystemStorageConfig {
  version: 1;
  domains: Record<StorageDomain, DomainBackendConfig>;
}
