import { searchStockImages } from '../stock-images/stock-images-service';
import { searchStockVideos } from '../stock-images/stock-videos-service';
import { isPexelsInCooldown } from '../stock-images/pexels-throttle';
import {
  buildStockSearchQueryVariants,
  normalizeStockQuery,
  type StockSearchQueryInput,
} from './stock-media-query';
import { pickBestStockHit, markStockUrlUsed, type StockPickContext } from './stock-media-pick';
import {
  isInternalPersistedMediaUrl,
  persistStockMediaToUserTemp,
} from './stock-media-persist';
import type { MxmClipMetadata } from './types';

const STOCK_PAGE_SIZE = 12;
/** 每检索词最多翻页次数；过高会打爆 Pexels 小时配额 */
const MAX_STOCK_PAGES = 2;
/** 外链转存失败时换下一条候选的最大次数 */
const MAX_STOCK_PERSIST_ATTEMPTS = 3;

export type StockMediaResolveResult = {
  url: string;
  kind: 'image' | 'video';
  provider?: string;
  attribution?: string;
  title?: string;
  /** 实际命中的检索词（便于日志/审核排查） */
  queryUsed?: string;
  /** 是否为相关性非 0 的命中 */
  relevanceScored?: boolean;
  /** 原始外链（转存前） */
  upstreamUrl?: string;
  /** 用户临时存储 objectId */
  objectId?: string;
};

export type StockMediaResolveOptions = StockSearchQueryInput & {
  preferWidth?: number;
  usedUrls?: Set<string>;
};

function pickContextFrom(opts?: StockMediaResolveOptions): StockPickContext | undefined {
  if (!opts?.usedUrls) return undefined;
  return { usedUrls: opts.usedUrls };
}

/** 本段用于相关性重排的词：当前检索词 + 段级英文关键词（含核心实体/专名） */
function relevanceTermsFor(meta: MxmClipMetadata, query: string): string[] {
  const terms = new Set<string>();
  for (const w of query.toLowerCase().split(/\s+/)) if (w) terms.add(w);
  const kw = normalizeStockQuery((meta.mxmStockKeywords ?? []).join(' '), 8);
  for (const w of kw.split(/\s+/)) if (w) terms.add(w);
  return [...terms];
}

type ImageHit = {
  imageUrl?: string;
  title?: string;
  provider?: string;
  sourcePageUrl?: string;
};

type VideoHit = {
  videoUrl?: string;
  title?: string;
  sourcePageUrl?: string;
};

/**
 * 按 variants 换词搜索；优先返回相关性 > 0 的命中。
 * 全变体都 0 分时，才回退到「第一条未使用」的兜底。
 */
async function resolveWithQueryVariants<THit extends ImageHit | VideoHit>(args: {
  meta: MxmClipMetadata;
  searchInput?: StockMediaResolveOptions;
  urlKey: 'imageUrl' | 'videoUrl';
  kind: 'image' | 'video';
  searchPage: (query: string, page: number) => Promise<{
    items: THit[];
    provider?: string;
    attribution?: string;
  }>;
}): Promise<StockMediaResolveResult | null> {
  const { meta, searchInput, urlKey, kind, searchPage } = args;
  const ctx = pickContextFrom(searchInput);
  const allVariants = buildStockSearchQueryVariants(meta, searchInput?.subtitleText, searchInput);
  // Pexels 冷却时少打几次，优先靠 Openverse / 缓存命中
  const variants = isPexelsInCooldown() ? allVariants.slice(0, 1) : allVariants;

  let fallback: {
    hit: THit;
    attribution?: string;
    provider?: string;
    query: string;
  } | null = null;

  for (const query of variants) {
    const terms = relevanceTermsFor(meta, query);
    for (let page = 1; page <= MAX_STOCK_PAGES; page++) {
      let items: THit[] = [];
      let provider: string | undefined;
      let attribution: string | undefined;
      try {
        ({ items, provider, attribution } = await searchPage(query, page));
      } catch (e) {
        // 单次检索失败（含历史硬抛的 429）不中断整条时间轴
        console.warn(
          `[stock-media] ${kind} 检索失败 query="${query}" page=${page}: ${
            e instanceof Error ? e.message : String(e)
          }`
        );
        break;
      }
      const picked = pickBestStockHit(items, ctx, urlKey, terms);
      const url = picked?.hit?.[urlKey]?.trim();
      if (picked && url) {
        if (picked.scored) {
          markStockUrlUsed(ctx, url);
          return {
            url,
            kind,
            provider: (picked.hit as ImageHit).provider ?? provider,
            attribution,
            title: picked.hit.title,
            queryUsed: query,
            relevanceScored: true,
          };
        }
        if (!fallback) {
          fallback = { hit: picked.hit, attribution, provider, query };
        }
      }
      if (items.length < STOCK_PAGE_SIZE) break;
    }
  }

  const fbUrl = fallback?.hit?.[urlKey]?.trim();
  if (fallback && fbUrl) {
    markStockUrlUsed(ctx, fbUrl);
    return {
      url: fbUrl,
      kind,
      provider: (fallback.hit as ImageHit).provider ?? fallback.provider,
      attribution: fallback.attribution,
      title: fallback.hit.title,
      queryUsed: fallback.query,
      relevanceScored: false,
    };
  }
  return null;
}

