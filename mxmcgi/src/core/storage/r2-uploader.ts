/**
 * Cloudflare R2 上传工具（Node.js 原生 https + AWS Signature V4）
 * 参考 Python requests 验证过的正确签名流程
 */

import crypto from 'crypto';
import https from 'https';

const EMPTY_PAYLOAD_HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b935ca495991b7852b855';

export function getR2Config() {
  return {
    bucket: process.env.R2_BUCKET || 'mxmtemimageref',
    publicUrl: process.env.R2_PUBLIC_URL || 'https://pub-63b3ac2159304aa2a96decc0ae78bde0.r2.dev',
    endpoint: process.env.R2_ENDPOINT || '94c882e9a41e129c3f9d15c7a59d146c.r2.cloudflarestorage.com',
    accessKeyId: process.env.R2_ACCESS_KEY || '',
    secretAccessKey: process.env.R2_SECRET_KEY || '',
    region: process.env.R2_REGION || 'auto',
  };
}

export function getR2BucketName(): string {
  return getR2Config().bucket;
}

export function getR2SystemTempBucket(): string {
  try {
    const { loadStorageConfig } = require('@mxmai/mxmdata');
    return loadStorageConfig().domains.generated.bucket;
  } catch {
    return process.env.R2_SYSTEMTEMP_BUCKET || 'systemtemp';
  }
}

export function getR2SystemTempPublicUrl(): string {
  return (
    process.env.R2_SYSTEMTEMP_PUBLIC_URL ||
    process.env.R2_PUBLIC_URL ||
    'https://pub-63b3ac2159304aa2a96decc0ae78bde0.r2.dev'
  );
}

function resolveR2PublicUrl(bucket: string, publicUrlOverride?: string): string {
  if (publicUrlOverride) return publicUrlOverride.replace(/\/+$/, '');
  const config = getR2Config();
  if (bucket === config.bucket) return config.publicUrl.replace(/\/+$/, '');
  if (bucket === getR2SystemTempBucket()) return getR2SystemTempPublicUrl().replace(/\/+$/, '');
  return config.publicUrl.replace(/\/+$/, '');
}

function hmacSha256(key: string | Buffer, msg: string): Buffer {
  return crypto.createHmac('sha256', key).update(msg).digest();
}

function sha256Hex(data: string): string {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

function buildAuthorization(
  method: string,
  canonicalUri: string,
  payloadHash: string,
  contentType: string | undefined,
  dateStr: string
): { headers: Record<string, string | number>; host: string } {
  const config = getR2Config();
  const host = config.endpoint;
  const region = config.region;
  const service = 's3';
  const dateOnly = dateStr.slice(0, 8);

  const canonicalQuerystring = '';
  const headerLines: string[] = [`host:${host}`, `x-amz-content-sha256:${payloadHash}`, `x-amz-date:${dateStr}`];
  const signedHeaderNames = ['host', 'x-amz-content-sha256', 'x-amz-date'];

  if (contentType) {
    headerLines.unshift(`content-type:${contentType}`);
    signedHeaderNames.unshift('content-type');
  }

  const canonicalHeaders = headerLines.join('\n') + '\n';
  const signedHeaders = signedHeaderNames.join(';');

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuerystring,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateOnly}/${region}/${service}/aws4_request`;
  const hashedCanonicalRequest = sha256Hex(canonicalRequest);

  const stringToSign = ['AWS4-HMAC-SHA256', dateStr, credentialScope, hashedCanonicalRequest].join('\n');

  const kDate = hmacSha256(Buffer.from('AWS4' + config.secretAccessKey, 'utf8'), dateOnly);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  const kSigning = hmacSha256(kService, 'aws4_request');
  const signature = hmacSha256(kSigning, stringToSign).toString('hex');

  const authHeader = [
    `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(', ');

  const headers: Record<string, string | number> = {
    Host: host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': dateStr,
    Authorization: authHeader,
  };
  if (contentType) {
    headers['Content-Type'] = contentType;
  }

  return { headers, host };
}

/**
 * 签名请求 R2（S3 兼容 API）
 */
async function signedR2Request(
  method: 'GET' | 'PUT' | 'HEAD' | 'DELETE',
  key: string,
  options: { bucket?: string; body?: Buffer; contentType?: string; timeoutMs?: number } = {}
): Promise<{ statusCode: number; body: Buffer }> {
  const config = getR2Config();
  if (!config.accessKeyId || !config.secretAccessKey) {
    throw new Error('R2 credentials not configured (R2_ACCESS_KEY / R2_SECRET_KEY)');
  }

  const bucket = options.bucket || config.bucket;
  const body = options.body;
  const payloadHash = body
    ? crypto.createHash('sha256').update(body).digest('hex')
    : EMPTY_PAYLOAD_HASH;

  const t = new Date();
  const dateStr = t.toISOString().replace(/[:-]|\.\d{3}/g, '').replace('T', 'T').replace('Z', 'Z');
  const canonicalUri = `/${bucket}/${key}`;
  const contentType = options.contentType;
  const { headers, host } = buildAuthorization(method, canonicalUri, payloadHash, contentType, dateStr);

  if (body) {
    headers['Content-Length'] = body.length;
  }

  const timeoutMs = options.timeoutMs ?? 15000;

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: host,
        port: 443,
        path: canonicalUri,
        method,
        headers,
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => {
          chunks.push(c);
        });
        res.on('end', () => {
          resolve({ statusCode: res.statusCode ?? 0, body: Buffer.concat(chunks) });
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error(`R2 ${method} timeout`));
    });

    req.on('error', (err) => {
      reject(new Error(`R2 ${method} error: ${err.message}`));
    });

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

