import sharp from 'sharp';

const PREVIEW_MAX_EDGE = 512;
const PREVIEW_DEFAULT_EDGE = 240;
const PREVIEW_WEBP_QUALITY = 72;

export function parsePreviewMaxEdge(raw: unknown): number | null {
  if (raw === '1' || raw === 'true') return PREVIEW_DEFAULT_EDGE;
  if (raw == null || raw === '') return null;
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 32) return null;
  return Math.min(n, PREVIEW_MAX_EDGE);
}

/** 列表缩略图：缩放到 maxEdge 内接正方形，输出 webp */
export async function createImagePreviewBuffer(
  input: Buffer,
  maxEdge = PREVIEW_DEFAULT_EDGE
): Promise<{ buffer: Buffer; contentType: string }> {
  const edge = Math.min(Math.max(maxEdge, 32), PREVIEW_MAX_EDGE);
  const buffer = await sharp(input)
    .rotate()
    .resize(edge, edge, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: PREVIEW_WEBP_QUALITY })
    .toBuffer();
  return { buffer, contentType: 'image/webp' };
}
