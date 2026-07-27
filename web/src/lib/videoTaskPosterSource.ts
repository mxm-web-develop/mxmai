import type { WritingTaskItem } from '../api/client';
import { normalizeUrl, toRelativeMediaUrl } from '../utils/url';
import { getAutocutListPosterUrl } from './autocutClipPreviews';

function pickImageUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith('data:video/')) return undefined;
  if (/\.(mp4|webm|mov|avi)(\?|$)/i.test(trimmed)) return undefined;
  const normalized = normalizeUrl(trimmed) || trimmed;
  return toRelativeMediaUrl(normalized);
}

function readParams(task: WritingTaskItem): Record<string, unknown> | undefined {
  const rp = task.requestParams as Record<string, unknown> | undefined;
  const params = (rp?.params as Record<string, unknown> | undefined) ?? rp;
  const inner = params?.params as Record<string, unknown> | undefined;
  return inner ?? params;
}

/** 任务元数据或表单参考图，可作为列表封面（无需拉取成片） */
export function getVideoTaskStaticPosterUrl(task: WritingTaskItem): string | undefined {
  const meta = task.metadata as Record<string, unknown> | undefined;
  for (const key of ['thumbnail_url', 'cover_url', 'preview_url', 'poster_url'] as const) {
    const url = pickImageUrl(meta?.[key]);
    if (url) return url;
  }

  const autocutPoster = getAutocutListPosterUrl(task);
  if (autocutPoster) {
    const url = pickImageUrl(autocutPoster);
    if (url) return url;
  }

  const params = readParams(task);
  if (!params) return undefined;

  const refImages = params.reference_images;
  if (Array.isArray(refImages)) {
    for (const item of refImages) {
      const url = pickImageUrl(item);
      if (url) return url;
    }
  }

  for (const key of ['input_reference', 'reference_image_url', 'first_frame_image'] as const) {
    const url = pickImageUrl(params[key]);
    if (url) return url;
  }

  const gridImages = params.grid_images ?? params.storyboard_images;
  if (Array.isArray(gridImages)) {
    const firstIdx =
      typeof params.first_frame_index === 'number' && params.first_frame_index >= 0
        ? params.first_frame_index
        : 0;
    const cell = gridImages[firstIdx] ?? gridImages[0];
    if (cell && typeof cell === 'object' && cell !== null) {
      const url = pickImageUrl((cell as { url?: string; image?: string }).url ?? (cell as { image?: string }).image);
      if (url) return url;
    }
    const url = pickImageUrl(gridImages[0]);
    if (url) return url;
  }

  return undefined;
}
