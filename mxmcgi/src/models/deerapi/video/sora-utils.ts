/**
 * Sora 视频模型共用工具（size 规范化等）
 * 供 sora-2 / sora-2-pro 共用。
 */

/** Deer API 官方 sora-2 支持的 size 枚举 */
export const SORA2_SUPPORTED_SIZE = ['720x1280', '1280x720', '1024x1792', '1792x1024'] as const;
export type Sora2Size = (typeof SORA2_SUPPORTED_SIZE)[number];

/** 常见分辨率到支持 size 的映射（同比例） */
const SIZE_ALIAS: Record<string, Sora2Size> = {
  '1920x1080': '1280x720',
  '1080x1920': '720x1280',
};

/**
 * 将用户传入的 size 规范化为 Deer API 官方 sora-2 支持的枚举；不支持的会按比例映射。
 */
export function normalizeSize(size: string | undefined): Sora2Size | undefined {
  if (!size || typeof size !== 'string') return undefined;
  const s = size.trim();
  if (SORA2_SUPPORTED_SIZE.includes(s as Sora2Size)) return s as Sora2Size;
  const mapped = SIZE_ALIAS[s];
  if (mapped) return mapped;
  return undefined;
}