export async function resolveStockImageForClip(
  meta: MxmClipMetadata,
  searchInput?: StockMediaResolveOptions
): Promise<StockMediaResolveResult | null> {
  return resolveWithQueryVariants<ImageHit>({
    meta,
    searchInput,
    urlKey: 'imageUrl',
    kind: 'image',
    searchPage: async (query, page) => {
      const { data, provider, attribution } = await searchStockImages({
        query,
        page,
        pageSize: STOCK_PAGE_SIZE,
      });
      return { items: data.items, provider, attribution };
    },
  });
}

export async function resolveStockVideoForClip(
  meta: MxmClipMetadata,
  searchInput?: StockMediaResolveOptions,
  preferWidth?: number
): Promise<StockMediaResolveResult | null> {
  const width = searchInput?.preferWidth ?? preferWidth;
  return resolveWithQueryVariants<VideoHit>({
    meta,
    searchInput,
    urlKey: 'videoUrl',
    kind: 'video',
    searchPage: async (query, page) => {
      const { data, provider, attribution } = await searchStockVideos({
        query,
        page,
        pageSize: STOCK_PAGE_SIZE,
        preferWidth: width,
      });
      return { items: data.items, provider: provider ?? undefined, attribution };
    },
  });
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

export type PreassignAutoStockOptions = {
  /** 转存到用户临时存储所需 */
  userId?: string;
  parentTaskId?: string;
};

/**
 * 命中外链后立刻转存用户 temp；失败则换下一条候选，避免渲染时再热拉 Flickr。
 */
export async function persistResolvedStockMedia(
  stock: StockMediaResolveResult,
  opts: {
    userId: string;
    parentTaskId?: string;
    clipId?: string;
  }
): Promise<StockMediaResolveResult> {
  if (isInternalPersistedMediaUrl(stock.url)) {
    return { ...stock, upstreamUrl: stock.upstreamUrl ?? stock.url };
  }

  const persisted = await persistStockMediaToUserTemp({
    url: stock.url,
    kind: stock.kind,
    userId: opts.userId,
    parentTaskId: opts.parentTaskId,
    clipId: opts.clipId,
    provider: stock.provider,
  });

  return {
    ...stock,
    url: persisted.url,
    upstreamUrl: persisted.upstreamUrl,
    objectId: persisted.objectId || undefined,
  };
}

/** 将已选中的库存 URL 写回 clip metadata，供重试/审核预览直接使用 MinIO */
export function applyStockResultToClipMetadata(
  meta: MxmClipMetadata,
  stock: StockMediaResolveResult
): void {
  if (stock.kind === 'video') {
    meta.mxmSourceVideoUrl = stock.url;
  } else {
    meta.mxmSourceImageUrl = stock.url;
  }
  if (stock.upstreamUrl && stock.upstreamUrl !== stock.url) {
    meta.mxmStockUpstreamUrl = stock.upstreamUrl;
  }
  if (stock.objectId) {
    meta.mxmSourceAssetId = stock.objectId;
  }
  if (stock.provider) {
    meta.mxmStockProvider = stock.provider;
  }
  if (stock.attribution) {
    meta.mxmStockAttribution = stock.attribution;
  }
}

/** 按时间轴顺序预分配自动素材，避免相邻/跨段重复使用同一 URL */
export async function preassignAutoStockForClipJobs(
  jobs: Array<{
    clipId: string;
    renderMode: string;
    metadata: MxmClipMetadata;
    stockSearch?: StockSearchQueryInput;
    targetWidth?: number;
  }>,
  opts?: PreassignAutoStockOptions
): Promise<Map<string, StockMediaResolveResult>> {
  const usedUrls = new Set<string>();
  const out = new Map<string, StockMediaResolveResult>();
  const userId = opts?.userId?.trim();

  for (const job of jobs) {
    if (job.renderMode !== 'static-image') continue;
    const meta = job.metadata;
    if (meta.mxmSourceImageUrl?.trim() || meta.mxmSourceVideoUrl?.trim()) continue;
    if (meta.mxmAutoStockVideo !== true && meta.mxmAutoStockImage === false) continue;

    let stock: StockMediaResolveResult | null = null;

    for (let attempt = 0; attempt < MAX_STOCK_PERSIST_ATTEMPTS; attempt++) {
      const candidate = await resolveAutoStockMediaForClip(meta, {
        preferWidth: job.targetWidth,
        ...job.stockSearch,
        usedUrls,
      });
      if (!candidate) break;

      if (!userId) {
        stock = candidate;
        break;
      }

      try {
        stock = await persistResolvedStockMedia(candidate, {
          userId,
          parentTaskId: opts?.parentTaskId,
          clipId: job.clipId,
        });
        break;
      } catch (err) {
        console.warn(
          `[stock-media] clip ${job.clipId} 转存临时存储失败（第 ${attempt + 1}/${MAX_STOCK_PERSIST_ATTEMPTS}）: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
        // URL 已在 resolve 时 mark 为 used，下一次会换候选
      }
    }

    if (stock) {
      applyStockResultToClipMetadata(meta, stock);
      out.set(job.clipId, stock);
      if (stock.relevanceScored === false) {
        console.warn(
          `[stock-media] clip ${job.clipId} 无相关性命中，兜底采用 query="${stock.queryUsed ?? ''}"`
        );
      }
    }
  }
  return out;
}
