import { RepositoryFactory, loadStorageConfig } from '@mxmai/mxmdata';

export function getGeneratedBucket(): string {
  return loadStorageConfig().domains.generated.bucket;
}

export function getUserUploadBucket(): string {
  return loadStorageConfig().domains.user_upload.bucket;
}

export function getSystemStaticBucket(): string {
  return loadStorageConfig().domains.system_static.bucket;
}

/**
 * Upload a generated-domain temp blob (video grid, HD source, etc.)
 * Returns a URL suitable for external providers (presigned when access=proxy).
 */
export async function uploadGeneratedTemp(params: {
  scope: string;
  taskId: string;
  name: string;
  buffer: Buffer;
  contentType: string;
  userId?: string;
  ext?: string;
}): Promise<{ key: string; bucket: string; url: string; provider: string }> {
  const service = RepositoryFactory.getStorageService();
  const purpose = `temp_${params.scope.replace(/-/g, '_')}`;
  const stored = await service.upload({
    domain: 'generated',
    purpose,
    userId: params.userId,
    buffer: params.buffer,
    contentType: params.contentType,
    pathVars: {
      scope: params.scope,
      taskId: params.taskId,
      name: params.name,
      ext: params.ext,
    },
  });

  const domainConfig = service.getDomainConfig('generated');
  let url = stored.url;
  if (domainConfig.accessMode === 'proxy') {
    const adapter = service.forDomain('generated');
    url = await adapter.getPresignedUrl(stored.bucket, stored.key, 7 * 24 * 3600);
  }

  return {
    key: stored.key,
    bucket: stored.bucket,
    url,
    provider: stored.provider,
  };
}

export async function deleteGeneratedBlob(params: {
  bucket: string;
  key: string;
}): Promise<void> {
  const service = RepositoryFactory.getStorageService();
  const provider = loadStorageConfig().domains.generated.provider;
  await service.delete({
    domain: 'generated',
    provider,
    bucket: params.bucket,
    key: params.key,
  });
}
