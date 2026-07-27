import { normalizeStockImageUrl } from '../stock-images/stock-images-merge';

export type StockPickContext = {
  /** 已在本时间轴使用过的素材 URL（归一化后） */
  usedUrls: Set<string>;
};

export function normalizeStockMediaUrl(url: string): string {
  return normalizeStockImageUrl(url);
}

export function markStockUrlUsed(ctx: StockPickContext | undefined, url: string): void {
  if (!ctx?.usedUrls || !url.trim()) return;
  ctx.usedUrls.add(normalizeStockMediaUrl(url));
}

/** 从搜索结果中选取尚未使用的条目；必要时按 page 翻页 */
export function pickUnusedStockHit<T extends { imageUrl?: string; videoUrl?: string }>(
  items: T[],
  ctx: StockPickContext | undefined,
  urlKey: 'imageUrl' | 'videoUrl'
): T | null {
  for (const item of items) {
    const url = item[urlKey]?.trim();
    if (!url) continue;
    const key = normalizeStockMediaUrl(url);
    if (ctx?.usedUrls.has(key)) continue;
    markStockUrlUsed(ctx, url);
    return item;
  }
  return null;
}

const RELEVANCE_STOPWORDS = new Set([
  'a', 'an', 'the', 'of', 'and', 'or', 'to', 'in', 'on', 'at', 'by', 'for', 'with', 'from',
  'photo', 'photos', 'image', 'images', 'stock', 'free', 'royalty', 'hd', 'video', 'footage',
]);

/** 把 title / 页面 slug 切成可比对的英文词集合 */
function toTokenSet(...texts: Array<string | null | undefined>): Set<string> {
  const set = new Set<string>();
  for (const t of texts) {
    if (!t) continue;
    for (const w of t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ')) {
      if (w.length < 2 || RELEVANCE_STOPWORDS.has(w)) continue;
      set.add(w);
    }
  }
  return set;
}

/** 素材与本段检索词/关键词的相关性得分（命中词数，长词/专名加权） */
function relevanceScore(itemTokens: Set<string>, queryTokens: string[]): number {
  let score = 0;
  for (const q of queryTokens) {
    if (itemTokens.has(q)) score += q.length >= 5 ? 2 : 1;
  }
  return score;
}

/** 外链稳定度：Pexels/Unsplash 优先于常 502 的 Flickr/Openverse CDN */
function stockUrlStabilityBonus(url: string, provider?: string): number {
  const p = (provider ?? '').toLowerCase();
  if (p === 'pexels' || p === 'unsplash' || p === 'pixabay') return 3;
  if (/images\.pexels\.com|images\.unsplash\.com|pixabay\.com/i.test(url)) return 3;
  if (/staticflickr\.com|flickr\.com/i.test(url)) return -2;
  return 0;
}

/**
 * 相关性重排：在未使用过的候选里，选与本段检索词/关键词重合度最高的一条。
 * 同相关分时优先生图库 CDN（Pexels 等），降低 Flickr 502。
 * 全部得分为 0 时回退到「第一条未使用」。
 */
export function pickBestStockHit<
  T extends {
    imageUrl?: string;
    videoUrl?: string;
    title?: string;
    sourcePageUrl?: string;
    provider?: string;
  }
>(
  items: T[],
  ctx: StockPickContext | undefined,
  urlKey: 'imageUrl' | 'videoUrl',
  queryTerms: string[]
): { hit: T; scored: boolean } | null {
  const terms = queryTerms
    .map((t) => t.toLowerCase().trim())
    .filter((t) => t.length >= 2 && !RELEVANCE_STOPWORDS.has(t));

  let best: T | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  let firstUnused: T | null = null;

  for (const item of items) {
    const url = item[urlKey]?.trim();
    if (!url) continue;
    if (ctx?.usedUrls.has(normalizeStockMediaUrl(url))) continue;
    if (!firstUnused) firstUnused = item;

    const rel = terms.length ? relevanceScore(toTokenSet(item.title, item.sourcePageUrl), terms) : 0;
    const score = rel + stockUrlStabilityBonus(url, item.provider);
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }

  // 有相关性（rel>0）或仅靠稳定性选出的非 Flickr，视为 scored
  const hit = bestScore > 0 ? best : firstUnused;
  if (!hit) return null;
  return { hit, scored: bestScore > 0 };
}
