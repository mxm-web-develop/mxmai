'use client';

import { PUBLISHED_OPEN_API_SLUGS as S } from '@/catalog/published-slugs';

const DRAFT_KEY = 'eshop-start-draft';
const MAX_IMAGES = 24;

export type StartDraftImage = {
  id: string;
  content: string;
  type: 'outfits' | 'main-subject';
  /** 来自本机任务目录 assets/{jobId}/{assetId} */
  sourceKey?: string;
};

export type StartDraft = {
  images: StartDraftImage[];
  updatedAt: string;
};

export function loadStartDraft(): StartDraft {
  if (typeof sessionStorage === 'undefined') return { images: [], updatedAt: '' };
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return { images: [], updatedAt: '' };
    const parsed = JSON.parse(raw) as StartDraft;
    return {
      images: Array.isArray(parsed.images) ? parsed.images : [],
      updatedAt: parsed.updatedAt ?? '',
    };
  } catch {
    return { images: [], updatedAt: '' };
  }
}

export function saveStartDraft(images: StartDraftImage[]): void {
  const draft: StartDraft = {
    images: images.slice(0, MAX_IMAGES),
    updatedAt: new Date().toISOString(),
  };
  sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export function clearStartDraft(): void {
  sessionStorage.removeItem(DRAFT_KEY);
}

export function buildPrefillForSlug(
  slug: string,
  images: StartDraftImage[]
): Record<string, unknown> {
  const refs = images.map((img) => ({ content: img.content, type: img.type }));
  if (!refs.length) return {};

  if (slug === S.smartflowSuite) {
    const model = refs.filter((r) => r.type === 'main-subject');
    const garments = refs.filter((r) => r.type === 'outfits');
    return {
      model_images: model.length ? model : [],
      garments:
        garments.length > 0
          ? [{ label: 'SKU-1', images: garments.slice(0, 3) }]
          : [{ label: 'SKU-1', images: refs.slice(0, 3) }],
    };
  }

  if (slug === S.poster) {
    return { product_images: refs };
  }

  if (slug === S.clothesVideo) {
    const still = refs.filter((r) => r.type === 'main-subject');
    return {
      hero_still_images: still.length ? still.slice(0, 1) : refs.slice(0, 1),
      motion_preset: 'gentle_turn',
      ratio: '9:16',
      resolution: '720p',
      duration: 5,
    };
  }

  const model = refs.filter((r) => r.type === 'main-subject');
  const garment = refs.filter((r) => r.type === 'outfits');
  return {
    model_images: model,
    garment_images: garment.length ? garment : refs,
  };
}
