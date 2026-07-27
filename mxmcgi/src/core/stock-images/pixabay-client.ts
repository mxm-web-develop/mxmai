/**
 * Pixabay 免费图库代理
 * 文档：https://pixabay.com/api/docs/
 */

import type { StockImageItem, StockImageSearchResult } from './stock-image-types';

const PIXABAY_SEARCH = 'https://pixabay.com/api/';

type PixabayHit = {
  id?: number;
  pageURL?: string;
  previewURL?: string;
  webformatURL?: string;
  largeImageURL?: string;
  imageWidth?: number;
  imageHeight?: number;
  user?: string;
  tags?: string;
};

export function resolvePixabayApiKey(): string | null {
  const key = (process.env.PIXABAY_API_KEY ?? process.env.PIXABAY ?? '').trim();
  return key || null;
}

export async function searchPixabayStockImages(
  input: { query: string; page?: number; pageSize?: number },
  apiKey?: string
): Promise<StockImageSearchResult> {
  const key = apiKey ?? resolvePixabayApiKey();
  if (!key) {
    return { items: [], total: 0, page: 1, pageSize: 20, pageCount: 0 };
  }

  const q = input.query.trim();
  if (!q) {
    return { items: [], total: 0, page: 1, pageSize: 20, pageCount: 0 };
  }

  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, input.pageSize ?? 20));

  const params = new URLSearchParams({
    key,
    q,
    image_type: 'photo',
    page: String(page),
    per_page: String(pageSize),
    safesearch: 'true',
  });

  const res = await fetch(`${PIXABAY_SEARCH}?${params.toString()}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'SuperMXMai/1.0 (reference-image-picker)',
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Pixabay 搜索失败 (${res.status})${text ? `: ${text.slice(0, 200)}` : ''}`);
  }

  const data = (await res.json()) as {
    totalHits?: number;
    hits?: PixabayHit[];
  };

  const items: StockImageItem[] = (data.hits ?? [])
    .map((row) => {
      const imageUrl = row.largeImageURL || row.webformatURL;
      if (!imageUrl?.startsWith('http')) return null;
      const thumbnailUrl = row.previewURL || row.webformatURL || imageUrl;
      const title =
        (row.tags && String(row.tags).split(',')[0]?.trim()) || `Pixabay #${row.id ?? ''}`;
      return {
        id: `pixabay-${row.id ?? imageUrl}`,
        title,
        thumbnailUrl,
        imageUrl,
        sourcePageUrl: String(row.pageURL || `https://pixabay.com/photos/${row.id ?? ''}`),
        creator: row.user != null ? String(row.user) : null,
        license: 'Pixabay License',
        width: typeof row.imageWidth === 'number' ? row.imageWidth : null,
        height: typeof row.imageHeight === 'number' ? row.imageHeight : null,
        provider: 'pixabay' as const,
      } satisfies StockImageItem;
    })
    .filter((row): row is StockImageItem => row != null);

  const total = Number(data.totalHits ?? items.length);
  const pageCount = pageSize > 0 ? Math.ceil(total / pageSize) : 0;

  return {
    items,
    total,
    page,
    pageSize,
    pageCount,
  };
}
