/**
 * Pexels 免费图库代理客户端
 * 文档：https://www.pexels.com/api/documentation/
 */

import type { StockImageItem, StockImageSearchResult } from './stock-image-types';
import {
  getCachedPexelsResult,
  isPexelsInCooldown,
  pexelsFetch,
  setCachedPexelsResult,
  withPexelsThrottle,
} from './pexels-throttle';

const PEXELS_SEARCH_BASE = 'https://api.pexels.com/v1/search';

type PexelsPhoto = {
  id?: number;
  width?: number;
  height?: number;
  url?: string;
  photographer?: string;
  photographer_url?: string;
  alt?: string;
  src?: {
    original?: string;
    large2x?: string;
    large?: string;
    medium?: string;
    small?: string;
    tiny?: string;
  };
};

export function resolvePexelsApiKey(): string | null {
  const key = (process.env.PEXELS_API_KEY ?? process.env.PEXELS ?? '').trim();
  return key || null;
}

function emptyResult(page: number, pageSize: number): StockImageSearchResult {
  return { items: [], total: 0, page, pageSize, pageCount: 0 };
}

export async function searchPexelsStockImages(
  input: { query: string; page?: number; pageSize?: number },
  apiKey: string
): Promise<StockImageSearchResult> {
  const q = input.query.trim();
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(80, Math.max(1, input.pageSize ?? 20));
  if (!q) return emptyResult(page, pageSize);

  const cacheKey = `img:${q}:${page}:${pageSize}`;
  const cached = getCachedPexelsResult<StockImageSearchResult>(cacheKey);
  if (cached) return cached;

  if (isPexelsInCooldown()) {
    return emptyResult(page, pageSize);
  }

  try {
    return await withPexelsThrottle(async () => {
      const again = getCachedPexelsResult<StockImageSearchResult>(cacheKey);
      if (again) return again;

      const params = new URLSearchParams({
        query: q,
        page: String(page),
        per_page: String(pageSize),
        locale: 'zh-CN',
      });

      const res = await pexelsFetch(`${PEXELS_SEARCH_BASE}?${params.toString()}`, {
        headers: {
          Accept: 'application/json',
          Authorization: apiKey,
          'User-Agent': 'SuperMXMai/1.0 (reference-image-picker)',
        },
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Pexels 搜索失败 (${res.status})${text ? `: ${text.slice(0, 200)}` : ''}`);
      }

      const data = (await res.json()) as {
        page?: number;
        per_page?: number;
        total_results?: number;
        photos?: PexelsPhoto[];
      };

      const items: StockImageItem[] = (data.photos ?? [])
        .map((row) => {
          const imageUrl = row.src?.large2x || row.src?.large || row.src?.original || row.src?.medium;
          if (!imageUrl?.startsWith('http')) return null;
          const thumbnailUrl = row.src?.medium || row.src?.small || row.src?.tiny || imageUrl;
          return {
            id: `pexels-${row.id ?? imageUrl}`,
            title: (row.alt && String(row.alt).trim()) || `Pexels #${row.id ?? ''}`,
            thumbnailUrl,
            imageUrl,
            sourcePageUrl: String(row.url || `https://www.pexels.com/photo/${row.id ?? ''}`),
            creator: row.photographer != null ? String(row.photographer) : null,
            license: 'Pexels License',
            width: typeof row.width === 'number' ? row.width : null,
            height: typeof row.height === 'number' ? row.height : null,
            provider: 'pexels' as const,
          } satisfies StockImageItem;
        })
        .filter((row): row is StockImageItem => row != null);

      const total = Number(data.total_results ?? items.length);
      const pageCount = pageSize > 0 ? Math.ceil(total / pageSize) : 0;

      const result: StockImageSearchResult = {
        items,
        total,
        page: Number(data.page ?? page),
        pageSize: Number(data.per_page ?? pageSize),
        pageCount,
      };
      setCachedPexelsResult(cacheKey, result);
      return result;
    });
  } catch (e) {
    // 冷却期内或限流耗尽：降级为空，交由其他图源 / 上层兜底
    if (isPexelsInCooldown() || /429|Throttle|cooldown/i.test(String((e as Error)?.message ?? e))) {
      console.warn(`[pexels] 图片搜索降级为空：${e instanceof Error ? e.message : String(e)}`);
      return emptyResult(page, pageSize);
    }
    throw e;
  }
}
