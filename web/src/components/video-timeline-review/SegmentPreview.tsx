import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TextOverlayLayer } from './TextOverlayLayer';
import type { TextClip, TimelineSubtitle } from './types';
import {
  buildStockSearchQuery,
  DEFAULT_IMAGE_FIT,
  isAutoStockImageEnabled,
  isAutoStockVideoEnabled,
  RENDER_MODE_LABEL_KEY,
  ratioToAspect,
  resolveClipImageMotion,
  resolveClipSubtitleSearchContext,
  isImageMotionEnabled,
} from './types';
import { findVisualClipAtTime, type VisualClipItem } from './timelineClipAtTime';
import { formatTimelineTime } from './useTimelinePlayback';
import { useStaticImagePreload } from './useStaticImagePreload';
import {
  resolveStaticClipPreviewUrl,
  useAutoStockPreviewMap,
} from './useAutoStockPreview';
import { buildGsapPreviewSrcDoc } from './gsapPreviewDoc';
import { kenBurnsTransform } from './kenBurnsTransform';
import { VideoPreviewLoading } from './VideoPreviewLoading';
import { StaticClipVideo } from './StaticClipVideo';
import { clipElapsedSeconds, slicePreviewClipWindow } from './previewClipWindow';
import { isClipRenderReady } from './clipRenderPreviewUtils';
import { needsAuthenticatedMediaFetch } from '../../api/client';
import { AuthImage } from '../AuthImage';
import { rewriteInternalStorageMediaUrl } from './voiceoverTimelineEnrich';

type SegmentPreviewProps = {
  clip: VisualClipItem | null;
  visualClips?: VisualClipItem[];
  textClips?: TextClip[];
  projectWidth?: number;
  projectHeight?: number;
  subtitles?: TimelineSubtitle[];
  currentTime?: number;
  timelinePhase?: 'plan' | 'rendered';
  projectTopic?: string;
  fitContainer?: boolean;
  /** 内容加载完成（供外层显示预览 / 字幕） */
  onContentReadyChange?: (ready: boolean) => void;
  /** 外层接管加载态时隐藏画面（仍在后台加载） */
  contentVisible?: boolean;
  /** 与时间轴播放状态同步（暂停时冻结成片画面） */
  isPlaying?: boolean;
  selectedOverlayId?: string | null;
  onSelectOverlay?: (id: string) => void;
  onMoveOverlay?: (id: string, position: { x: number; y: number }) => void;
  /** 一次审核：自动配图命中后写回脚本，供二次渲染同源 */
  onAutoStockBatchReady?: (
    commits: Array<{
      clipId: string;
      kind: 'image' | 'video';
      url: string;
      attribution?: string;
    }>
  ) => void;
};

