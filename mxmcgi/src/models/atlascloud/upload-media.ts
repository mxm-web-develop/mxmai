/**
 * AtlasCloud uploadMedia：参考图/视频素材须为 Atlas 可拉取的 storage URL。
 * Graph 生图与 Seedance 视频共用。
 */

import { RepositoryFactory } from '@mxmai/mxmdata';
import {
  loadGraphTaskImageBuffer,
  parseGraphMediaProxyTaskId,
} from '../../core/graph/tools/graph-tools-hd-image-io';
import {
  downloadReferenceImageBuffer,
  parseReferenceImageLocator,
} from '../../task/reference-image';
import { formatNodeFetchError } from '../../core/utils/format-node-fetch-error';
import { ATLAS_VIDEO_MIN_EDGE } from './video-body-normalize';
import {
  downloadBufferFromR2,
  getR2Config,
  getR2SystemTempBucket,
  getR2SystemTempPublicUrl,
} from '../../core/storage/r2-uploader';

export function isAtlasCloudHostedUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes('atlascloud.ai')) return true;
    // uploadMedia 实际返回的 OSS 加速域名
    if (host.includes('atlas-img') && host.includes('aliyuncs.com')) return true;
    return false;
  } catch {
    return false;
  }
}

function mimeToExt(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };
  return map[mimeType] || 'jpg';
}

function filenameFromUrl(url: string, contentType: string): string {
  try {
    const path = new URL(url).pathname;
    const base = path.split('/').pop();
    if (base && /\.[a-z0-9]+$/i.test(base)) return base;
  } catch {
    // ignore
  }
  return `ref.${mimeToExt(contentType)}`;
}

function guessContentTypeFromUrl(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes('.png')) return 'image/png';
  if (lower.includes('.webp')) return 'image/webp';
  if (lower.includes('.gif')) return 'image/gif';
  return 'image/jpeg';
}

function parseInternalAssetProxy(url: string): { bucket: string; key: string } | null {
  try {
    const parsed = new URL(url, 'http://local');
    const path = parsed.pathname || '';
    if (path.endsWith('/api/v1/media/asset') || path.endsWith('/media/asset')) {
      const bucket = parsed.searchParams.get('bucket') || '';
      const key = parsed.searchParams.get('key') || '';
      if (bucket && key) return { bucket, key };
    }
  } catch {
    // ignore
  }
  return null;
}

function parseR2PublicObject(url: string): { bucket: string; key: string } | null {
  const bases: Array<{ bucket: string; base: string }> = [
    { bucket: getR2SystemTempBucket(), base: getR2SystemTempPublicUrl().replace(/\/+$/, '') },
    { bucket: getR2Config().bucket, base: getR2Config().publicUrl.replace(/\/+$/, '') },
  ];
  for (const { bucket, base } of bases) {
    if (base && url.startsWith(`${base}/`)) {
      return { bucket, key: url.slice(base.length + 1) };
    }
  }
  // systemtemp 对象常挂在主桶 r2.dev 域名下，路径以 video-grid/ 开头
  const videoGridMatch = url.match(/^https?:\/\/[^/]+\.r2\.dev\/(video-grid\/.+)$/i);
  if (videoGridMatch) {
    return { bucket: getR2SystemTempBucket(), key: videoGridMatch[1] };
  }
  return null;
}

/**
 * Atlas 图生视频会校验参考图边长（≥300px）。宫格裁切/缩略图可能过小，上传前放大。
 */
export async function upscaleBufferForAtlasVideoMinEdge(
  buffer: Buffer,
  contentType: string,
): Promise<Buffer> {
  let sharp: typeof import('sharp');
  try {
    sharp = (await import('sharp')).default;
  } catch {
    return buffer;
  }

  const meta = await sharp(buffer).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) return buffer;
  if (width >= ATLAS_VIDEO_MIN_EDGE && height >= ATLAS_VIDEO_MIN_EDGE) return buffer;

  const scale = Math.max(ATLAS_VIDEO_MIN_EDGE / width, ATLAS_VIDEO_MIN_EDGE / height);
  const targetWidth = Math.round(width * scale);
  const targetHeight = Math.round(height * scale);

  let pipeline = sharp(buffer).resize(targetWidth, targetHeight, {
    fit: 'inside',
    withoutEnlargement: false,
  });

  if (contentType.includes('png')) {
    pipeline = pipeline.png();
  } else if (contentType.includes('webp')) {
    pipeline = pipeline.webp({ quality: 90 });
  } else {
    pipeline = pipeline.jpeg({ quality: 90 });
  }

  return pipeline.toBuffer();
}

