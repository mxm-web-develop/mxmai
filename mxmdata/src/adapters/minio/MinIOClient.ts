/**
 * MinIO 客户端封装
 */

import { Client, ClientOptions } from 'minio';

let minioClient: Client | null = null;

export interface MinIOConfig {
  endPoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
  region?: string;
}

/**
 * 初始化 MinIO 客户端
 */
export function initMinIOClient(config: MinIOConfig): Client {
  if (minioClient) {
    return minioClient;
  }

  const options: ClientOptions = {
    endPoint: config.endPoint,
    port: config.port,
    useSSL: config.useSSL,
    accessKey: config.accessKey,
    secretKey: config.secretKey,
  };

  if (config.region) {
    options.region = config.region;
  }

  minioClient = new Client(options);
  return minioClient;
}

/**
 * 获取 MinIO 客户端实例
 */
export function getMinIOClient(): Client {
  if (!minioClient) {
    throw new Error('MinIO client not initialized. Call initMinIOClient first.');
  }
  return minioClient;
}

/**
 * 重置客户端（主要用于测试）
 */
export function resetMinIOClient(): void {
  minioClient = null;
}

