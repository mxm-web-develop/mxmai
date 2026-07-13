import { useEffect, useMemo, useRef, useState } from 'react';
import { searchStockImages, searchStockVideos } from '../../api/client';
import {
  buildStockSearchQuery,
  normalizeStockQuery,
  resolveClipSubtitleSearchContext,
  type StockSearchQueryInput,
} from './stockSearchQuery';
import { normalizeStockMediaUrl, pickBestStockHit } from './stockMediaPick';
import { runWithConcurrency } from './runWithConcurrency';
import {
  isAutoStockImageEnabled,
  isAutoStockVideoEnabled,
  type MxmClipMetadata,
  type TimelineSubtitle,
} from './types';
import { rewriteInternalStorageMediaUrl } from './voiceoverTimelineEnrich';
import type { VisualClipItem } from './timelineClipAtTime';

export type AutoStockPreview =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; kind: 'image' | 'video'; url: string; title?: string; attribution?: string }
  | { status: 'error'; message: string };

const STOCK_PAGE_SIZE = 12;
const MAX_STOCK_PAGES = 2;
const STOCK_FETCH_CONCURRENCY = 5;
/** 单段 auto-stock 整体超时：超过即标记为 error，让用户手动挑图，避免无限转圈 */
const STOCK_FETCH_TIMEOUT_MS = 12_000;

function stockSearchInputForClip(
  clip: VisualClipItem,
  subtitles: TimelineSubtitle[],
  projectTopic?: string
): StockSearchQueryInput {
  return resolveClipSubtitleSearchContext(
    subtitles,
    clip.startTime,
    clip.duration,
    projectTopic
  );
}

/** 本段用于相关性重排的词：检索词 + 段级英文关键词（含核心实体/专名） */
function relevanceTermsFor(meta: MxmClipMetadata, query: string): string[] {
  const terms = new Set<string>();
  for (const w of query.toLowerCase().split(/\s+/)) if (w) terms.add(w);
  const kw = normalizeStockQuery((meta.mxmStockKeywords ?? []).join(' '), 8);
  for (const w of kw.split(/\s+/)) if (w) terms.add(w);
  return [...terms];
}

async function fetchAutoStockForClip(
  clip: VisualClipItem,
  searchInput: StockSearchQueryInput,
  usedUrls: Set<string>,
  abort?: { cancelled: boolean }
): Promise<AutoStockPreview> {
  const meta = clip.metadata;
  if (!meta) return { status: 'idle' };
  const query = buildStockSearchQuery(meta, searchInput.subtitleText, searchInput);
  const terms = relevanceTermsFor(meta, query);

  // 整段 auto-stock 总时限：超过直接返回 error（用户可手动挑图）
  const deadline = Date.now() + STOCK_FETCH_TIMEOUT_MS;
  const isAlive = () => !abort?.cancelled && Date.now() < deadline;
  const remainingBudget = () => Math.max(250, deadline - Date.now());

  async function searchWithDeadline<T extends 'image' | 'video'>(
    mode: T,
    page: number
  ): Promise<{ result: NonNullable<Awaited<ReturnType<typeof searchStockImages>>['items']>[number] | null; ranOut: boolean }> {
    const opts = { q: query, page, pageSize: STOCK_PAGE_SIZE } as const;
    if (mode === 'video') {
      const res = await searchStockVideos(opts);
      if (!isAlive()) return { result: null, ranOut: true };
      const picked = pickBestStockHit(res.items, usedUrls, 'videoUrl', terms);
      return { result: picked?.hit ?? null, ranOut: false };
    }
    const res = await searchStockImages(opts);
    if (!isAlive()) return { result: null, ranOut: true };
    const picked = pickBestStockHit(res.items, usedUrls, 'imageUrl', terms);
    return { result: picked?.hit ?? null, ranOut: false };
  }

  try {
    if (isAutoStockVideoEnabled(meta)) {
      let fallback: { url: string; title?: string; attribution?: string } | null = null;
      for (let page = 1; page <= MAX_STOCK_PAGES; page++) {
        if (!isAlive()) {
          return { status: 'error', message: '素材搜索超时（未匹配）' };
        }
        const { result, ranOut } = await searchWithDeadline('video', page);
        if (ranOut) return { status: 'error', message: '素材搜索超时（未匹配）' };
        if (result?.videoUrl) {
          if (fallback === null) {
            fallback = { url: result.videoUrl, title: result.title, attribution: undefined };
          }
        }
        // 即使没匹配到也只继续到第二页，避免重试累积
        if (page === MAX_STOCK_PAGES && fallback) break;
      }
      if (fallback) {
        usedUrls.add(normalizeStockMediaUrl(fallback.url));
        return { status: 'ready', kind: 'video', url: fallback.url, title: fallback.title };
      }
    }

    if (isAutoStockImageEnabled(meta)) {
      let fallback: { url: string; title?: string; attribution?: string } | null = null;
      for (let page = 1; page <= MAX_STOCK_PAGES; page++) {
        if (!isAlive()) {
          return { status: 'error', message: '素材搜索超时（未匹配）' };
        }
        const { result, ranOut } = await searchWithDeadline('image', page);
        if (ranOut) return { status: 'error', message: '素材搜索超时（未匹配）' };
        if (result?.imageUrl) {
          fallback = { url: result.imageUrl, title: result.title, attribution: undefined };
        }
        if (page === MAX_STOCK_PAGES && fallback) break;
      }
      if (fallback) {
        usedUrls.add(normalizeStockMediaUrl(fallback.url));
        return { status: 'ready', kind: 'image', url: fallback.url, title: fallback.title };
      }
    }

    return { status: 'error', message: '未找到匹配素材' };
  } catch (e) {
    return {
      status: 'error',
      message: e instanceof Error ? e.message : '素材搜索失败',
    };
  }
}