type ResolveImageBufferOptions = { userId?: string };

async function resolveImageBuffer(
  source: string,
  opts?: ResolveImageBufferOptions,
): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
  const trimmed = source.trim();
  if (!trimmed) throw new Error('参考图为空');

  if (trimmed.startsWith('data:')) {
    const match = trimmed.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw new Error('无效的 data URI 参考图');
    const contentType = match[1];
    return {
      buffer: Buffer.from(match[2], 'base64'),
      contentType,
      filename: `ref.${mimeToExt(contentType)}`,
    };
  }

  const graphTaskId = parseGraphMediaProxyTaskId(trimmed);
  if (graphTaskId) {
    const buf = await loadGraphTaskImageBuffer(graphTaskId);
    const sharp = (await import('sharp')).default;
    const meta = await sharp(buf).metadata();
    const contentType =
      meta.format === 'png' ? 'image/png' : meta.format === 'webp' ? 'image/webp' : 'image/jpeg';
    return {
      buffer: buf,
      contentType,
      filename: `graph-task-${graphTaskId}.${mimeToExt(contentType)}`,
    };
  }

  const mediaLoc = parseReferenceImageLocator(trimmed);
  if (mediaLoc?.kind === 'media-object' || mediaLoc?.kind === 'media-asset') {
    return downloadReferenceImageBuffer(trimmed, opts?.userId);
  }

  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error(`不支持的参考图格式: ${trimmed.slice(0, 80)}`);
  }

  const asset = parseInternalAssetProxy(trimmed);
  if (asset) {
    const storageRepo = RepositoryFactory.createStorageRepository();
    const bufAny = await storageRepo.downloadFile(asset.bucket, asset.key);
    const meta = await storageRepo.getFileMetadata(asset.bucket, asset.key);
    const contentType =
      meta?.contentType ||
      guessContentTypeFromUrl(asset.key.endsWith('.png') ? `${asset.key}.png` : asset.key);
    const buf = Buffer.isBuffer(bufAny) ? bufAny : Buffer.from(bufAny as ArrayBuffer);
    return { buffer: buf, contentType, filename: filenameFromUrl(trimmed, contentType) };
  }

  const r2 = parseR2PublicObject(trimmed);
  if (r2) {
    try {
      const { buffer, contentType: r2Ct } = await downloadBufferFromR2(r2.key, r2.bucket);
      const contentType = r2Ct || guessContentTypeFromUrl(trimmed);
      return { buffer, contentType, filename: filenameFromUrl(trimmed, contentType) };
    } catch (signedErr) {
      try {
        const storageRepo = RepositoryFactory.createStorageRepository();
        const bufAny = await storageRepo.downloadFile(r2.bucket, r2.key);
        const meta = await storageRepo.getFileMetadata(r2.bucket, r2.key);
        const contentType = meta?.contentType || guessContentTypeFromUrl(trimmed);
        const buf = Buffer.isBuffer(bufAny) ? bufAny : Buffer.from(bufAny as ArrayBuffer);
        return { buffer: buf, contentType, filename: filenameFromUrl(trimmed, contentType) };
      } catch {
        const detail = signedErr instanceof Error ? signedErr.message : String(signedErr);
        throw new Error(`R2 参考图下载失败 (${r2.bucket}/${r2.key}): ${detail}`);
      }
    }
  }

  let resp: Response;
  try {
    resp = await fetch(trimmed);
  } catch (e) {
    throw new Error(`拉取参考图失败: ${formatNodeFetchError(trimmed, e)}`);
  }
  if (!resp.ok) {
    throw new Error(`拉取参考图失败: HTTP ${resp.status} ${trimmed}`);
  }
  const contentType = resp.headers.get('content-type')?.split(';')[0]?.trim() || guessContentTypeFromUrl(trimmed);
  const buffer = Buffer.from(await resp.arrayBuffer());
  return { buffer, contentType, filename: filenameFromUrl(trimmed, contentType) };
}

