/**
 * Cloudflare R2 上传工具（S3 兼容）
 * 用于参考图等需要公开访问的文件存储
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@aws-sdk/node-http-handler';
import crypto from 'crypto';

let r2Client: S3Client | null = null;

function getR2Config() {
  return {
    bucket: process.env.R2_BUCKET || 'mxmtemimageref',
    publicUrl: process.env.R2_PUBLIC_URL || 'https://pub-63b3ac2159304aa2a96decc0ae78bde0.r2.dev',
    endpoint: process.env.MINIO_ENDPOINT || '94c882e9a41e129c3f9d15c7a59d146c.r2.cloudflarestorage.com',
    accessKeyId: process.env.MINIO_ACCESS_KEY || '',
    secretAccessKey: process.env.MINIO_SECRET_KEY || '',
    region: process.env.MINIO_REGION || 'auto',
  };
}

function getR2Client(): S3Client {
  if (r2Client) return r2Client;

  const config = getR2Config();
  r2Client = new S3Client({
    region: config.region,
    endpoint: `https://${config.endpoint}`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    tls: true,
    // 使用自定义 HTTP handler 支持 R2 的证书
    requestHandler: new NodeHttpHandler({
      httpsAgent: {
        keepAlive: true,
        rejectUnauthorized: true,
      },
    }),
  });

  return r2Client;
}

/**
 * 上传 Buffer 到 R2，返回公开访问 URL
 */
export async function uploadToR2(
  data: Buffer,
  options: {
    contentType?: string;
    fileExtension?: string;
  } = {}
): Promise<{ url: string; key: string }> {
  const config = getR2Config();
  const ext = options.fileExtension || 'bin';
  const key = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

  const client = getR2Client();

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: data,
      ContentType: options.contentType || 'application/octet-stream',
      // R2 不需要 ACL 设置（使用 bucket 级别的 public access）
    })
  );

  // 公开访问 URL
  const publicUrl = `${config.publicUrl}/${config.bucket}/${key}`;

  return { url: publicUrl, key };
}

/**
 * 将 base64 数据上传到 R2
 * @param base64Data base64 字符串（带或不带 data URI 前缀均可）
 * @param options.contentType MIME 类型（如 image/jpeg）
 */
export async function uploadBase64ToR2(
  base64Data: string,
  options: {
    contentType?: string;
  } = {}
): Promise<{ url: string; key: string }> {
  // 提取 MIME 类型和实际数据
  let mimeType = options.contentType || 'image/jpeg';
  let dataStr = base64Data;

  if (base64Data.startsWith('data:')) {
    const match = base64Data.match(/^data:([^;]+);base64,(.*)$/);
    if (match) {
      mimeType = match[1];
      dataStr = match[2];
    }
  }

  // 推断文件扩展名
  const extFromMime: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
  };
  const ext = extFromMime[mimeType] || 'bin';

  const buffer = Buffer.from(dataStr, 'base64');
  return uploadToR2(buffer, { contentType: mimeType, fileExtension: ext });
}
