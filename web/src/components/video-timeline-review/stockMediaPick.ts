/** 与 mxmcgi stock-images-merge 一致：按 pathname 去重，忽略 query/hash */
export function normalizeStockMediaUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    u.search = '';
    return `${u.hostname}${u.pathname}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

export function pickUnusedStockHit<T extends { imageUrl?: string; videoUrl?: string }>(
  items: T[],
  usedUrls: Set<string>,
  urlKey: 'imageUrl' | 'videoUrl'
): T | null {
  for (const item of items) {
    const url = item[urlKey]?.trim();
    if (!url) continue;
    const key = normalizeStockMediaUrl(url);
    if (usedUrls.has(key)) continue;
    usedUrls.add(key);
    return item;
  }
  return null;
}

const RELEVANCE_STOPWORDS = new Set([
  'a', 'an', 'the', 'of', 'and', 'or', 'to', 'in', 'on', 'at', 'by', 'for', 'with', 'from',
  'photo', 'photos', 'image', 'images', 'stock', 'free', 'royalty', 'hd', 'video', 'footage',
]);

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

function relevanceScore(itemTokens: Set<string>, queryTokens: string[]): number {
  let score = 0;
  for (const q of queryTokens) {
    if (itemTokens.has(q)) score += q.length >= 5 ? 2 : 1;
  }
  return score;
}

/**
 * 相关性重排：在未使用过的候选里选与本段检索词/关键词重合度最高的一条，
 * 而非机械取第一条。与 mxmcgi `stock-media-pick.ts#pickBestStockHit` 对齐。
 * 不在此标记已用，由调用方在最终决定后写入 usedUrls。
 */
export function pickBestStockHit<
  T extends { imageUrl?: string; videoUrl?: string; title?: string; sourcePageUrl?: string }
>(
  items: T[],
  usedUrls: Set<string>,
  urlKey: 'imageUrl' | 'videoUrl',
  queryTerms: string[]
): { hit: T; scored: boolean } | null {
  const terms = queryTerms
    .map((t) => t.toLowerCase().trim())
    .filter((t) => t.length >= 2 && !RELEVANCE_STOPWORDS.has(t));

  let best: T | null = null;
  let bestScore = 0;
  let firstUnused: T | null = null;

  for (const item of items) {
    const url = item[urlKey]?.trim();
    if (!url) continue;
    if (usedUrls.has(normalizeStockMediaUrl(url))) continue;
    if (!firstUnused) firstUnused = item;
    if (!terms.length) break;
    const score = relevanceScore(toTokenSet(item.title, item.sourcePageUrl), terms);
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }

  const chosen = bestScore > 0 ? best : firstUnused;
  if (!chosen) return null;
  return { hit: chosen, scored: bestScore > 0 };
}