export async function uploadBufferToAtlasMedia(
  buffer: Buffer,
  filename: string,
  contentType: string,
  options: { apiKey: string; baseUrl?: string },
): Promise<string> {
  const base = String(options.baseUrl || process.env.ATLASCLOUD_BASE_URL || 'https://api.atlascloud.ai').replace(
    /\/+$/,
    '',
  );
  const form = new FormData();
  const blob = new Blob([buffer], { type: contentType });
  form.append('file', blob, filename);
  const uploadUrl = `${base}/api/v1/model/uploadMedia`;

  let resp: Response;
  try {
    resp = await fetch(uploadUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${options.apiKey}` },
      body: form,
    });
  } catch (e) {
    throw new Error(`AtlasCloud uploadMedia 网络异常: ${formatNodeFetchError(uploadUrl, e)}`);
  }

  const text = await resp.text().catch(() => '');
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    json = { raw: text };
  }
  if (!resp.ok) {
    const detail = String(json?.message || json?.msg || json?.error || json?.raw || '').trim();
    throw new Error(`AtlasCloud uploadMedia 失败: ${resp.status} ${detail}`.trim());
  }
  const data = json?.data as Record<string, unknown> | undefined;
  const url = (data?.download_url ?? json?.download_url) as string | undefined;
  if (!url || typeof url !== 'string') {
    throw new Error('AtlasCloud uploadMedia 未返回 download_url');
  }
  return url;
}

export async function ensureAtlasAccessibleUrl(
  source: string,
  options: { apiKey: string; baseUrl?: string; forVideo?: boolean; userId?: string },
): Promise<string> {
  const trimmed = source.trim();
  if (!trimmed) return trimmed;
  if (isAtlasCloudHostedUrl(trimmed)) return trimmed;
  const { buffer, contentType, filename } = await resolveImageBuffer(trimmed, {
    userId: options.userId,
  });
  const uploadBuf = options.forVideo
    ? await upscaleBufferForAtlasVideoMinEdge(buffer, contentType)
    : buffer;
  return uploadBufferToAtlasMedia(uploadBuf, filename, contentType, options);
}

const STRING_REF_KEYS = [
  'image',
  'input_reference',
  'reference_image_url',
  'last_frame',
  'last_frame_image',
] as const;

const ARRAY_REF_KEYS = ['reference_images', 'images'] as const;

export function bodyHasAtlasReferenceAssets(body: Record<string, unknown>): boolean {
  for (const key of STRING_REF_KEYS) {
    const v = body[key];
    if (typeof v === 'string' && v.trim()) return true;
  }
  for (const key of ARRAY_REF_KEYS) {
    const arr = body[key];
    if (Array.isArray(arr) && arr.some((item) => typeof item === 'string' && item.trim())) return true;
  }
  return false;
}

/** 将 prediction 请求体中的参考图转为 Atlas uploadMedia 公网 URL（图生 / 图编辑必填） */
export async function ensureAtlasReferenceUrlsInBody(
  body: Record<string, unknown>,
  options: { apiKey: string; baseUrl?: string; forVideo?: boolean; userId?: string },
): Promise<void> {
  const atlasOpts = { ...options, forVideo: options.forVideo === true };
  for (const key of STRING_REF_KEYS) {
    const v = body[key];
    if (typeof v === 'string' && v.trim() && !isAtlasCloudHostedUrl(v)) {
      body[key] = await ensureAtlasAccessibleUrl(v, atlasOpts);
    }
  }
  for (const key of ARRAY_REF_KEYS) {
    const arr = body[key];
    if (!Array.isArray(arr)) continue;
    body[key] = await Promise.all(
      arr.map(async (item) => {
        if (typeof item === 'string' && item.trim() && !isAtlasCloudHostedUrl(item)) {
          return ensureAtlasAccessibleUrl(item, atlasOpts);
        }
        return item;
      }),
    );
  }
  // nano-banana-2/edit 文档要求 images[]；仅有 body.image 时同步一份
  const us = String(body.model ?? '');
  if (us.includes('/edit')) {
    const img = typeof body.image === 'string' ? body.image.trim() : '';
    if (img && (!Array.isArray(body.images) || body.images.length === 0)) {
      body.images = [img];
    }
  }
}

/** 将 generateVideo 请求体中的参考图 URL 转为 Atlas storage URL */
export async function ensureAtlasVideoReferenceUrlsInBody(
  body: Record<string, unknown>,
  options: { apiKey: string; baseUrl?: string; userId?: string },
): Promise<void> {
  return ensureAtlasReferenceUrlsInBody(body, { ...options, forVideo: true });
}
