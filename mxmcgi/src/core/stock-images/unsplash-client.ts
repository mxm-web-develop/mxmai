/**
 * Unsplash 免费图库代理
 * 文档：https://unsplash.com/documentation#search-photos
 */

import type { StockImageItem, StockImageSearchResult } from './stock-image-types';

const UNSPLASH_SEARCH = 'https://api.unsplash.com/search/photos';

type UnsplashPhoto = {
  id?: string;
  description?: string | null;
  alt_description?: string | null;
  width?: number;
  height?: number;
  urls?: {
    raw?: string;
    full?: string;
    regular?: string;
    small?: string;
    thumb?: string;
  };
  links?: { html?: string };
  user?: { name?: string };
};

export function resolveUnsplashAccessKey(): string | null {
  const key = (process.env.UNSPLASH_ACCESS_KEY ?? process.env.UNSPLASH ?? '').trim();
  return key || null;
}

export async function searchUnsplashStockImages(
  input: { query: string; page?: number; pageSize?: number },
  accessKey?: string
): Promise<StockImageSearchResult> {
  const key = accessKey ?? resolveUnsplashAccessKey();
  if (!key) {
    return { items: [], total: 0, page: 1, pageSize: 20, pageCount: 0 };
  }

  const q = input.query.trim();
  if (!q) {
    return { items: [], total: 0, page: 1, pageSize: 20, pageCount: 0 };
  }

  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(30, Math.max(1, input.pageSize ?? 20));

  const params = new URLSearchParams({
    query: q,
    page: String(page),
    per_page: String(pageSize),
  });

  const res = await fetch(`${UNSPLASH_SEARCH}?${params.toString()}`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Client-ID ${key}`,
      'User-Agent': 'SuperMXMai/1.0 (reference-image-picker)',
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Unsplash 搜索失败 (${res.status})${text ? `: ${text.slice(0, 200)}` : ''}`);
  }

  const data = (await res.json()) as {
    total?: number;
    total_pages?: number;
    results?: UnsplashPhoto[];
  };

  const items: StockImageItem[] = (data.results ?? [])
    .map((row) => {
      const imageUrl = row.urls?.regular || row.urls?.full || row.urls?.small;
      if (!imageUrl?.startsWith('http')) return null;
      const thumbnailUrl = row.urls?.small || row.urls?.thumb || imageUrl;
      const title =
        (row.description && String(row.description).trim()) ||
        (row.alt_description && String(row.alt_description).trim()) ||
        `Unsplash #${row.id ?? ''}`;
      return {
        id: `unsplash-${row.id ?? imageUrl}`,
        title,
        thumbnailUrl,
        imageUrl,
        sourcePageUrl: String(row.links?.html || `https://unsplash.com/photos/${row.id ?? ''}`),
        creator: row.user?.name != null ? String(row.user.name) : null,
        license: 'Unsplash License',
        width: typeof row.width === 'number' ? row.width : null,
        height: typeof row.height === 'number' ? row.height : null,
        provider: 'unsplash' as const,
      } satisfies StockImageItem;
    })
    .filter((row): row is StockImageItem => row != null);

  const total = Number(data.total ?? items.length);
  const pageCount = Number(data.total_pages ?? (pageSize > 0 ? Math.ceil(total / pageSize) : 0));

  return {
    items,
    total,
    page,
    pageSize,
    pageCount,
  };
}
