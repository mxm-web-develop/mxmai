/**
 * S3-compatible storage adapter (MinIO / R2 / Aliyun OSS)
 */

import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type {
  FileMetadata,
  IStorageRepository,
  ListFilesOptions,
  ListFilesResult,
  UploadOptions,
  UploadResult,
} from '../../interfaces/IStorageRepository';
import { DataAccessError, NotFoundError } from '../../interfaces/errors';
import type { ReadStreamRange } from '../../interfaces/ReadStreamRange';
import type { ProviderCredentials } from '../StorageProvider';
import { Readable } from 'stream';

function isAsciiHeaderValue(value: string): boolean {
  return /^[\x09\x0A\x0D\x20-\x7E]*$/.test(value);
}

function sanitizeMetadata(metadata?: Record<string, string>): Record<string, string> {
  if (!metadata) return {};
  const out: Record<string, string> = {};
  const dropped: Record<string, string> = {};
  for (const [k, v] of Object.entries(metadata)) {
    const str = String(v);
    if (isAsciiHeaderValue(str)) {
      out[k] = str;
    } else {
      dropped[k] = str;
    }
  }
  if (Object.keys(dropped).length > 0) {
    out.meta_json_b64 = Buffer.from(JSON.stringify(dropped), 'utf8').toString('base64');
  }
  return out;
}

