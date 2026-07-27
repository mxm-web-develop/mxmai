import crypto from 'crypto';
import type { StorageDomain } from './StorageDomain';
import type { DomainBackendConfig, SystemStorageConfig } from './StorageDomainConfig';
import { loadUserTempUploadConfig } from './loadStorageConfig';
import { loadStorageConfig } from './loadStorageConfig';
import { buildObjectKey, type PathTemplateVars } from './PathTemplateRegistry';
import { resolveStorageUrl } from './MediaUrlResolver';
import { resolveProviderCredentials } from './resolveProviderCredentials';
import { S3StorageAdapter } from './adapters/S3StorageAdapter';
import type { StorageProvider } from './StorageProvider';

export interface StorageObjectRef {
  domain: StorageDomain;
  provider: StorageProvider;
  bucket: string;
  key: string;
}

export interface StoredObject extends StorageObjectRef {
  url: string;
  contentType: string;
  size: number;
}

export interface UploadParams {
  domain: StorageDomain;
  purpose: string;
  buffer: Buffer;
  contentType: string;
  userId?: string;
  metadata?: Record<string, string>;
  pathVars?: PathTemplateVars;
  objectId?: string;
}

const adapterCache = new Map<StorageProvider, S3StorageAdapter>();

function getAdapter(provider: StorageProvider): S3StorageAdapter {
  let adapter = adapterCache.get(provider);
  if (!adapter) {
    adapter = new S3StorageAdapter(resolveProviderCredentials(provider));
    adapterCache.set(provider, adapter);
  }
  return adapter;
}

export function resetStorageAdapterCache(): void {
  adapterCache.clear();
}

export class StorageService {
  private config: SystemStorageConfig;

  constructor(config?: SystemStorageConfig) {
    this.config = config || loadStorageConfig();
  }

  getDomainConfig(domain: StorageDomain) {
    return this.config.domains[domain];
  }

  forDomain(domain: StorageDomain): S3StorageAdapter {
    const { provider } = this.config.domains[domain];
    return getAdapter(provider);
  }

  async upload(params: UploadParams): Promise<StoredObject> {
    const domainConfig = this.config.domains[params.domain];
    const key = buildObjectKey(params.domain, params.purpose, {
      userId: params.userId,
      folderPath: params.pathVars?.folderPath,
      ext: inferExt(params.contentType, params.pathVars?.ext),
      yyyy: params.pathVars?.yyyy || formatYyyy(new Date()),
      uuid: params.pathVars?.uuid || crypto.randomUUID(),
      scope: params.pathVars?.scope,
      taskId: params.pathVars?.taskId,
      index: params.pathVars?.index,
      name: params.pathVars?.name,
      category: params.pathVars?.category,
      version: params.pathVars?.version,
      filename: params.pathVars?.filename,
    });

    const uploadDomainConfig = resolveUploadDomainConfig(this.config, params);
    const adapter = getAdapter(uploadDomainConfig.provider);
    const metadata: Record<string, string> = {
      domain: params.domain,
      purpose: params.purpose,
      ...(params.userId ? { userId: params.userId } : {}),
      ...params.metadata,
    };

    const result = await adapter.uploadFile(uploadDomainConfig.bucket, key, params.buffer, {
      contentType: params.contentType,
      metadata,
    });

    const url = resolveStorageUrl({
      domain: params.domain,
      domainConfig: uploadDomainConfig,
      bucket: uploadDomainConfig.bucket,
      key,
      objectId: params.objectId,
    });

    return {
      domain: params.domain,
      provider: uploadDomainConfig.provider,
      bucket: uploadDomainConfig.bucket,
      key,
      url,
      contentType: params.contentType,
      size: params.buffer.length,
    };
  }

  async download(ref: StorageObjectRef): Promise<Buffer> {
    const adapter = getAdapter(ref.provider);
    return adapter.downloadFile(ref.bucket, ref.key);
  }

  async delete(ref: StorageObjectRef): Promise<void> {
    const adapter = getAdapter(ref.provider);
    await adapter.deleteFile(ref.bucket, ref.key);
  }

  resolveUrl(
    ref: StorageObjectRef & { objectId?: string },
    opts?: { gatewayOrigin?: string }
  ): string {
    const domainConfig = this.config.domains[ref.domain];
    return resolveStorageUrl({
      domain: ref.domain,
      domainConfig,
      bucket: ref.bucket,
      key: ref.key,
      objectId: ref.objectId,
      gatewayOrigin: opts?.gatewayOrigin,
    });
  }
}

let defaultService: StorageService | null = null;

export function getStorageService(): StorageService {
  // 每次读取最新 STORAGE_*（改 .env 后需重启进程；此处避免单例缓存旧 bucket）
  defaultService = new StorageService(loadStorageConfig());
  return defaultService;
}

export function resetStorageService(): void {
  defaultService = null;
  resetStorageAdapterCache();
}

function formatYyyy(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function resolveUploadDomainConfig(
  config: SystemStorageConfig,
  params: UploadParams
): DomainBackendConfig {
  const base = config.domains[params.domain];
  if (params.domain === 'user_upload' && params.purpose === 'temp') {
    const tempCfg = loadUserTempUploadConfig();
    if (tempCfg) return tempCfg;
  }
  return base;
}

function inferExt(contentType: string, extOverride?: string): string {
  if (extOverride) return extOverride.replace(/^\./, '');
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg';
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('gif')) return 'gif';
  if (contentType.includes('mp4')) return 'mp4';
  if (contentType.includes('pdf')) return 'pdf';
  if (contentType.includes('json')) return 'json';
  if (contentType.includes('text')) return 'txt';
  return 'bin';
}
