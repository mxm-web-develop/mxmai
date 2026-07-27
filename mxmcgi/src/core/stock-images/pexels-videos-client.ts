/**
 * Pexels 免费视频库代理
 * 文档：https://www.pexels.com/api/documentation/#videos-search
 */

import type { StockVideoItem, StockVideoSearchResult } from './stock-video-types';
import { resolvePexelsApiKey } from './pexels-client';
import {
  getCachedPexelsResult,
  isPexelsInCooldown,
  pexelsFetch,
  setCachedPexelsResult,
  withPexelsThrottle,
} from './pexels-throttle';

const PEXELS_VIDEO_SEARCH = 'https://api.pexels.com/videos/search';

type PexelsVideoFile = {
  id?: number;
  quality?: string;
  file_type?: string;
  width?: number;
  height?: number;
  link?: string;
};

type PexelsVideo = {
  id?: number;
  width?: number;
  height?: number;
  url?: string;
  duration?: number;
  user?: { name?: string; url?: string };
  image?: string;
  video_files?: PexelsVideoFile[];
};

export function pickBestPexelsVideoFile(
  files: PexelsVideoFile[] | undefined,
  preferWidth?: number
): string | null {
  const mp4s = (files ?? []).filter(
    (f) => f.file_type === 'video/mp4' && typeof f.link === 'string' && f.link.startsWith('http')
  );
  if (!mp4s.length) return null;

  const qualityRank = (q?: string) => {
    const v = (q ?? '').toLowerCase();
    if (v === 'hd') return 3;
    if (v === 'sd') return 2;
    return 1;
  };

  mp4s.sort((a, b) => {
    const qa = qualityRank(a.quality);
    const qb = qualityRank(b.quality);
    if (qb !== qa) return qb - qa;
    if (preferWidth && a.width && b.width) {
      return Math.abs(a.width - preferWidth) - Math.abs(b.width - preferWidth);
    }
    return (b.width ?? 0) - (a.width ?? 0);
  });

  return mp4s[0]!.link!;
}

function emptyResult(page: number, pageSize: number): StockVideoSearchResult {
  return { items: [], total: 0, page, pageSize, pageCount: 0 };
}

export async function searchPexelsStockVideos(
  input: { query: string; page?: number; pageSize?: number; preferWidth?: number },
  apiKey?: string
): Promise<StockVideoSearchResult> {
  const key = apiKey ?? resolvePexelsApiKey();
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(30, Math.max(1, input.pageSize ?? 10));
  if (!key) return emptyResult(page, pageSize);

  const q = input.query.trim();
  if (!q) return emptyResult(page, pageSize);

  const cacheKey = `vid:${q}:${page}:${pageSize}:${input.preferWidth ?? ''}`;
  const cached = getCachedPexelsResult<StockVideoSearchResult>(cacheKey);
  if (cached) return cached;

  if (isPexelsInCooldown()) {
    return emptyResult(page, pageSize);
  }

  try {
    return await withPexelsThrottle(async () => {
      const again = getCachedPexelsResult<StockVideoSearchResult>(cacheKey);
      if (again) return again;

      const params = new URLSearchParams({
        query: q,
        page: String(page),
        per_page: String(pageSize),
        locale: 'zh-CN',
      });

      const res = await pexelsFetch(`${PEXELS_VIDEO_SEARCH}?${params.toString()}`, {
        headers: {
          Accept: 'application/json',
          Authorization: key,
          'User-Agent': 'SuperMXMai/1.0 (video-edit-stock)',
        },
        signal: AbortSignal.timeout(20_000),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Pexels 视频搜索失败 (${res.status})${text ? `: ${text.slice(0, 200)}` : ''}`);
      }

      const data = (await res.json()) as {
        page?: number;
        per_page?: number;
        total_results?: number;
        videos?: PexelsVideo[];
      };

      const items: StockVideoItem[] = (data.videos ?? [])
        .map((row) => {
          const videoUrl = pickBestPexelsVideoFile(row.video_files, input.preferWidth);
          if (!videoUrl) return null;
          return {
            id: `pexels-video-${row.id ?? videoUrl}`,
            title: `Pexels Video #${row.id ?? ''}`,
            thumbnailUrl: String(row.image || videoUrl),
            videoUrl,
            sourcePageUrl: String(row.url || `https://www.pexels.com/video/${row.id ?? ''}`),
            creator: row.user?.name != null ? String(row.user.name) : null,
            license: 'Pexels License',
            width: typeof row.width === 'number' ? row.width : null,
            height: typeof row.height === 'number' ? row.height : null,
            durationSeconds: typeof row.duration === 'number' ? row.duration : null,
          } satisfies StockVideoItem;
        })
        .filter((row): row is StockVideoItem => row != null);

      const total = Number(data.total_results ?? items.length);
      const pageCount = pageSize > 0 ? Math.ceil(total / pageSize) : 0;

      const result: StockVideoSearchResult = {
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
    if (isPexelsInCooldown() || /429|Throttle|cooldown/i.test(String((e as Error)?.message ?? e))) {
      console.warn(`[pexels] 视频搜索降级为空：${e instanceof Error ? e.message : String(e)}`);
      return emptyResult(page, pageSize);
    }
    throw e;
  }
}