export function SegmentPreview({
  clip,
  visualClips = [],
  textClips = [],
  projectWidth = 1920,
  projectHeight = 1080,
  subtitles = [],
  currentTime = 0,
  timelinePhase = 'plan',
  projectTopic,
  fitContainer = false,
  onContentReadyChange,
  contentVisible = true,
  isPlaying = false,
  selectedOverlayId = null,
  onSelectOverlay,
  onMoveOverlay,
  onAutoStockBatchReady,
}: SegmentPreviewProps) {
  const { t } = useTranslation();
  const isRenderedPhase = timelinePhase === 'rendered';
  const [gsapFrameReady, setGsapFrameReady] = useState(false);
  const [activeVideoReady, setActiveVideoReady] = useState(false);
  const [brokenRenderedClipIds, setBrokenRenderedClipIds] = useState<Set<string>>(
    () => new Set()
  );
  const gsapIframeRef = useRef<HTMLIFrameElement | null>(null);

  const clipAtPlayhead = useMemo(
    () => findVisualClipAtTime(visualClips, currentTime),
    [visualClips, currentTime]
  );

  const displayClip = clipAtPlayhead ?? clip;
  const autoStockMap = useAutoStockPreviewMap(
    visualClips,
    subtitles,
    projectTopic,
    // 仅方案审核阶段写回；成片阶段已有 rendered url，勿二次换图
    timelinePhase === 'plan' ? onAutoStockBatchReady : undefined
  );

  const staticClips = useMemo(
    () =>
      visualClips.filter((c) => {
        if (c.metadata?.mxmRenderMode !== 'static-image') return false;
        if (isRenderedPhase && isClipRenderReady(c.metadata) && !brokenRenderedClipIds.has(c.id)) {
          return false;
        }
        return true;
      }),
    [visualClips, isRenderedPhase, brokenRenderedClipIds]
  );

  const renderedClips = useMemo(
    () =>
      isRenderedPhase
        ? visualClips.filter(
            (c) => isClipRenderReady(c.metadata) && !brokenRenderedClipIds.has(c.id)
          )
        : [],
    [visualClips, isRenderedPhase, brokenRenderedClipIds]
  );

  const staticClipsWindow = useMemo(
    () => slicePreviewClipWindow(staticClips, displayClip?.id, 1),
    [staticClips, displayClip?.id]
  );

  const renderedClipsWindow = useMemo(
    () => slicePreviewClipWindow(renderedClips, displayClip?.id, 1),
    [renderedClips, displayClip?.id]
  );

  const handleActiveVideoCanPlay = useCallback(() => {
    setActiveVideoReady(true);
  }, []);

  const handleRenderedVideoError = useCallback((clipId: string) => {
    setBrokenRenderedClipIds((prev) => {
      if (prev.has(clipId)) return prev;
      const next = new Set(prev);
      next.add(clipId);
      return next;
    });
    setActiveVideoReady(false);
  }, []);

  const displayClipRenderReady =
    Boolean(displayClip?.metadata) && isClipRenderReady(displayClip?.metadata);

  const preloadImageUrls = useMemo(() => {
    const urls: string[] = [];
    for (const c of staticClipsWindow) {
      const src = resolveStaticClipPreviewUrl(c, autoStockMap);
      if (src?.kind === 'image') urls.push(src.url);
      if (c.metadata?.mxmSourceImageUrl) {
        urls.push(rewriteInternalStorageMediaUrl(c.metadata.mxmSourceImageUrl));
      }
    }
    return urls;
  }, [staticClipsWindow, autoStockMap]);

  const { isReady } = useStaticImagePreload(preloadImageUrls);

  const meta = displayClip?.metadata;
  const mode = meta?.mxmRenderMode;
  const aspect = ratioToAspect(meta?.mxmRatio);

  const activeStaticPreview =
    displayClip && mode === 'static-image'
      ? resolveStaticClipPreviewUrl(displayClip, autoStockMap)
      : null;

  const activeAutoState = displayClip ? autoStockMap[displayClip.id] : undefined;

  useEffect(() => {
    setActiveVideoReady(false);
  }, [displayClip?.id, activeStaticPreview?.url, displayClipRenderReady]);

  useEffect(() => {
    setBrokenRenderedClipIds(new Set());
  }, [visualClips]);

  // 成片已就绪时不要盖「正在匹配画面素材」—— auto-stock 仅作拉流失败回退，不应遮挡成片
  const showStaticLoading =
    !(isRenderedPhase && displayClipRenderReady) &&
    mode === 'static-image' &&
    (activeAutoState?.status === 'loading' ||
      (activeStaticPreview?.kind === 'image' && !isReady(activeStaticPreview.url)) ||
      (activeStaticPreview?.kind === 'video' && !activeVideoReady));

  const gsapSrcDoc =
    mode === 'gsap-html-animation' && meta?.mxmHtmlContent
      ? buildGsapPreviewSrcDoc(meta.mxmHtmlContent, meta.mxmGsapTimeline)
      : null;

  useEffect(() => {
    setGsapFrameReady(false);
  }, [displayClip?.id, gsapSrcDoc]);

  useEffect(() => {
    if (!gsapSrcDoc || gsapFrameReady) return;
    const timer = window.setTimeout(() => setGsapFrameReady(true), 8000);
    return () => window.clearTimeout(timer);
  }, [gsapSrcDoc, gsapFrameReady]);

  useEffect(() => {
    if (!onContentReadyChange) return;

    if (!displayClip) {
      onContentReadyChange(true);
      return;
    }

    if (isRenderedPhase && displayClipRenderReady) {
      // 成片走 stream 直链，URL 立即可用；缓冲由 <video> 自行处理
      onContentReadyChange(true);
      return;
    }

    if (mode === 'static-image') {
      if (activeAutoState?.status === 'loading') {
        onContentReadyChange(false);
        return;
      }
      if (activeStaticPreview?.kind === 'image') {
        onContentReadyChange(isReady(activeStaticPreview.url));
        return;
      }
      if (activeStaticPreview?.kind === 'video') {
        onContentReadyChange(activeVideoReady);
        return;
      }
      onContentReadyChange(true);
      return;
    }

    if (mode === 'gsap-html-animation' && meta?.mxmHtmlContent) {
      onContentReadyChange(gsapFrameReady);
      return;
    }

    onContentReadyChange(true);
  }, [
    onContentReadyChange,
    displayClip,
    mode,
    meta?.mxmHtmlContent,
    meta?.mxmRenderedVideoUrl,
    displayClipRenderReady,
    activeAutoState?.status,
    activeStaticPreview,
    isReady,
    gsapFrameReady,
    isRenderedPhase,
    activeVideoReady,
  ]);

  const aiImagePreview = useMemo(() => {
    if (!displayClip || mode !== 'ai-video-gen' || displayClipRenderReady) return null;
    const outputKind = meta?.mxmAiOutputKind ?? 'video';
    const generated = meta?.mxmAiGeneratedImageUrl?.trim();
    const source = meta?.mxmSourceImageUrl?.trim();
    const ref =
      meta?.mxmReferenceImages?.find((u) => typeof u === 'string' && u.trim())?.trim() ?? '';
    const rawUrl =
      outputKind === 'image'
        ? generated || source || ref
        : meta?.mxmRenderStatus === 'failed'
          ? source || ref
          : '';
    if (!rawUrl) return null;
    return { url: rewriteInternalStorageMediaUrl(rawUrl) };
  }, [
    displayClip,
    mode,
    displayClipRenderReady,
    meta?.mxmAiOutputKind,
    meta?.mxmAiGeneratedImageUrl,
    meta?.mxmSourceImageUrl,
    meta?.mxmReferenceImages,
    meta?.mxmRenderStatus,
  ]);

  const aiImageMotionTransform = useMemo(() => {
    if (!aiImagePreview || !displayClip || !isImageMotionEnabled(meta)) return null;
    const clipDuration = Math.max(0.1, displayClip.duration);
    const elapsed = clipElapsedSeconds(displayClip, currentTime, true);
    return kenBurnsTransform(resolveClipImageMotion(meta), elapsed / clipDuration);
  }, [aiImagePreview, displayClip, meta, currentTime]);

  // 成片阶段兜底画面：render-ready 片段的成片 mp4 拉流失败/加载中时，
  // 底层始终展示"已匹配好的画面"（回写素材 / 自动配图 / AI 配图 / 参考图），永不黑屏。
  const renderedFallbackImageUrl = useMemo(() => {
    if (!isRenderedPhase || !displayClip || !displayClipRenderReady) return null;
    if (mode === 'static-image') {
      const preview = resolveStaticClipPreviewUrl(displayClip, autoStockMap);
      if (preview?.kind === 'image') return rewriteInternalStorageMediaUrl(preview.url);
    }
    const still =
      meta?.mxmAiGeneratedImageUrl?.trim() ||
      meta?.mxmSourceImageUrl?.trim() ||
      meta?.mxmReferenceImages?.find((u) => typeof u === 'string' && u.trim())?.trim();
    return still ? rewriteInternalStorageMediaUrl(still) : null;
  }, [isRenderedPhase, displayClip, displayClipRenderReady, mode, autoStockMap, meta]);

  const renderNonStaticContent = () => {
    if (!displayClip) {
      return (
        <div className="video-timeline-review__stage-center">
          <p className="video-timeline-review__preview-empty">
            {subtitles.length > 0 || visualClips.length > 0
              ? t('video.preview.clickPlayVoice')
              : t('video.preview.selectClipToPreview')}
          </p>
        </div>
      );
    }

    if (mode === 'static-image') {
      if (activeStaticPreview) return null;
      if (isRenderedPhase && displayClipRenderReady) {
        if (!activeVideoReady) {
          return (
            <div className="video-timeline-review__stage-center">
              <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>
                {t('video.preview.loadingFinal')}
              </p>
            </div>
          );
        }
        return null;
      }
      if (activeAutoState?.status === 'loading') {
        return (
          <div className="video-timeline-review__stage-center">
            <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>{t('video.preview.matchingAssets')}</p>
          </div>
        );
      }
      const autoOn =
        isAutoStockVideoEnabled(meta) || isAutoStockImageEnabled(meta);
      const stockHint =
        meta?.mxmStockSearchQuery?.trim() ||
        buildStockSearchQuery(
          meta,
          undefined,
          resolveClipSubtitleSearchContext(subtitles, displayClip.startTime, displayClip.duration)
        );
      return (
        <div className="video-timeline-review__stage-center">
          {stockHint ? (
            <p style={{ margin: '0 0 8px', fontSize: 13, lineHeight: 1.5, opacity: 0.85 }}>
              {t('video.preview.searchQuery', { query: stockHint })}
            </p>
          ) : null}
          <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>
            {autoOn
              ? activeAutoState?.status === 'error'
                ? activeAutoState.message
                : t('video.preview.pickOrAutoStock')
              : t('video.preview.pickOrEnableAutoImage')}
          </p>
        </div>
      );
    }

    if (gsapSrcDoc) {
      if (isRenderedPhase && displayClipRenderReady) {
        if (!activeVideoReady) {
          return (
            <div className="video-timeline-review__stage-center">
              <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>{t('video.preview.loadingFinal')}</p>
            </div>
          );
        }
        return null;
      }
      return (
        <iframe
          key={`${displayClip.id}-${gsapSrcDoc.length}`}
          ref={gsapIframeRef}
          title={t('video.preview.gsapPreview')}
          srcDoc={gsapSrcDoc}
          className="video-timeline-review__stage-iframe"
          sandbox="allow-scripts"
          onLoad={() => setGsapFrameReady(true)}
        />
      );
    }

    return (
      <div className="video-timeline-review__stage-center">
        <div style={{ maxWidth: '80%', textAlign: 'center' }}>
          {isRenderedPhase && displayClipRenderReady && !activeVideoReady && (
            <p style={{ margin: '0 0 12px', fontSize: 13, opacity: 0.8 }}>{t('video.preview.loadingFinal')}</p>
          )}
          {isRenderedPhase && meta?.mxmRenderStatus === 'failed' && (
            <p style={{ margin: '0 0 12px', fontSize: 13, color: '#f87171' }}>
              {t('video.preview.renderFailed', {
                error: meta.mxmRenderError ?? t('video.preview.unknownError'),
              })}
              {aiImagePreview ? t('video.preview.renderFailedFallback') : ''}
            </p>
          )}
          <p style={{ margin: 0, fontSize: 12, opacity: 0.7 }}>
            {mode ? t(RENDER_MODE_LABEL_KEY[mode]) : t('video.preview.modeUnset')} · {displayClip.duration}s ·{' '}
            {formatTimelineTime(currentTime)}
          </p>
          {mode === 'ai-video-gen' && (
            <p style={{ marginTop: 12, fontSize: 14, lineHeight: 1.5 }}>
              {(meta?.mxmAiOutputKind === 'image'
                ? meta?.mxmImagePrompt ?? meta?.mxmPrompt
                : meta?.mxmVideoPrompt ?? meta?.mxmPrompt) ?? t('video.preview.noVideoPrompt')}
            </p>
          )}
          {mode === 'gsap-html-animation' && !meta?.mxmHtmlContent && (
            <p style={{ marginTop: 12, fontSize: 13, opacity: 0.8 }}>
              {t('video.preview.gsapNotGenerated')}
            </p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      className={`video-timeline-review__stage${fitContainer ? ' video-timeline-review__stage--fit' : ''}${contentVisible ? '' : ' video-timeline-review__stage--hidden'}`}
      style={
        fitContainer
          ? ({ ['--vt-stage-aspect' as string]: String(aspect) } as React.CSSProperties)
          : { aspectRatio: String(aspect) }
      }
    >
      {renderedFallbackImageUrl && displayClip && (
        needsAuthenticatedMediaFetch(renderedFallbackImageUrl) ? (
          <AuthImage
            key={`rendered-fallback-${displayClip.id}`}
            src={renderedFallbackImageUrl}
            alt=""
            className="video-timeline-review__stage-image video-timeline-review__stage-image--active"
            style={{ objectFit: meta?.mxmImageFit ?? DEFAULT_IMAGE_FIT }}
          />
        ) : (
          <img
            key={`rendered-fallback-${displayClip.id}`}
            src={renderedFallbackImageUrl}
            alt=""
            aria-hidden
            className="video-timeline-review__stage-image video-timeline-review__stage-image--active"
            style={{ objectFit: meta?.mxmImageFit ?? DEFAULT_IMAGE_FIT }}
            decoding="async"
            loading="eager"
          />
        )
      )}

      {renderedClipsWindow.map((c) => {
        const rawUrl = c.metadata!.mxmRenderedVideoUrl!;
        const url = rewriteInternalStorageMediaUrl(rawUrl);
        const fit = c.metadata!.mxmImageFit ?? DEFAULT_IMAGE_FIT;
        const active = displayClip?.id === c.id;
        const elapsed = clipElapsedSeconds(c, currentTime, active);
        return (
          <StaticClipVideo
            key={`rendered-${c.id}`}
            clipId={c.id}
            url={url}
            fit={fit}
            active={active}
            clipElapsed={elapsed}
            isPlaying={isPlaying}
            preload={active ? 'auto' : 'metadata'}
            onCanPlay={active ? handleActiveVideoCanPlay : undefined}
            onError={active ? () => handleRenderedVideoError(c.id) : undefined}
          />
        );
      })}

      {aiImagePreview && displayClip && (
        needsAuthenticatedMediaFetch(aiImagePreview.url) ? (
          <AuthImage
            key={`ai-image-${displayClip.id}`}
            src={aiImagePreview.url}
            alt=""
            className="video-timeline-review__stage-image video-timeline-review__stage-image--active"
            style={{
              objectFit: meta?.mxmImageFit ?? DEFAULT_IMAGE_FIT,
              ...(aiImageMotionTransform
                ? { transform: aiImageMotionTransform, transformOrigin: 'center center' }
                : {}),
            }}
          />
        ) : (
          <img
            key={`ai-image-${displayClip.id}`}
            src={aiImagePreview.url}
            alt=""
            className="video-timeline-review__stage-image video-timeline-review__stage-image--active"
            style={{
              objectFit: meta?.mxmImageFit ?? DEFAULT_IMAGE_FIT,
              ...(aiImageMotionTransform
                ? { transform: aiImageMotionTransform, transformOrigin: 'center center' }
                : {}),
            }}
            decoding="async"
            loading="eager"
          />
        )
      )}

      {staticClipsWindow.map((c) => {
        const src = resolveStaticClipPreviewUrl(c, autoStockMap);
        if (!src) return null;
        const fit = c.metadata!.mxmImageFit ?? DEFAULT_IMAGE_FIT;
        const motion = resolveClipImageMotion(c.metadata);
        const active = displayClip?.id === c.id;
        const clipDuration = Math.max(0.1, c.duration);
        const elapsed = clipElapsedSeconds(c, currentTime, active);
        const motionProgress = motion !== 'none' && active ? elapsed / clipDuration : 0;
        const motionTransform = kenBurnsTransform(motion, motionProgress);
        const cls = [
          'video-timeline-review__stage-image',
          active ? 'video-timeline-review__stage-image--active' : '',
          motionTransform ? 'video-timeline-review__stage-image--motion' : '',
        ]
          .filter(Boolean)
          .join(' ');

        if (src.kind === 'video') {
          return (
            <StaticClipVideo
              key={c.id}
              clipId={c.id}
              url={src.url}
              fit={fit}
              active={active}
              clipElapsed={elapsed}
              isPlaying={isPlaying}
              preload={active ? 'auto' : 'metadata'}
              onCanPlay={active ? handleActiveVideoCanPlay : undefined}
              onError={active ? () => setActiveVideoReady(false) : undefined}
            />
          );
        }

        const imageUrl = rewriteInternalStorageMediaUrl(src.url);
        const imageStyle: React.CSSProperties = {
          objectFit: fit,
          ...(motionTransform
            ? {
                transform: motionTransform,
                transformOrigin: 'center center',
              }
            : {}),
        };

        if (needsAuthenticatedMediaFetch(imageUrl)) {
          return (
            <AuthImage
              key={c.id}
              src={imageUrl}
              alt=""
              className={cls}
              style={imageStyle}
            />
          );
        }

        return (
          <img
            key={c.id}
            src={imageUrl}
            alt=""
            aria-hidden={!active}
            className={cls}
            style={imageStyle}
            decoding="async"
            loading="eager"
          />
        );
      })}

      {showStaticLoading && (
        <div className="video-timeline-review__stage-loading" aria-live="polite">
          <VideoPreviewLoading message={t('video.preview.matchingAssetsShort')} phase="content" compact />
        </div>
      )}

      {renderNonStaticContent()}

      {textClips.length > 0 && timelinePhase === 'rendered' && (
        <TextOverlayLayer
          textClips={textClips}
          currentTime={currentTime}
          width={projectWidth}
          height={projectHeight}
          selectedOverlayId={selectedOverlayId}
          onSelectOverlay={onSelectOverlay}
          onMoveOverlay={onMoveOverlay}
        />
      )}
    </div>
  );
}