/**
 * 检查 R2 对象是否存在（S3 HEAD）
 * 网络/权限异常时返回 true，避免误删库记录
 */
export async function objectExistsInR2(key: string, bucket?: string): Promise<boolean> {
  try {
    const res = await signedR2Request('HEAD', key, { bucket });
    if (res.statusCode === 200) return true;
    if (res.statusCode === 404) return false;
    console.warn('[R2] HEAD unexpected status', res.statusCode, key);
    return true;
  } catch (err) {
    console.warn('[R2] HEAD failed, skip sync purge:', key, err instanceof Error ? err.message : String(err));
    return true;
  }
}

/**
 * 从 R2 删除对象（S3 DELETE）；404 视为已删除
 */
export async function deleteFromR2(key: string, bucket?: string): Promise<void> {
  try {
    const { RepositoryFactory, loadStorageConfig } = await import('@mxmai/mxmdata');
    const cfg = loadStorageConfig().domains.generated;
    const b = bucket || cfg.bucket;
    await RepositoryFactory.getStorageService().delete({
      domain: 'generated',
      provider: cfg.provider,
      bucket: b,
      key,
    });
    return;
  } catch (err) {
    console.warn('[R2] StorageService delete fallback to signed DELETE:', key, err instanceof Error ? err.message : String(err));
  }
  const res = await signedR2Request('DELETE', key, { bucket });
  if (res.statusCode === 204 || res.statusCode === 200 || res.statusCode === 404) {
    return;
  }
  throw new Error(`R2 delete failed: HTTP ${res.statusCode} - ${res.body.toString('utf8').slice(0, 200)}`);
}

/**
 * 签名 GET 从 R2 下载对象（systemtemp 等无公网绑定的 bucket 必须用此方式）
 */
export async function downloadBufferFromR2(
  key: string,
  bucket?: string,
): Promise<{ buffer: Buffer; contentType?: string }> {
  try {
    const { RepositoryFactory, loadStorageConfig } = await import('@mxmai/mxmdata');
    const cfg = loadStorageConfig().domains.generated;
    const b = bucket || cfg.bucket;
    const buffer = await RepositoryFactory.getStorageService().download({
      domain: 'generated',
      provider: cfg.provider,
      bucket: b,
      key,
    });
    return { buffer };
  } catch {
    // legacy signed GET
  }
  const res = await signedR2Request('GET', key, { bucket, timeoutMs: 30000 });
  if (res.statusCode === 200) {
    return { buffer: res.body };
  }
  throw new Error(`R2 download failed: HTTP ${res.statusCode} key=${key} bucket=${bucket ?? 'default'}`);
}

/**
 * 用 AWS Signature V4 签名 PUT 请求到 R2
 */
async function uploadViaPut(
  data: Buffer,
  key: string,
  contentType: string,
  options: { bucket?: string; publicUrl?: string } = {}
): Promise<{ url: string; key: string; bucket: string }> {
  const config = getR2Config();
  const bucket = options.bucket || config.bucket;
  const publicBase = resolveR2PublicUrl(bucket, options.publicUrl);
  console.log('[R2] Uploading to:', `https://${config.endpoint}/${bucket}/${key}`);
  console.log('[R2] Content-Length:', data.length);

  const res = await signedR2Request('PUT', key, {
    bucket,
    body: data,
    contentType,
    timeoutMs: 30000,
  });

  if (res.statusCode >= 200 && res.statusCode < 300) {
    const publicUrl = `${publicBase}/${key}`;
    console.log('[R2] Success:', publicUrl);
    return { url: publicUrl, key, bucket };
  }

  console.error('[R2] Failed HTTP', res.statusCode, res.body.toString('utf8').slice(0, 300));
  throw new Error(`R2 upload failed: HTTP ${res.statusCode} - ${res.body.toString('utf8').slice(0, 200)}`);
}

/**
 * 上传 Buffer 到指定 bucket/key（宫格临时文件等）
 */
export async function uploadBufferToR2(
  data: Buffer,
  options: {
    bucket: string;
    key: string;
    contentType?: string;
    publicUrl?: string;
  }
): Promise<{ url: string; key: string; bucket: string }> {
  const contentType = options.contentType || 'application/octet-stream';
  return uploadViaPut(data, options.key, contentType, {
    bucket: options.bucket,
    publicUrl: options.publicUrl,
  });
}

/**
 * 上传 Buffer 到 R2
 */
export async function uploadToR2(
  data: Buffer,
  options: {
    contentType?: string;
    fileExtension?: string;
  } = {}
): Promise<{ url: string; key: string }> {
  const ext = options.fileExtension || 'bin';
  const key = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const contentType = options.contentType || 'application/octet-stream';

  return uploadViaPut(data, key, contentType, { bucket: getR2Config().bucket });
}

/**
 * 将 base64 数据上传到 R2
 */
export async function uploadBase64ToR2(
  base64Data: string,
  options: {
    contentType?: string;
  } = {}
): Promise<{ url: string; key: string }> {
  let mimeType = options.contentType || 'image/jpeg';
  let dataStr = base64Data;

  if (base64Data.startsWith('data:')) {
    const match = base64Data.match(/^data:([^;]+);base64,(.*)$/);
    if (match) {
      mimeType = match[1];
      dataStr = match[2];
    }
  }

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
