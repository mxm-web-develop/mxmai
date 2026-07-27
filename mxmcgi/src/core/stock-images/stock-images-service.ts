import { searchOpenverseStockImages } from './openverse-client';
import { resolvePexelsApiKey, searchPexelsStockImages } from './pexels-client';
import { resolvePixabayApiKey, searchPixabayStockImages } from './pixabay-client';
import type { StockImageProvider, StockImageSearchResult, StockImageSource } from './stock-image-types';
import {
  buildMixedStockImageAttribution,
  mergeStockImageSearchResults,
} from './stock-images-merge';
import { resolveUnsplashAccessKey, searchUnsplashStockImages } from './unsplash-client';

export type { StockImageItem, StockImageSearchResult, StockImageProvider, StockImageSource } from './stock-image-types';

type SourceSearchFn = (input: {
  query: string;
  page: number;
  pageSize: number;
}) => Promise<StockImageSearchResult>;

function resolveActiveStockImageSources(): Array<{ source: StockImageSource; search: SourceSearchFn }> {
  const sources: Array<{ source: StockImageSource; search: SourceSearchFn }> = [];

  const pexelsKey = resolvePexelsApiKey();
  if (pexelsKey) {
    sources.push({
      source: 'pexels',
      search: (input) => searchPexelsStockImages(input, pexelsKey),
    });
  }

  const unsplashKey = resolveUnsplashAccessKey();
  if (unsplashKey) {
    sources.push({
      source: 'unsplash',
      search: (input) => searchUnsplashStockImages(input, unsplashKey),
    });
  }

  const pixabayKey = resolvePixabayApiKey();
  if (pixabayKey) {
    sources.push({
      source: 'pixabay',
      search: (input) => searchPixabayStockImages(input, pixabayKey),
    });
  }

  // Openverse 无需 Key，始终作为兜底源参与混合
  sources.push({
    source: 'openverse',
    search: (input) => searchOpenverseStockImages(input),
  });

  return sources;
}

export function getStockImageProvider(): StockImageProvider {
  const sources = resolveActiveStockImageSources();
  if (sources.length <= 1) return sources[0]?.source ?? 'openverse';
  return 'mixed';
}

export function listActiveStockImageSources(): StockImageSource[] {
  return resolveActiveStockImageSources().map((row) => row.source);
}

export async function searchStockImages(input: {
  query: string;
  page?: number;
  pageSize?: number;
}): Promise<{
  data: StockImageSearchResult;
  provider: StockImageProvider;
  sources: StockImageSource[];
  attribution: string;
}> {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(30, Math.max(1, input.pageSize ?? 20));
  const sources = resolveActiveStockImageSources();

  if (sources.length === 1) {
    const only = sources[0]!;
    const data = await only.search({ query: input.query, page, pageSize });
    return {
      data,
      provider: only.source,
      sources: [only.source],
      attribution: buildMixedStockImageAttribution([only.source]),
    };
  }

  const perSource = Math.max(2, Math.ceil(pageSize / sources.length));
  const settled = await Promise.allSettled(
    sources.map(async (row) => ({
      source: row.source,
      data: await row.search({ query: input.query, page, pageSize: perSource }),
    }))
  );

  const successful = settled
    .filter(
      (row): row is PromiseFulfilledResult<{ source: StockImageSource; data: StockImageSearchResult }> =>
        row.status === 'fulfilled'
    )
    .map((row) => row.value)
    .filter((row) => row.data.items.length > 0);

  if (successful.length === 0) {
    // 全部源失败/空结果：返回空列表，勿把单源 429 打成整任务失败（Openverse 等可继续）
    const firstError = settled.find((row) => row.status === 'rejected') as
      | PromiseRejectedResult
      | undefined;
    if (firstError?.reason) {
      console.warn(
        `[stock-images] 全部图源未命中：${
          firstError.reason instanceof Error ? firstError.reason.message : String(firstError.reason)
        }`
      );
    }
    return {
      data: { items: [], total: 0, page, pageSize, pageCount: 0 },
      provider: sources[0]?.source ?? 'openverse',
      sources: sources.map((s) => s.source),
      attribution: buildMixedStockImageAttribution(sources.map((s) => s.source)),
    };
  }

  const activeSources = successful.map((row) => row.source);
  const data = mergeStockImageSearchResults(successful, page, pageSize);

  return {
    data,
    provider: activeSources.length > 1 ? 'mixed' : activeSources[0]!,
    sources: activeSources,
    attribution: buildMixedStockImageAttribution(activeSources),
  };
}
