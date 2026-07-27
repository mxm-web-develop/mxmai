import type { MediaSourceOrigin } from './types';

const LABELS: Record<MediaSourceOrigin, string> = {
  upload: '本地上传',
  asset: '我的资产',
  'knowledge-folder': '我的资源',
  stock: '免费图库',
};

export function mediaSourceLabel(source?: MediaSourceOrigin, fallback?: string): string {
  if (fallback?.trim()) return fallback.trim();
  if (source) return LABELS[source];
  return '素材';
}