/** 为所有需自动配图的 static-image 块预拉素材（审核预览用） */
export function useAutoStockPreviewMap(
  visualClips: VisualClipItem[],
  subtitles: TimelineSubtitle[],
  projectTopic?: string
): Record<string, AutoStockPreview> {
  const targets = useMemo(() => {
    return visualClips
      .filter((c) => {
        if (c.metadata?.mxmRenderMode !== 'static-image') return false;
        // 已写回素材 URL 的片段无需再检索（成片阶段也直接用回写的素材做回退）
        if (c.metadata.mxmSourceImageUrl?.trim()) return false;
        if (c.metadata.mxmSourceVideoUrl?.trim()) return false;
        // 注意：render-ready 片段仍参与检索，作为成片阶段拉流失败时的画面回退
        return isAutoStockVideoEnabled(c.metadata) || isAutoStockImageEnabled(c.metadata);
      })
      .sort((a, b) => a.startTime - b.startTime);
  }, [visualClips]);

  const targetsKey = useMemo(
    () =>
      targets
        .map((c) => {
          const input = stockSearchInputForClip(c, subtitles, projectTopic);
          return `${c.id}:${buildStockSearchQuery(c.metadata, input.subtitleText, input)}:${c.metadata?.mxmAutoStockVideo ? 'v' : ''}`;
        })
        .join('|'),
    [targets, subtitles, projectTopic]
  );

  const [map, setMap] = useState<Record<string, AutoStockPreview>>({});
  // 记忆已成功条目，避免每次 targetsKey 变化时把还在用的图 URL 当 loading 重新拉。
  const lastSuccessRef = useRef<Record<string, AutoStockPreview>>({});

  useEffect(() => {
    if (!targets.length) {
      setMap({});
      lastSuccessRef.current = {};
      return;
    }

    // 每个 target 推断"应该用什么初始状态"：上一次成功/失败/取消过 → 复用
    const initial: Record<string, AutoStockPreview> = {};
    for (const c of targets) {
      const prev = lastSuccessRef.current[c.id];
      initial[c.id] = prev ?? { status: 'loading' };
    }
    setMap(initial);

    // 仅给"还没成功出图"过的 target 跑拉取
    const pending = targets.filter((c) => {
      const prev = lastSuccessRef.current[c.id];
      return !prev || prev.status === 'error' || prev.status === 'idle';
    });
    if (pending.length === 0) return;

    const controller = { cancelled: false };
    void (async () => {
      const usedUrls = new Set<string>();
      const next: Record<string, AutoStockPreview> = { ...initial };

      await runWithConcurrency(pending, STOCK_FETCH_CONCURRENCY, async (c) => {
        if (controller.cancelled) return;
        const input = stockSearchInputForClip(c, subtitles, projectTopic);
        const preview = await fetchAutoStockForClip(c, input, usedUrls, controller);
        if (controller.cancelled) return;
        next[c.id] = preview;
        if (preview.status === 'ready') {
          lastSuccessRef.current[c.id] = preview;
        }
        setMap({ ...next });
      });
    })();

    return () => {
      controller.cancelled = true;
    };
  }, [targetsKey, targets, subtitles, projectTopic]);

  return map;
}

export function resolveStaticClipPreviewUrl(
  clip: VisualClipItem,
  autoStockMap: Record<string, AutoStockPreview>
): { kind: 'image' | 'video'; url: string } | null {
  const userVideo = clip.metadata?.mxmSourceVideoUrl?.trim();
  if (userVideo) return { kind: 'video', url: rewriteInternalStorageMediaUrl(userVideo) };

  const userUrl = clip.metadata?.mxmSourceImageUrl?.trim();
  if (userUrl) return { kind: 'image', url: rewriteInternalStorageMediaUrl(userUrl) };

  const auto = autoStockMap[clip.id];
  if (auto?.status === 'ready') {
    return { kind: auto.kind, url: auto.url };
  }
  return null;
}