async function streamToBuffer(body: unknown): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export class S3StorageAdapter implements IStorageRepository {
  private client: S3Client;
  private credentials: ProviderCredentials;

  constructor(credentials: ProviderCredentials, client?: S3Client) {
    this.credentials = credentials;
    this.client =
      client ||
      new S3Client({
        region: credentials.region,
        endpoint: credentials.endpoint,
        forcePathStyle: credentials.forcePathStyle ?? true,
        credentials: {
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey,
        },
      });
  }

  private buildPublicUrl(bucket: string, key: string): string {
    const base = (this.credentials.publicBaseUrl || this.credentials.endpoint).replace(/\/+$/, '');
    if (this.credentials.forcePathStyle) {
      return `${base}/${bucket}/${key}`;
    }
    return `${base}/${key}`;
  }

  async uploadFile(
    bucket: string,
    key: string,
    file: Buffer,
    options?: UploadOptions
  ): Promise<UploadResult> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: file,
          ContentType: options?.contentType,
          Metadata: sanitizeMetadata(options?.metadata),
        })
      );

      let presignedUrl: string | undefined;
      if (options?.expiresIn !== undefined) {
        presignedUrl = await this.getPresignedUrl(bucket, key, options.expiresIn);
      }

      return {
        url: this.buildPublicUrl(bucket, key),
        key,
        bucket,
        presignedUrl,
      };
    } catch (error) {
      throw new DataAccessError(
        `Failed to upload file: ${error instanceof Error ? error.message : String(error)}`,
        'UPLOAD_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }

  async downloadFile(bucket: string, key: string): Promise<Buffer> {
    try {
      const res = (await this.client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key })
      )) as { Body?: unknown };
      return await streamToBuffer(res.Body);
    } catch (error: unknown) {
      const err = error as { name?: string; Code?: string; message?: string };
      if (err.name === 'NoSuchKey' || err.Code === 'NoSuchKey' || err.name === 'NotFound') {
        throw new NotFoundError('File', key);
      }
      throw new DataAccessError(
        `Failed to download file: ${err.message || String(error)}`,
        'DOWNLOAD_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }

  async openReadStream(bucket: string, key: string, range?: ReadStreamRange): Promise<Readable> {
    try {
      const res = (await this.client.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
          ...(range ? { Range: `bytes=${range.start}-${range.end}` } : {}),
        })
      )) as { Body?: unknown };
      const body = res.Body;
      if (!body) {
        throw new DataAccessError('Empty object body', 'DOWNLOAD_ERROR');
      }
      if (body instanceof Readable) return body;
      if (Buffer.isBuffer(body) || body instanceof Uint8Array) {
        return Readable.from([Buffer.isBuffer(body) ? body : Buffer.from(body)]);
      }
      return Readable.from(body as AsyncIterable<Uint8Array>);
    } catch (error: unknown) {
      const err = error as { name?: string; Code?: string; message?: string };
      if (err.name === 'NoSuchKey' || err.Code === 'NoSuchKey' || err.name === 'NotFound') {
        throw new NotFoundError('File', key);
      }
      throw new DataAccessError(
        `Failed to open read stream: ${err.message || String(error)}`,
        'DOWNLOAD_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }

  async deleteFile(bucket: string, key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    } catch (error) {
      throw new DataAccessError(
        `Failed to delete file: ${error instanceof Error ? error.message : String(error)}`,
        'DELETE_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }

  async getFileMetadata(bucket: string, key: string): Promise<FileMetadata | null> {
    try {
      const res = (await this.client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: key })
      )) as {
        ContentLength?: number;
        ContentType?: string;
        LastModified?: Date;
        Metadata?: Record<string, string>;
      };
      return {
        key,
        bucket,
        size: res.ContentLength ?? 0,
        contentType: res.ContentType || 'application/octet-stream',
        lastModified: res.LastModified || new Date(),
        metadata: res.Metadata,
      };
    } catch (error: unknown) {
      const err = error as { name?: string; Code?: string };
      if (err.name === 'NotFound' || err.name === 'NoSuchKey' || err.Code === 'NotFound') {
        return null;
      }
      throw new DataAccessError(
        `Failed to get file metadata: ${error instanceof Error ? error.message : String(error)}`,
        'METADATA_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }

  async getPresignedUrl(bucket: string, key: string, expiresIn = 7 * 24 * 60 * 60): Promise<string> {
    try {
      // Optional: @aws-sdk/s3-request-presigner may be hoisted from mxmcgi
      const presigner = await import('@aws-sdk/s3-request-presigner').catch(() => null);
      if (presigner?.getSignedUrl) {
        const command = new GetObjectCommand({ Bucket: bucket, Key: key });
        return await presigner.getSignedUrl(this.client, command, { expiresIn });
      }
      return this.buildPublicUrl(bucket, key);
    } catch (error) {
      throw new DataAccessError(
        `Failed to generate presigned URL: ${error instanceof Error ? error.message : String(error)}`,
        'PRESIGNED_URL_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }

  async fileExists(bucket: string, key: string): Promise<boolean> {
    const meta = await this.getFileMetadata(bucket, key);
    return meta !== null;
  }

  async listFiles(bucket: string, options?: ListFilesOptions): Promise<ListFilesResult> {
    try {
      const res = (await this.client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: options?.prefix,
          MaxKeys: options?.maxKeys || 1000,
          ContinuationToken: options?.continuationToken,
        })
      )) as {
        Contents?: Array<{ Key?: string; Size?: number; LastModified?: Date }>;
        NextContinuationToken?: string;
        IsTruncated?: boolean;
      };
      const files: FileMetadata[] = (res.Contents || []).map((obj: { Key?: string; Size?: number; LastModified?: Date }) => ({
        key: obj.Key || '',
        bucket,
        size: obj.Size ?? 0,
        contentType: 'application/octet-stream',
        lastModified: obj.LastModified || new Date(),
      }));
      return {
        files,
        continuationToken: res.NextContinuationToken,
        hasMore: Boolean(res.IsTruncated),
      };
    } catch (error) {
      throw new DataAccessError(
        `Failed to list files: ${error instanceof Error ? error.message : String(error)}`,
        'LIST_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }

  async copyFile(
    sourceBucket: string,
    sourceKey: string,
    targetBucket: string,
    targetKey: string
  ): Promise<void> {
    if (sourceBucket === targetBucket && sourceKey === targetKey) return;
    try {
      await this.client.send(
        new CopyObjectCommand({
          Bucket: targetBucket,
          Key: targetKey,
          CopySource: `${sourceBucket}/${sourceKey}`,
        })
      );
    } catch (error) {
      throw new DataAccessError(
        `Failed to copy file: ${error instanceof Error ? error.message : String(error)}`,
        'COPY_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }
}
