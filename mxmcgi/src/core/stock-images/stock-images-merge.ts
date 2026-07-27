import type { StockImageItem, StockImageSearchResult, StockImageSource } from './stock-image-types';

export function normalizeStockImageUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    u.search = '';
    return `${u.hostname}${u.pathname}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/** 多源结果轮询交错，同 URL 去重，保证来源多样性 */
export function interleaveStockImageItems(
  buckets: Array<{ source: StockImageSource; items: StockImageItem[] }>
): StockImageItem[] {
  const out: StockImageItem[] = [];
  const seen = new Set<string>();
  let round = 0;
  let addedInRound = true;

  while (addedInRound) {
    addedInRound = false;
    for (const bucket of buckets) {
      const item = bucket.items[round];
      if (!item) continue;
      const key = normalizeStockImageUrl(item.imageUrl);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...item, provider: item.provider ?? bucket.source });
      addedInRound = true;
    }
    round += 1;
  }

  return out;
}

export function mergeStockImageSearchResults(
  results: Array<{ source: StockImageSource; data: StockImageSearchResult }>,
  page: number,
  pageSize: number
): StockImageSearchResult {
  const mergedItems = interleaveStockImageItems(
    results.map((row) => ({ source: row.source, items: row.data.items }))
  );

  const total = results.reduce((sum, row) => sum + row.data.total, 0);
  const pageCount =
    pageSize > 0 ? Math.max(1, Math.ceil(total / pageSize)) : results[0]?.data.pageCount ?? 0;

  return {
    items: mergedItems.slice(0, pageSize),
    total,
    page,
    pageSize,
    pageCount,
  };
}

export const STOCK_IMAGE_SOURCE_LABEL: Record<StockImageSource, string> = {
  pexels: 'Pexels',
  unsplash: 'Unsplash',
  pixabay: 'Pixabay',
  openverse: 'Openverse',
};

export function buildMixedStockImageAttribution(sources: StockImageSource[]): string {
  if (sources.length === 0) {
    return '暂无可用图库来源，请配置 API Key 或稍后重试。';
  }
  if (sources.length === 1) {
    const name = STOCK_IMAGE_SOURCE_LABEL[sources[0]!];
    return `图片来源 ${name}，可免费用于个人与商业用途。选用即表示接受对应授权条款。`;
  }
  const names = sources.map((s) => STOCK_IMAGE_SOURCE_LABEL[s]).join('、');
  return `聚合 ${names} 等免费图库，按关键词混合展示高质量结果。选用即表示接受对应平台授权条款。`;
}
