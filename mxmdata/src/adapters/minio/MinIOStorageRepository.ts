/**
 * MinIO 存储仓库实现
 */

import { Client } from 'minio';
import type {
  IStorageRepository,
  UploadOptions,
  UploadResult,
  FileMetadata,
  ListFilesOptions,
  ListFilesResult,
} from '../../interfaces/IStorageRepository';
import { NotFoundError, DataAccessError } from '../../interfaces/errors';
import { getMinIOClient } from './MinIOClient';

export class MinIOStorageRepository implements IStorageRepository {
  private client: Client;

  constructor(client?: Client) {
    this.client = client || getMinIOClient();
  }

  private isAsciiHeaderValue(value: string): boolean {
    // S3/MinIO x-amz-meta-* header value must be ASCII; Node will throw ERR_INVALID_CHAR otherwise.
    // Allow visible ASCII plus common whitespace.
    return /^[\x09\x0A\x0D\x20-\x7E]*$/.test(value);
  }

  async uploadFile(
    bucket: string,
    key: string,
    file: Buffer,
    options?: UploadOptions
  ): Promise<UploadResult> {
    try {
      // 确保存储桶存在
      const bucketExists = await this.client.bucketExists(bucket);
      if (!bucketExists) {
        await this.client.makeBucket(bucket);
      }

      // 上传文件
      // MinIO 的 metadata 用于存储自定义元数据
      const metadata: Record<string, string> = {};
      if (options?.metadata) {
        // 将 metadata 中的所有值转换为字符串
        const dropped: Record<string, string> = {};
        for (const [k, v] of Object.entries(options.metadata)) {
          const str = String(v);
          if (this.isAsciiHeaderValue(str)) {
            metadata[k] = str;
          } else {
            // 非 ASCII 值不能进 header；先丢到一个聚合字段里（ASCII-safe）
            dropped[k] = str;
          }
        }
        if (Object.keys(dropped).length > 0) {
          // 用 base64 保存被丢弃的元数据（仍然是 ASCII），避免信息完全丢失
          const json = JSON.stringify(dropped);
          metadata['meta_json_b64'] = Buffer.from(json, 'utf8').toString('base64');
        }
      }

      // MinIO putObject 的 metadata 参数中，Content-Type 需要使用小写的 'content-type'
      // 这是 MinIO 客户端库的要求
      if (options?.contentType) {
        metadata['content-type'] = options.contentType;
      }

      await this.client.putObject(bucket, key, file, file.length, metadata);

      // 生成预签名URL（如果指定了过期时间）
      let presignedUrl: string | undefined;
      if (options?.expiresIn !== undefined) {
        presignedUrl = await this.getPresignedUrl(bucket, key, options.expiresIn);
      }

      // 构建访问URL（MinIO 默认端口 9000，可通过配置获取）
      const url = `${this.client['protocol']}://${this.client['host']}:${this.client['port']}/${bucket}/${key}`;

      return {
        url,
        key,
        bucket,
        presignedUrl,
      };
    } catch (error) {
      const err = error as Error & { errors?: unknown[]; cause?: unknown };
      let detail = '';
      if (err?.name === 'AggregateError' && Array.isArray(err?.errors)) {
        detail = err.errors.map((e: any) => e?.message ?? e?.code ?? String(e)).join('; ');
      } else if (err?.cause != null) {
        const c = err.cause as any;
        detail = c?.message ?? c?.code ?? String(c);
      }
      const message = detail
        ? `Failed to upload file: ${detail}`
        : `Failed to upload file: ${error}`;
      throw new DataAccessError(message, 'UPLOAD_ERROR', error as Error);
    }
  }

