/**
 * 图集 AlbumSpec — 从 shot-list 精简，仅保留配图所需字段
 */

export type AlbumAspectRatio = '1:1' | '4:3' | '16:9' | '9:16' | '3:2';

export type AlbumItem = {
  id: string;
  order: number;
  title: string;
  /** 配图核心展示内容 → content-illustration.core_content */
  mxmImagePrompt: string;
  aspect_ratio?: AlbumAspectRatio;
  notes?: string;
};

export type AlbumSpec = {
  title?: string;
  aspect_ratio?: AlbumAspectRatio;
  style_hint?: string;
  items: AlbumItem[];
};

export type AlbumResultItem = {
  id: string;
  order: number;
  title: string;
  mxmImagePrompt: string;
  imageUrl?: string;
  status: 'ready' | 'failed';
  error?: string;
  childTaskId?: string;
};

export type AlbumResult = {
  albumId: string;
  title: string;
  itemCount: number;
  aspect_ratio: string;
  coverUrl?: string;
  items: AlbumResultItem[];
};

export const ALBUM_MAX_ITEMS = 48;
export const ALBUM_DEFAULT_ASPECT: AlbumAspectRatio = '16:9';

/** 子任务 fan-out 默认并发（可用环境变量 ALBUM_IMAGE_CONCURRENCY 覆盖） */
export function albumImageConcurrency(): number {
  const raw = process.env.ALBUM_IMAGE_CONCURRENCY;
  if (raw === '0' || raw === 'unlimited' || raw === 'inf') return Number.POSITIVE_INFINITY;
  const n = raw ? Number(raw) : 24;
  if (!Number.isFinite(n) || n < 1) return 24;
  return Math.min(Math.floor(n), 64);
}
