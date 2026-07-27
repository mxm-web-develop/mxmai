import type { ProviderCredentials, StorageProvider } from './StorageProvider';

export function resolveProviderCredentials(provider: StorageProvider): ProviderCredentials {
  if (provider === 'minio') {
    const useSSL = process.env.MINIO_USE_SSL === 'true';
    const port = process.env.MINIO_PORT || '9000';
    const host = process.env.MINIO_ENDPOINT || 'localhost';
    const protocol = useSSL ? 'https' : 'http';
    return {
      endpoint: `${protocol}://${host}:${port}`,
      region: process.env.MINIO_REGION || 'us-east-1',
      accessKeyId: process.env.MINIO_ACCESS_KEY || 'minioadmin',
      secretAccessKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
      forcePathStyle: true,
      publicBaseUrl: `${protocol}://${host}:${port}`,
    };
  }

  if (provider === 'r2') {
    const endpoint = (process.env.R2_ENDPOINT || '').trim();
    if (!endpoint) {
      throw new Error(
        'R2_ENDPOINT 未配置：本地若仅用 MinIO，请勿删除 provider=r2 的历史对象前先配置 R2_*，或直接软删库记录'
      );
    }
    return {
      endpoint: endpoint.startsWith('http') ? endpoint : `https://${endpoint}`,
      region: process.env.R2_REGION || 'auto',
      accessKeyId: process.env.R2_ACCESS_KEY || '',
      secretAccessKey: process.env.R2_SECRET_KEY || '',
      forcePathStyle: true,
      publicBaseUrl: (process.env.R2_PUBLIC_URL || '').replace(/\/+$/, ''),
    };
  }

  // aliyun_oss
  const endpoint = process.env.OSS_ENDPOINT || 'oss-cn-hangzhou.aliyuncs.com';
  return {
    endpoint: endpoint.startsWith('http') ? endpoint : `https://${endpoint}`,
    region: process.env.OSS_REGION || 'cn-hangzhou',
    accessKeyId: process.env.OSS_ACCESS_KEY || '',
    secretAccessKey: process.env.OSS_SECRET_KEY || '',
    forcePathStyle: false,
    publicBaseUrl: (process.env.OSS_PUBLIC_URL || '').replace(/\/+$/, ''),
  };
}