  async downloadFile(bucket: string, key: string): Promise<Buffer> {
    try {
      const chunks: Buffer[] = [];
      const stream = await this.client.getObject(bucket, key);

      return new Promise((resolve, reject) => {
        stream.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });

        stream.on('end', () => {
          resolve(Buffer.concat(chunks));
        });

        stream.on('error', (error: Error) => {
          if (error.message.includes('NoSuchKey') || error.message.includes('not found')) {
            reject(new NotFoundError('File', key));
          } else {
            reject(
              new DataAccessError(`Failed to download file: ${error.message}`, 'DOWNLOAD_ERROR', error)
            );
          }
        });
      });
    } catch (error: any) {
      if (error instanceof NotFoundError || error instanceof DataAccessError) {
        throw error;
      }
      
      // 检查是否是连接错误
      const isConnectionError = 
        error?.code === 'ECONNREFUSED' ||
        error?.code === 'ETIMEDOUT' ||
        error?.code === 'ENOTFOUND' ||
        error?.message?.includes('ECONNREFUSED') ||
        error?.message?.includes('ETIMEDOUT') ||
        error?.message?.includes('ENOTFOUND') ||
        (error?.originalError && (
          error.originalError.code === 'ECONNREFUSED' ||
          error.originalError.code === 'ETIMEDOUT' ||
          error.originalError.code === 'ENOTFOUND'
        ));
      
      if (isConnectionError) {
        throw new DataAccessError(
          `MinIO connection failed: Unable to connect to MinIO service. Please check if MinIO is running and the configuration is correct.`,
          'CONNECTION_ERROR',
          error as Error
        );
      }
      
      throw new DataAccessError(`Unexpected error downloading file: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async deleteFile(bucket: string, key: string): Promise<void> {
    try {
      await this.client.removeObject(bucket, key);
    } catch (error) {
      throw new DataAccessError(`Failed to delete file: ${error}`, 'DELETE_ERROR', error as Error);
    }
  }

  async getFileMetadata(bucket: string, key: string): Promise<FileMetadata | null> {
    try {
      const stat = await this.client.statObject(bucket, key);
      return {
        key,
        bucket,
        size: stat.size,
        contentType: stat.metaData['content-type'] || 'application/octet-stream',
        lastModified: stat.lastModified,
        metadata: stat.metaData,
      };
    } catch (error) {
      if (error instanceof Error && (error.message.includes('NoSuchKey') || error.message.includes('not found'))) {
        return null;
      }
      throw new DataAccessError(`Failed to get file metadata: ${error}`, 'METADATA_ERROR', error as Error);
    }
  }

  async getPresignedUrl(bucket: string, key: string, expiresIn: number = 7 * 24 * 60 * 60): Promise<string> {
    try {
      return await this.client.presignedGetObject(bucket, key, expiresIn);
    } catch (error) {
      throw new DataAccessError(`Failed to generate presigned URL: ${error}`, 'PRESIGNED_URL_ERROR', error as Error);
    }
  }

  async fileExists(bucket: string, key: string): Promise<boolean> {
    try {
      await this.client.statObject(bucket, key);
      return true;
    } catch (error) {
      if (error instanceof Error && (error.message.includes('NoSuchKey') || error.message.includes('not found'))) {
        return false;
      }
      // 其他错误也返回 false，或者可以抛出异常
      return false;
    }
  }

  async listFiles(bucket: string, options?: ListFilesOptions): Promise<ListFilesResult> {
    try {
      const objectsList: FileMetadata[] = [];
      const prefix = options?.prefix || '';
      const maxKeys = options?.maxKeys || 1000;

      const stream = this.client.listObjects(bucket, prefix, true);

      return new Promise((resolve, reject) => {
        let count = 0;
        let continuationToken: string | undefined;

        stream.on('data', (obj: any) => {
          if (count < maxKeys) {
            objectsList.push({
              key: obj.name,
              bucket,
              size: obj.size,
              contentType: 'application/octet-stream', // MinIO listObjects 不返回 contentType
              lastModified: obj.lastModified,
            });
            count++;
          } else {
            continuationToken = obj.name; // 使用最后一个对象名作为 continuation token
            stream.destroy();
          }
        });

        stream.on('end', () => {
          resolve({
            files: objectsList,
            continuationToken,
            hasMore: continuationToken !== undefined,
          });
        });

        stream.on('error', (error: Error) => {
          reject(
            new DataAccessError(`Failed to list files: ${error.message}`, 'LIST_ERROR', error)
          );
        });
      });
    } catch (error) {
      throw new DataAccessError(`Unexpected error listing files: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async copyFile(
    sourceBucket: string,
    sourceKey: string,
    targetBucket: string,
    targetKey: string
  ): Promise<void> {
    try {
      // MinIO 使用 copyObject 进行复制
      // 如果源和目标相同，直接返回
      if (sourceBucket === targetBucket && sourceKey === targetKey) {
        return;
      }

      // 使用 copyObject，第三个参数是源对象路径
      await this.client.copyObject(
        targetBucket,
        targetKey,
        `/${sourceBucket}/${sourceKey}`
      );
    } catch (error) {
      throw new DataAccessError(`Failed to copy file: ${error}`, 'COPY_ERROR', error as Error);
    }
  }
}

