import { useEffect, useMemo, useState } from 'react';
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
  usedUrls: Set<string>
): Promise<AutoStockPreview> {
  const meta = clip.metadata;
  if (!meta) return { status: 'idle' };
  const query = buildStockSearchQuery(meta, searchInput.subtitleText, searchInput);
  const terms = relevanceTermsFor(meta, query);

  try {
    if (isAutoStockVideoEnabled(meta)) {
      let fallback: { url: string; title?: string; attribution?: string } | null = null;
      for (let page = 1; page <= MAX_STOCK_PAGES; page++) {
        const res = await searchStockVideos({ q: query, page, pageSize: STOCK_PAGE_SIZE });
        const picked = pickBestStockHit(res.items, usedUrls, 'videoUrl', terms);
        if (picked?.hit.videoUrl) {
          if (picked.scored) {
            usedUrls.add(normalizeStockMediaUrl(picked.hit.videoUrl));
            return {
              status: 'ready',
              kind: 'video',
              url: picked.hit.videoUrl,
              title: picked.hit.title,
              attribution: res.attribution,
            };
          }
          if (!fallback) {
            fallback = { url: picked.hit.videoUrl, title: picked.hit.title, attribution: res.attribution };
          }
        }
        if (res.items.length < STOCK_PAGE_SIZE) break;
      }
      if (fallback) {
        usedUrls.add(normalizeStockMediaUrl(fallback.url));
        return { status: 'ready', kind: 'video', url: fallback.url, title: fallback.title, attribution: fallback.attribution };
      }
    }

    if (isAutoStockImageEnabled(meta)) {
      let fallback: { url: string; title?: string; attribution?: string } | null = null;
      for (let page = 1; page <= MAX_STOCK_PAGES; page++) {
        const res = await searchStockImages({ q: query, page, pageSize: STOCK_PAGE_SIZE });
        const picked = pickBestStockHit(res.items, usedUrls, 'imageUrl', terms);
        if (picked?.hit.imageUrl) {
          if (picked.scored) {
            usedUrls.add(normalizeStockMediaUrl(picked.hit.imageUrl));
            return {
              status: 'ready',
              kind: 'image',
              url: picked.hit.imageUrl,
              title: picked.hit.title,
              attribution: res.attribution,
            };
          }
          if (!fallback) {
            fallback = { url: picked.hit.imageUrl, title: picked.hit.title, attribution: res.attribution };
          }
        }
        if (res.items.length < STOCK_PAGE_SIZE) break;
      }
      if (fallback) {
        usedUrls.add(normalizeStockMediaUrl(fallback.url));
        return { status: 'ready', kind: 'image', url: fallback.url, title: fallback.title, attribution: fallback.attribution };
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

  useEffect(() => {
    if (!targets.length) {
      setMap({});
      return;
    }

    let cancelled = false;
    const loading: Record<string, AutoStockPreview> = {};
    for (const c of targets) loading[c.id] = { status: 'loading' };
    setMap(loading);

    void (async () => {
      const usedUrls = new Set<string>();
      const next: Record<string, AutoStockPreview> = { ...loading };

      await runWithConcurrency(targets, STOCK_FETCH_CONCURRENCY, async (c) => {
        if (cancelled) return;
        const input = stockSearchInputForClip(c, subtitles, projectTopic);
        const preview = await fetchAutoStockForClip(c, input, usedUrls);
        if (!cancelled) {
          next[c.id] = preview;
          setMap({ ...next });
        }
      });
    })();

    return () => {
      cancelled = true;
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
