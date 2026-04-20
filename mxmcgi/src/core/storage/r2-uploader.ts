/**
 * Cloudflare R2 上传工具（Node.js 原生 https + AWS Signature V4）
 * 参考 Python requests 验证过的正确签名流程
 */

import crypto from 'crypto';
import https from 'https';

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

function hmacSha256(key: string | Buffer, msg: string): Buffer {
  return crypto.createHmac('sha256', key).update(msg).digest();
}

function sha256Hex(data: string): string {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

/**
 * 用 AWS Signature V4 签名 PUT 请求到 R2
 */
async function uploadViaPut(
  data: Buffer,
  key: string,
  contentType: string
): Promise<{ url: string; key: string }> {
  const config = getR2Config();
  const host = config.endpoint;
  const region = config.region;
  const service = 's3';

  const t = new Date();
  const dateStr = t.toISOString().replace(/[:-]|\.\d{3}/g, '').replace('T', 'T').replace('Z', 'Z');
  const dateOnly = dateStr.slice(0, 8);

  const method = 'PUT';
  const canonicalUri = `/${config.bucket}/${key}`;
  const canonicalQuerystring = '';
  const payloadHash = crypto.createHash('sha256').update(data).digest('hex');

  const canonicalHeaders = [
    `content-type:${contentType}`,
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${dateStr}`,
  ].join('\n') + '\n';

  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';

  const canonicalRequest = [
    method, canonicalUri, canonicalQuerystring, canonicalHeaders, signedHeaders, payloadHash,
  ].join('\n');

  const credentialScope = `${dateOnly}/${region}/${service}/aws4_request`;
  const hashedCanonicalRequest = sha256Hex(canonicalRequest);

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    dateStr,
    credentialScope,
    hashedCanonicalRequest,
  ].join('\n');

  // 计算签名密钥（和 Python 版本完全一致）
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

  const headers = {
    'Host': host,
    'Content-Type': contentType,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': dateStr,
    'Authorization': authHeader,
    'Content-Length': data.length,
  };

  console.log('[R2] Uploading to:', `https://${host}${canonicalUri}`);
  console.log('[R2] Content-Length:', data.length);

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: host,
      port: 443,
      path: canonicalUri,
      method: 'PUT',
      headers,
    }, (res) => {
      let body = '';
      res.on('data', (c: Buffer) => { body += c.toString(); });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          const publicUrl = `${config.publicUrl}/${config.bucket}/${key}`;
          console.log('[R2] Success:', publicUrl);
          resolve({ url: publicUrl, key });
        } else {
          console.error('[R2] Failed HTTP', res.statusCode, body.slice(0, 300));
          reject(new Error(`R2 upload failed: HTTP ${res.statusCode} - ${body.slice(0, 200)}`));
        }
      });
    });

    req.on('error', (err) => {
      console.error('[R2] Request error:', err.message);
      reject(new Error(`R2 upload error: ${err.message}`));
    });

    req.write(data);
    req.end();
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

  return uploadViaPut(data, key, contentType);
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
