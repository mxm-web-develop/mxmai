/**
 * Openverse（原 CC Search）免费图库代理客户端
 * 文档：https://api.openverse.org/v1/
 */

import type { StockImageItem, StockImageSearchResult } from './stock-image-types';

export type { StockImageItem, StockImageSearchResult } from './stock-image-types';

type OpenverseImage = {
  id?: string;
  title?: string | null;
  thumbnail?: string | null;
  url?: string | null;
  foreign_landing_url?: string | null;
  creator?: string | null;
  license?: string | null;
  width?: number | null;
  height?: number | null;
};

const OPENVERSE_BASE = 'https://api.openverse.org/v1/images/';

export async function searchOpenverseStockImages(input: {
  query: string;
  page?: number;
  pageSize?: number;
}): Promise<StockImageSearchResult> {
  const q = input.query.trim();
  if (!q) {
    return { items: [], total: 0, page: 1, pageSize: 20, pageCount: 0 };
  }

  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(30, Math.max(1, input.pageSize ?? 20));

  const params = new URLSearchParams({
    q,
    page: String(page),
    page_size: String(pageSize),
    // 允许商用与改编的 CC 授权
    license_type: 'commercial,modification',
  });

  const res = await fetch(`${OPENVERSE_BASE}?${params.toString()}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'SuperMXMai/1.0 (reference-image-picker)',
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Openverse 搜索失败 (${res.status})${text ? `: ${text.slice(0, 200)}` : ''}`);
  }

  const data = (await res.json()) as {
    result_count?: number;
    page_count?: number;
    page?: number;
    page_size?: number;
    results?: OpenverseImage[];
  };

  const items: StockImageItem[] = (data.results ?? [])
    .filter((row) => typeof row.url === 'string' && row.url.startsWith('http'))
    .map((row) => ({
      id: String(row.id ?? row.url),
      title: (row.title && String(row.title).trim()) || '未命名图片',
      thumbnailUrl: String(row.thumbnail || row.url),
      imageUrl: String(row.url),
      sourcePageUrl: String(row.foreign_landing_url || row.url),
      creator: row.creator != null ? String(row.creator) : null,
      license: row.license != null ? String(row.license) : 'CC',
      width: typeof row.width === 'number' ? row.width : null,
      height: typeof row.height === 'number' ? row.height : null,
      provider: 'openverse' as const,
    }));

  return {
    items,
    total: Number(data.result_count ?? items.length),
    page: Number(data.page ?? page),
    pageSize: Number(data.page_size ?? pageSize),
    pageCount: Number(data.page_count ?? 0),
  };
}
