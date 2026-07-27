/**
 * 分镜选片：把外链库存素材转存到用户临时存储（user_upload / temp），
 * 避免渲染阶段再热拉 Flickr/Pexels 等外链（易 502/403）。
 */

import { uploadUserBlob } from '../../storage/user-upload-service';

const STOCK_FETCH_TIMEOUT_MS = 45_000;
const STOCK_FETCH_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export type PersistStockMediaInput = {
  url: string;
  kind: 'image' | 'video';
  userId: string;
  parentTaskId?: string;
  clipId?: string;
  provider?: string;
};

export type PersistStockMediaResult = {
  url: string;
  objectId: string;
  bucket: string;
  key: string;
  upstreamUrl: string;
  contentType: string;
};

/** 已是本平台媒体路径（或本机网关），无需再转存 */
export function isInternalPersistedMediaUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/api/v1/media/') || trimmed.startsWith('/media/')) return true;
  try {
    const pathname = new URL(trimmed).pathname;
    return (
      /\/api\/v1\/media\//.test(pathname) ||
      /\/media\/(?:public\/)?(?:object|audio|music|asset)\//.test(pathname)
    );
  } catch {
    return false;
  }
}

function extFromContentType(contentType: string, kind: 'image' | 'video'): string {
  const ct = contentType.toLowerCase().split(';')[0]!.trim();
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
  };
  if (map[ct]) return map[ct]!;
  return kind === 'video' ? 'mp4' : 'jpg';
}

function extFromUrl(url: string, kind: 'image' | 'video'): string {
  try {
    const path = new URL(url).pathname;
    const m = path.match(/\.([a-z0-9]{2,5})$/i);
    if (m?.[1]) return m[1]!.toLowerCase();
  } catch {
    /* ignore */
  }
  return kind === 'video' ? 'mp4' : 'jpg';
}

/** Flickr CDN 部分尺寸码会 502，尝试备选尺寸 */
function flickrSizeFallbackUrls(url: string): string[] {
  const m = url.match(
    /^(https?:\/\/live\.staticflickr\.com\/\d+\/\d+_[a-f0-9]+)(?:_([a-z]))?(\.[a-z]+)(?:\?.*)?$/i
  );
  if (!m) return [url];
  const base = m[1]!;
  const ext = m[3]!;
  const sizes = ['b', 'c', 'z', 'w', ''];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of sizes) {
    const candidate = s ? `${base}_${s}${ext}` : `${base}${ext}`;
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    out.push(candidate);
  }
  return [url, ...out.filter((u) => u !== url)];
}

function candidateDownloadUrls(url: string): string[] {
  if (/staticflickr\.com/i.test(url)) return flickrSizeFallbackUrls(url);
  return [url];
}

async function downloadStockBufferOnce(
  url: string
): Promise<{ buffer: Buffer; contentType: string }> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(STOCK_FETCH_TIMEOUT_MS),
    headers: {
      'User-Agent': STOCK_FETCH_UA,
      // 优先 jpeg/png，避开 AVIF（FFmpeg 部分版本对 demuxer/-loop 兼容差）
      Accept: 'image/jpeg,image/png,image/webp,image/*,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      Referer: /staticflickr\.com/i.test(url) ? 'https://www.flickr.com/' : 'https://www.google.com/',
    },
    redirect: 'follow',
  });
  if (!res.ok) {
    throw new Error(`下载库存素材失败 HTTP ${res.status}: ${url}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  if (!buffer.length) {
    throw new Error(`下载库存素材为空: ${url}`);
  }
  const contentType =
    res.headers.get('content-type')?.split(';')[0]?.trim() || 'application/octet-stream';
  return { buffer, contentType };
}

async function downloadStockBuffer(
  url: string
): Promise<{ buffer: Buffer; contentType: string }> {
  const candidates = candidateDownloadUrls(url);
  let lastErr: Error | undefined;
  for (const candidate of candidates) {
    try {
      return await downloadStockBufferOnce(candidate);
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastErr ?? new Error(`下载库存素材失败: ${url}`);
}

/**
 * 外链 → 用户临时存储（TTL 默认 7 天）；已是平台 URL 则原样返回。
 */
export async function persistStockMediaToUserTemp(
  input: PersistStockMediaInput
): Promise<PersistStockMediaResult> {
  const upstreamUrl = input.url.trim();
  if (!upstreamUrl) {
    throw new Error('库存素材 URL 为空');
  }

  if (isInternalPersistedMediaUrl(upstreamUrl)) {
    return {
      url: upstreamUrl,
      objectId: '',
      bucket: '',
      key: '',
      upstreamUrl,
      contentType: input.kind === 'video' ? 'video/mp4' : 'image/jpeg',
    };
  }

  const { buffer, contentType } = await downloadStockBuffer(upstreamUrl);
  const ext = extFromContentType(contentType, input.kind) || extFromUrl(upstreamUrl, input.kind);

  const uploaded = await uploadUserBlob({
    userId: input.userId,
    purpose: 'temp',
    storageMode: 'temp',
    buffer,
    contentType: contentType.startsWith('image/') || contentType.startsWith('video/')
      ? contentType
      : input.kind === 'video'
        ? 'video/mp4'
        : 'image/jpeg',
    taskId: input.parentTaskId,
    originalName: `stock-${input.clipId ?? 'clip'}.${ext}`,
    metadata: {
      kind: 'video-edit-stock',
      stockKind: input.kind,
      upstreamUrl: upstreamUrl.slice(0, 500),
      ...(input.clipId ? { clipId: input.clipId } : {}),
      ...(input.provider ? { stockProvider: input.provider } : {}),
      ...(input.parentTaskId ? { tempForTaskId: input.parentTaskId } : {}),
    },
  });

  return {
    url: uploaded.url,
    objectId: uploaded.objectId,
    bucket: uploaded.bucket,
    key: uploaded.key,
    upstreamUrl,
    contentType,
  };
}
