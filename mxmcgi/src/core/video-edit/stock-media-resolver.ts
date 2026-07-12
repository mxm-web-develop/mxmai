import { searchStockImages } from '../stock-images/stock-images-service';
import { searchStockVideos } from '../stock-images/stock-videos-service';
import {
  buildStockSearchQuery,
  normalizeStockQuery,
  type StockSearchQueryInput,
} from './stock-media-query';
import { pickBestStockHit, markStockUrlUsed, type StockPickContext } from './stock-media-pick';
import type { MxmClipMetadata } from './types';

const STOCK_PAGE_SIZE = 15;
const MAX_STOCK_PAGES = 3;

export type StockMediaResolveResult = {
  url: string;
  kind: 'image' | 'video';
  provider?: string;
  attribution?: string;
  title?: string;
};

export type StockMediaResolveOptions = StockSearchQueryInput & {
  preferWidth?: number;
  usedUrls?: Set<string>;
};

function pickContextFrom(opts?: StockMediaResolveOptions): StockPickContext | undefined {
  if (!opts?.usedUrls) return undefined;
  return { usedUrls: opts.usedUrls };
}

/** 本段用于相关性重排的词：检索词 + 段级英文关键词（含核心实体/专名） */
function relevanceTermsFor(meta: MxmClipMetadata, query: string): string[] {
  const terms = new Set<string>();
  for (const w of query.toLowerCase().split(/\s+/)) if (w) terms.add(w);
  const kw = normalizeStockQuery((meta.mxmStockKeywords ?? []).join(' '), 8);
  for (const w of kw.split(/\s+/)) if (w) terms.add(w);
  return [...terms];
}

export async function resolveStockImageForClip(
  meta: MxmClipMetadata,
  searchInput?: StockMediaResolveOptions
): Promise<StockMediaResolveResult | null> {
  const query = buildStockSearchQuery(meta, searchInput?.subtitleText, searchInput);
  const ctx = pickContextFrom(searchInput);
  const terms = relevanceTermsFor(meta, query);

  let fallback: { hit: { imageUrl?: string; title?: string; provider?: string }; attribution?: string; provider?: string } | null =
    null;

  for (let page = 1; page <= MAX_STOCK_PAGES; page++) {
    const { data, provider, attribution } = await searchStockImages({
      query,
      page,
      pageSize: STOCK_PAGE_SIZE,
    });
    const picked = pickBestStockHit(data.items, ctx, 'imageUrl', terms);
    if (picked?.hit.imageUrl) {
      if (picked.scored) {
        markStockUrlUsed(ctx, picked.hit.imageUrl);
        return {
          url: picked.hit.imageUrl,
          kind: 'image',
          provider: picked.hit.provider ?? provider,
          attribution,
          title: picked.hit.title,
        };
      }
      if (!fallback) fallback = { hit: picked.hit, attribution, provider };
    }
    if (data.items.length < STOCK_PAGE_SIZE) break;
  }

  if (fallback?.hit.imageUrl) {
    markStockUrlUsed(ctx, fallback.hit.imageUrl);
    return {
      url: fallback.hit.imageUrl,
      kind: 'image',
      provider: fallback.hit.provider ?? fallback.provider,
      attribution: fallback.attribution,
      title: fallback.hit.title,
    };
  }
  return null;
}

export async function resolveStockVideoForClip(
  meta: MxmClipMetadata,
  searchInput?: StockMediaResolveOptions,
  preferWidth?: number
): Promise<StockMediaResolveResult | null> {
  const query = buildStockSearchQuery(meta, searchInput?.subtitleText, searchInput);
  const ctx = pickContextFrom(searchInput);
  const terms = relevanceTermsFor(meta, query);
  const width = searchInput?.preferWidth ?? preferWidth;

  let fallback: { hit: { videoUrl?: string; title?: string }; attribution?: string; provider?: string } | null =
    null;

  for (let page = 1; page <= MAX_STOCK_PAGES; page++) {
    const { data, provider, attribution } = await searchStockVideos({
      query,
      page,
      pageSize: STOCK_PAGE_SIZE,
      preferWidth: width,
    });
    const picked = pickBestStockHit(data.items, ctx, 'videoUrl', terms);
    if (picked?.hit.videoUrl) {
      if (picked.scored) {
        markStockUrlUsed(ctx, picked.hit.videoUrl);
        return {
          url: picked.hit.videoUrl,
          kind: 'video',
          provider: provider ?? undefined,
          attribution,
          title: picked.hit.title,
        };
      }
      if (!fallback) fallback = { hit: picked.hit, attribution, provider };
    }
    if (data.items.length < STOCK_PAGE_SIZE) break;
  }

  if (fallback?.hit.videoUrl) {
    markStockUrlUsed(ctx, fallback.hit.videoUrl);
    return {
      url: fallback.hit.videoUrl,
      kind: 'video',
      provider: fallback.provider ?? undefined,
      attribution: fallback.attribution,
      title: fallback.hit.title,
    };
  }
  return null;
}

/**
 * 无用户素材时按开关解析：自动配视频 > 自动配图（默认开）
 */
export async function resolveAutoStockMediaForClip(
  meta: MxmClipMetadata,
  opts?: StockMediaResolveOptions
): Promise<StockMediaResolveResult | null> {
  const { preferWidth, ...searchInput } = opts ?? {};
  if (meta.mxmAutoStockVideo === true) {
    const video = await resolveStockVideoForClip(meta, opts, preferWidth);
    if (video) return video;
  }
  if (meta.mxmAutoStockImage !== false) {
    return resolveStockImageForClip(meta, searchInput);
  }
  return null;
}

/** 按时间轴顺序预分配自动素材，避免相邻/跨段重复使用同一 URL */
export async function preassignAutoStockForClipJobs(
  jobs: Array<{
    clipId: string;
    renderMode: string;
    metadata: MxmClipMetadata;
    stockSearch?: StockSearchQueryInput;
    targetWidth?: number;
  }>
): Promise<Map<string, StockMediaResolveResult>> {
  const usedUrls = new Set<string>();
  const out = new Map<string, StockMediaResolveResult>();

  for (const job of jobs) {
    if (job.renderMode !== 'static-image') continue;
    const meta = job.metadata;
    if (meta.mxmSourceImageUrl?.trim() || meta.mxmSourceVideoUrl?.trim()) continue;
    if (meta.mxmAutoStockVideo !== true && meta.mxmAutoStockImage === false) continue;

    const stock = await resolveAutoStockMediaForClip(meta, {
      preferWidth: job.targetWidth,
      ...job.stockSearch,
      usedUrls,
    });
    if (stock) out.set(job.clipId, stock);
  }
  return out;
}
