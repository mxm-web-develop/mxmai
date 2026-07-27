/**
 * Atlas generateVideo 请求体规范化：Seedance / T2V 使用 duration + resolution + ratio，
 * 禁止透传 width/height/size 等易触发 400（如 WidthTooSmall）的字段。
 */

import { isSeedance20Upstream, normalizeSeedanceBaseUpstream } from './seedance-video';

const ATLAS_VIDEO_MIN_EDGE = 300;
const ATLAS_VIDEO_MAX_EDGE = 6000;

const DROP_KEYS = [
  'width',
  'height',
  'fps',
  'size',
  'image_size',
  'aspect_ratio',
] as const;

export type NormalizeAtlasVideoBodyOptions = {
  /** generateVideo 路径上强制规范化（忽略 early-return） */
  force?: boolean;
};

function parseWxHSize(raw: unknown): { width?: number; height?: number } {
  if (typeof raw !== 'string') return {};
  const m = raw.trim().match(/^(\d+)\s*x\s*(\d+)$/i);
  if (!m) return {};
  const width = Number(m[1]);
  const height = Number(m[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return {};
  return { width, height };
}

function clampEdge(n: number): number {
  return Math.min(ATLAS_VIDEO_MAX_EDGE, Math.max(ATLAS_VIDEO_MIN_EDGE, Math.round(n)));
}

/**
 * 若业务仍传 width/height（旧模型），钳制到 Atlas 合法区间；否则删除。
 */
function sanitizeLegacyDimensions(body: Record<string, unknown>): void {
  const fromSize = parseWxHSize(body.size);
  let w = body.width != null ? Number(body.width) : fromSize.width;
  let h = body.height != null ? Number(body.height) : fromSize.height;

  if (Number.isFinite(w) && w > 0 && w < ATLAS_VIDEO_MIN_EDGE) w = ATLAS_VIDEO_MIN_EDGE;
  if (Number.isFinite(h) && h > 0 && h < ATLAS_VIDEO_MIN_EDGE) h = ATLAS_VIDEO_MIN_EDGE;
  if (Number.isFinite(w) && w > ATLAS_VIDEO_MAX_EDGE) w = ATLAS_VIDEO_MAX_EDGE;
  if (Number.isFinite(h) && h > ATLAS_VIDEO_MAX_EDGE) h = ATLAS_VIDEO_MAX_EDGE;

  delete body.width;
  delete body.height;

  // Seedance 路径不使用像素宽高；保留钳制逻辑供日后 legacy 分支复用
  void w;
  void h;
}

export function normalizeAtlasVideoGenerateBody(
  body: Record<string, unknown>,
  upstreamModel: string,
  options?: NormalizeAtlasVideoBodyOptions,
): void {
  const model = String(upstreamModel || body.model || '');
  const seedance = isSeedance20Upstream(model);
  const videoEndpoint = /\/(text-to-video|image-to-video|reference-to-video)(\/|$)/i.test(model);

  const shouldNormalize =
    options?.force === true ||
    seedance ||
    videoEndpoint ||
    body.resolution != null ||
    body.ratio != null;

  if (!shouldNormalize) {
    return;
  }

  for (const key of DROP_KEYS) {
    delete body[key];
  }
  sanitizeLegacyDimensions(body);

  if (body.duration == null && body.seconds != null) {
    const n = Number(body.seconds);
    if (Number.isFinite(n) && n > 0) body.duration = Math.round(n);
  }
  if (body.duration == null) body.duration = 5;
  if (!body.resolution) body.resolution = '720p';
  if (!body.ratio) body.ratio = 'adaptive';

  if (seedance && !/\/(text-to-video|image-to-video|reference-to-video)$/i.test(model)) {
    body.model = `${normalizeSeedanceBaseUpstream(model)}/text-to-video`;
  }
}

export { ATLAS_VIDEO_MIN_EDGE, ATLAS_VIDEO_MAX_EDGE, clampEdge };
