import { useCallback, useRef, useState, type PointerEvent, type ReactNode, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Minus,
  Pause,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  Scissors,
  Trash2,
  Undo2,
  Merge,
} from 'lucide-react';
import { Slider, Tooltip } from 'antd';
import { PageHint } from '../PageHint';
import type { AudioClipItem, VisualClipItem } from './useVideoEditScript';
import type { AudioRole } from './audioTrackUtils';
import type { TextClip, TimelineSelection, TimelineSubtitle } from './types';
import { AUDIO_PREVIEW_CLIP_ID, BGM_PREVIEW_CLIP_ID, RENDER_MODE_COLOR, RENDER_MODE_LABEL_KEY } from './types';
import { formatTimelineTime } from './useTimelinePlayback';
import {
  buildRulerTicks,
  TIMELINE_LABEL_WIDTH_PX,
  useTimelineZoom,
} from './useTimelineZoom';

type TimelinePanelProps = {
  visualClips: VisualClipItem[];
  voiceClips: AudioClipItem[];
  bgmClips: AudioClipItem[];
  subtitles: TimelineSubtitle[];
  totalDuration: number;
  selection: TimelineSelection | null;
  voiceSourceUrl?: string;
  voicePlaybackUrl?: string;
  bgmPlaybackUrl?: string;
  voiceLoading?: boolean;
  previewReady?: boolean;
  currentTime: number;
  isPlaying: boolean;
  onSelect: (selection: TimelineSelection) => void;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onResizeClipBoundary?: (clipId: string, edge: 'start' | 'end', newSec: number) => void;
  textClips?: TextClip[];
  canSplit?: boolean;
  canDelete?: boolean;
  canMerge?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  onSplitAtPlayhead?: () => void;
  onDeleteSelectedClip?: () => void;
  onMergeWithNext?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  timelinePhase?: 'plan' | 'rendered';
  voiceRef: RefObject<HTMLAudioElement | null>;
  bgmRef: RefObject<HTMLAudioElement | null>;
};

function secToPx(sec: number, pxPerSecond: number): number {
  return sec * pxPerSecond;
}

function pxToSec(px: number, pxPerSecond: number): number {
  return px / pxPerSecond;
}

function TrackLane({
  children,
  className = '',
  widthPx,
}: {
  children: ReactNode;
  className?: string;
  widthPx: number;
}) {
  return (
    <div
      className={`video-timeline-review__track-lane${className ? ` ${className}` : ''}`}
      style={{ width: widthPx, minWidth: widthPx }}
    >
      {children}
    </div>
  );
}

type ResizeDrag = {
  clipId: string;
  edge: 'start' | 'end';
};

export function TimelinePanel({
  visualClips,
  voiceClips,
  bgmClips,
  subtitles,
  totalDuration,
  selection,
  voiceSourceUrl,
  voicePlaybackUrl,
  bgmPlaybackUrl,
  voiceLoading = false,
  previewReady = true,
  currentTime,
  isPlaying,
  onSelect,
  onTogglePlay,
  onSeek,
  onResizeClipBoundary,
  textClips = [],
  canSplit = false,
  canDelete = false,
  canMerge = false,
  canUndo = false,
  canRedo = false,
  onSplitAtPlayhead,
  onDeleteSelectedClip,
  onMergeWithNext,
  onUndo,
  onRedo,
  timelinePhase = 'plan',
  voiceRef,
  bgmRef,
}: TimelinePanelProps) {
  const { t } = useTranslation();
  const dur = Math.max(totalDuration, 0.01);
  const zoom = useTimelineZoom(dur);
  const { pxPerSecond, contentWidth, scrollRef, zoomIn, zoomOut, setZoom, fitToWidth, onWheel } =
    zoom;
  const ticks = buildRulerTicks(dur, pxPerSecond);
  const tracksWrapRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const resizeDragRef = useRef<ResizeDrag | null>(null);
  const [resizingClipId, setResizingClipId] = useState<string | null>(null);

  const showVoiceTrack = voiceClips.length > 0 || Boolean(voiceSourceUrl);
  const showBgmTrack = true;
  const showSubtitleTrack = subtitles.length > 0;
  const showVisualTrack = visualClips.length > 0;
  const showOverlayTrack = timelinePhase === 'rendered' && textClips.length > 0;
  const isRefinePhase = timelinePhase === 'rendered';
  const canPlayback = previewReady && (showVoiceTrack || showBgmTrack || showSubtitleTrack || dur > 0);
  const pendingVoice = voiceLoading || (Boolean(voiceSourceUrl) && !voicePlaybackUrl);
  const playheadPx = secToPx(currentTime, pxPerSecond);

  const isSelected = (kind: TimelineSelection['kind'], id: string, audioRole?: AudioRole) =>
    selection?.kind === kind &&
    selection.id === id &&
    (kind !== 'audio' || (selection.audioRole ?? 'voice') === (audioRole ?? 'voice'));

  /** clientX → 时间轴秒数（以轨道内容起点为 0，getBoundingClientRect 已反映滚动位置） */
  const secFromClientX = useCallback(
    (clientX: number) => {
      const wrap = tracksWrapRef.current;
      if (!wrap) return 0;
      const rect = wrap.getBoundingClientRect();
      const x = clientX - rect.left - TIMELINE_LABEL_WIDTH_PX;
      return clampTime(pxToSec(x, pxPerSecond), dur);
    },
    [dur, pxPerSecond]
  );

  const onWrapPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;

    // 1) 拖拽片段边缘手柄 → 调整边界
    const handle = target.closest<HTMLElement>('[data-resize-edge]');
    if (handle && onResizeClipBoundary) {
      const clipId = handle.getAttribute('data-clip-id');
      const edge = handle.getAttribute('data-resize-edge') as 'start' | 'end' | null;
      if (clipId && edge) {
        e.preventDefault();
        resizeDragRef.current = { clipId, edge };
        setResizingClipId(clipId);
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }
    }

    // 2) 点击到具体块（视觉/音频/字幕）→ 交由块自身 onClick 选中，不移动播放头
    if (target.closest('[data-block]')) return;

    // 3) 点击/拖拽空白轨道区 → seek/scrub（忽略左侧标签栏）
    if (!canPlayback) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (e.clientX - rect.left < TIMELINE_LABEL_WIDTH_PX) return;
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    onSeek(secFromClientX(e.clientX));
  };

  const onWrapPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (resizeDragRef.current && onResizeClipBoundary) {
      const drag = resizeDragRef.current;
      onResizeClipBoundary(drag.clipId, drag.edge, secFromClientX(e.clientX));
      return;
    }
    if (draggingRef.current) onSeek(secFromClientX(e.clientX));
  };

  const onWrapPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    draggingRef.current = false;
    resizeDragRef.current = null;
    setResizingClipId(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const sortedVisual = [...visualClips].sort((a, b) => a.startTime - b.startTime);

  return (
    <div className={`video-timeline-review__timeline${isRefinePhase ? ' video-timeline-review__timeline--refine' : ' video-timeline-review__timeline--plan'}`}>
      {voicePlaybackUrl && (
        <audio
          ref={voiceRef}
          preload="auto"
          src={voicePlaybackUrl}
          className="video-timeline-review__audio-hidden"
        />
      )}
      {bgmPlaybackUrl && (
        <audio ref={bgmRef} preload="auto" src={bgmPlaybackUrl} className="video-timeline-review__audio-hidden" />
      )}

      <div className="video-timeline-review__transport">
        <button
          type="button"
          className="video-timeline-review__transport-btn"
          onClick={onTogglePlay}
          disabled={!canPlayback}
          aria-label={isPlaying ? t('video.timeline.pause') : t('video.timeline.play')}
        >
          {isPlaying ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <span className="video-timeline-review__transport-time">
          {formatTimelineTime(currentTime)} / {formatTimelineTime(dur)}
        </span>

        <div className="video-timeline-review__edit-toolbar" role="toolbar" aria-label={isRefinePhase ? t('video.timeline.refineTools') : t('video.timeline.editTools')}>
          {isRefinePhase ? (
            <span className="video-timeline-review__phase-badge video-timeline-review__phase-badge--refine">
              {t('video.timeline.refineEdit')}
            </span>
          ) : (
            <>
              <span className="video-timeline-review__phase-badge video-timeline-review__phase-badge--plan">
                {t('video.timeline.storyboardEdit')}
              </span>
              <span className="video-timeline-review__edit-divider" aria-hidden />
              <Tooltip title={t('video.timeline.splitTooltip')}>
                <button
                  type="button"
                  className="video-timeline-review__edit-btn"
                  disabled={!canSplit}
                  onClick={onSplitAtPlayhead}
                  aria-label={t('video.timeline.split')}
                >
                  <Scissors size={15} />
                </button>
              </Tooltip>
              <Tooltip title={t('video.timeline.deleteTooltip')}>
                <button
                  type="button"
                  className="video-timeline-review__edit-btn video-timeline-review__edit-btn--danger"
                  disabled={!canDelete}
                  onClick={onDeleteSelectedClip}
                  aria-label={t('video.timeline.delete')}
                >
                  <Trash2 size={15} />
                </button>
              </Tooltip>
              <Tooltip title={t('video.timeline.mergeTooltip')}>
                <button
                  type="button"
                  className="video-timeline-review__edit-btn"
                  disabled={!canMerge}
                  onClick={onMergeWithNext}
                  aria-label={t('video.timeline.merge')}
                >
                  <Merge size={15} />
                </button>
              </Tooltip>
            </>
          )}
          <span className="video-timeline-review__edit-divider" aria-hidden />
          <Tooltip title={t('video.timeline.undoTooltip')}>
            <button
              type="button"
              className="video-timeline-review__edit-btn"
              disabled={!canUndo}
              onClick={onUndo}
              aria-label={t('video.timeline.undo')}
            >
              <Undo2 size={15} />
            </button>
          </Tooltip>
          <Tooltip title={t('video.timeline.redoTooltip')}>
            <button
              type="button"
              className="video-timeline-review__edit-btn"
              disabled={!canRedo}
              onClick={onRedo}
              aria-label={t('video.timeline.redo')}
            >
              <Redo2 size={15} />
            </button>
          </Tooltip>
        </div>

        {pendingVoice && (
          <PageHint
            title={t('video.timeline.voiceLoadingTitle')}
            description={t('video.timeline.voiceLoadingDesc')}
            placement="top"
          />
        )}
        <div className="video-timeline-review__zoom-controls">
          <button
            type="button"
            className="video-timeline-review__zoom-btn"
            onClick={zoomOut}
            aria-label={t('video.timeline.zoomOut')}
          >
            <Minus size={14} />
          </button>
          <Slider
            className="video-timeline-review__zoom-slider"
            min={zoom.minPxPerSecond}
            max={zoom.maxPxPerSecond}
            step={1}
            value={pxPerSecond}
            onChange={setZoom}
            tooltip={{ formatter: (v) => `${v}px/s` }}
          />
          <button
            type="button"
            className="video-timeline-review__zoom-btn"
            onClick={zoomIn}
            aria-label={t('video.timeline.zoomIn')}
          >
            <Plus size={14} />
          </button>
          <button
            type="button"
            className="video-timeline-review__zoom-btn"
            onClick={fitToWidth}
            aria-label={t('video.timeline.fitWidth')}
            title={t('video.timeline.fitWidth')}
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="video-timeline-review__scroll"
        onWheel={onWheel}
      >
        <div
          className="video-timeline-review__scroll-inner"
          style={{ width: contentWidth + TIMELINE_LABEL_WIDTH_PX }}
        >
          <div className="video-timeline-review__ruler" style={{ width: contentWidth, marginLeft: TIMELINE_LABEL_WIDTH_PX }}>
            {ticks.map((t) => (
              <span
                key={t}
                className="video-timeline-review__ruler-tick"
                style={{ left: secToPx(t, pxPerSecond) }}
              >
                {t >= 60 ? `${Math.floor(t / 60)}:${(t % 60).toFixed(0).padStart(2, '0')}` : `${t}s`}
              </span>
            ))}
          </div>

          <div
            ref={tracksWrapRef}
            className="video-timeline-review__tracks-wrap"
            onPointerDown={onWrapPointerDown}
            onPointerMove={onWrapPointerMove}
            onPointerUp={onWrapPointerUp}
            onPointerCancel={onWrapPointerUp}
            role="slider"
            aria-valuemin={0}
            aria-valuemax={dur}
            aria-valuenow={currentTime}
            aria-label={t('video.timeline.timelineAria')}
            tabIndex={0}
            onKeyDown={(e) => {
              const mod = e.metaKey || e.ctrlKey;
              if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
                e.preventDefault();
                onUndo?.();
                return;
              }
              if (mod && (e.key.toLowerCase() === 'z' && e.shiftKey || e.key.toLowerCase() === 'y')) {
                e.preventDefault();
                onRedo?.();
                return;
              }
              if (e.key.toLowerCase() === 's' && !mod) {
                e.preventDefault();
                onSplitAtPlayhead?.();
                return;
              }
              if ((e.key === 'Delete' || e.key === 'Backspace') && !mod) {
                e.preventDefault();
                onDeleteSelectedClip?.();
                return;
              }
              if (e.key.toLowerCase() === 'm' && !mod) {
                e.preventDefault();
                onMergeWithNext?.();
                return;
              }
              if (e.key === 'ArrowLeft') onSeek(currentTime - (e.shiftKey ? 1 : 0.1));
              if (e.key === 'ArrowRight') onSeek(currentTime + (e.shiftKey ? 1 : 0.1));
              if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                onTogglePlay();
              }
            }}
          >
            <div
              className="video-timeline-review__playhead"
              style={{ left: TIMELINE_LABEL_WIDTH_PX + playheadPx }}
              aria-hidden
            />

            <div className="video-timeline-review__tracks">
              {showVisualTrack && (
                <div className="video-timeline-review__track-row">
                  <div className="video-timeline-review__track-label">{t('video.timeline.clip')}</div>
                  <TrackLane widthPx={contentWidth}>
                    {sortedVisual.map((clip, index) => {
                      const mode = clip.metadata?.mxmRenderMode;
                      const left = secToPx(clip.startTime, pxPerSecond);
                      const width = Math.max(secToPx(clip.duration, pxPerSecond), 24);
                      const color = mode ? RENDER_MODE_COLOR[mode] : '#94a3b8';
                      const active =
                        currentTime >= clip.startTime && currentTime < clip.startTime + clip.duration;
                      const canResizeStart = index > 0 && Boolean(onResizeClipBoundary);
                      const canResizeEnd =
                        index < sortedVisual.length - 1 && Boolean(onResizeClipBoundary);
                      return (
                        <div
                          key={clip.id}
                          className={`video-timeline-review__clip-wrap${isSelected('visual', clip.id) ? ' video-timeline-review__clip-wrap--selected' : ''}${active ? ' video-timeline-review__clip-wrap--active' : ''}${resizingClipId === clip.id ? ' video-timeline-review__clip-wrap--resizing' : ''}`}
                          style={{ left, width }}
                        >
                          {canResizeStart && (
                            <span
                              className="video-timeline-review__resize-handle video-timeline-review__resize-handle--start"
                              data-resize-edge="start"
                              data-clip-id={clip.id}
                              role="separator"
                              aria-label={t('video.timeline.resizeStart')}
                            />
                          )}
                          <button
                            type="button"
                            data-block="visual"
                            className="video-timeline-review__clip"
                            style={{ background: color }}
                            onClick={() => {
                              onSelect({ kind: 'visual', id: clip.id });
                              onSeek(clip.startTime);
                            }}
                            title={mode ? t(RENDER_MODE_LABEL_KEY[mode]) : clip.id}
                          >
                            <span className="video-timeline-review__clip-label">
                              {mode ? t(RENDER_MODE_LABEL_KEY[mode]) : clip.id.slice(0, 8)}
                            </span>
                            <span className="video-timeline-review__clip-duration">
                              {clip.duration.toFixed(1)}s
                            </span>
                          </button>
                          {canResizeEnd && (
                            <span
                              className="video-timeline-review__resize-handle video-timeline-review__resize-handle--end"
                              data-resize-edge="end"
                              data-clip-id={clip.id}
                              role="separator"
                              aria-label={t('video.timeline.resizeEnd')}
                            />
                          )}
                        </div>
                      );
                    })}
                  </TrackLane>
                </div>
              )}

              {showOverlayTrack && (
                <div className="video-timeline-review__track-row">
                  <div className="video-timeline-review__track-label">{t('video.timeline.overlay')}</div>
                  <TrackLane className="video-timeline-review__track-lane--overlay" widthPx={contentWidth}>
                    {textClips.map((tc) => {
                      const left = secToPx(tc.startTime, pxPerSecond);
                      const width = Math.max(secToPx(tc.duration, pxPerSecond), 16);
                      const playheadActive =
                        currentTime >= tc.startTime && currentTime < tc.startTime + tc.duration;
                      const selected = isSelected('overlay', tc.id);
                      return (
                        <button
                          key={tc.id}
                          type="button"
                          className={`video-timeline-review__overlay-clip${playheadActive ? ' video-timeline-review__overlay-clip--active' : ''}${selected ? ' video-timeline-review__overlay-clip--selected' : ''}`}
                          style={{ left, width }}
                          title={tc.text}
                          onClick={() => onSelect({ kind: 'overlay', id: tc.id })}
                        >
                          {tc.text.slice(0, 12)}
                        </button>
                      );
                    })}
                  </TrackLane>
                </div>
              )}

              {showVoiceTrack && (
                <div className="video-timeline-review__track-row">
                  <div className="video-timeline-review__track-label">{t('video.timeline.voice')}</div>
                  <TrackLane className="video-timeline-review__track-lane--audio" widthPx={contentWidth}>
                    {voiceClips.length === 0 && voiceSourceUrl ? (
                      <button
                        type="button"
                        data-block="audio"
                        className={`video-timeline-review__audio-clip video-timeline-review__audio-clip--voice video-timeline-review__audio-clip--filled video-timeline-review__audio-clip--full${isSelected('audio', AUDIO_PREVIEW_CLIP_ID, 'voice') ? ' video-timeline-review__audio-clip--active' : ''}`}
                        style={{ width: contentWidth }}
                        title={t('video.timeline.voice')}
                        onClick={() => onSelect({ kind: 'audio', id: AUDIO_PREVIEW_CLIP_ID, audioRole: 'voice' })}
                      >
                        {t('video.timeline.voice')}
                      </button>
                    ) : (
                      voiceClips.map((clip) => {
                        const left = secToPx(clip.startTime, pxPerSecond);
                        const width = Math.max(secToPx(clip.duration, pxPerSecond), 24);
                        const hasMedia = Boolean(clip.mediaUrl ?? voiceSourceUrl);
                        return (
                          <button
                            key={clip.id}
                            type="button"
                            data-block="audio"
                            className={`video-timeline-review__audio-clip video-timeline-review__audio-clip--voice${hasMedia ? ' video-timeline-review__audio-clip--filled' : ' video-timeline-review__audio-clip--empty'}${isSelected('audio', clip.id, 'voice') ? ' video-timeline-review__audio-clip--active' : ''}`}
                            style={{ left, width: hasMedia ? width : undefined }}
                            title={t('video.timeline.voice')}
                            onClick={() => onSelect({ kind: 'audio', id: clip.id, audioRole: 'voice' })}
                          >
                            {hasMedia ? t('video.timeline.voice') : t('video.timeline.voiceNotConfigured')}
                          </button>
                        );
                      })
                    )}
                  </TrackLane>
                </div>
              )}

              {showBgmTrack && (() => {
                const bgmClip = bgmClips[0];
                const bgmHasMedia = bgmClips.some((c) => Boolean(c.mediaUrl));
                const bgmClipId = bgmClip?.id ?? BGM_PREVIEW_CLIP_ID;
                return (
                  <div className="video-timeline-review__track-row">
                    <div className="video-timeline-review__track-label">{t('video.timeline.bgm')}</div>
                    <TrackLane
                      className={`video-timeline-review__track-lane--bgm${bgmHasMedia ? '' : ' video-timeline-review__track-lane--empty'}`}
                      widthPx={contentWidth}
                    >
                      {bgmHasMedia && bgmClip ? (
                        <button
                          type="button"
                          data-block="audio"
                          className={`video-timeline-review__audio-clip video-timeline-review__audio-clip--bgm video-timeline-review__audio-clip--filled video-timeline-review__audio-clip--full${isSelected('audio', bgmClipId, 'bgm') ? ' video-timeline-review__audio-clip--active' : ''}`}
                          style={{ width: contentWidth }}
                          title={t('video.timeline.bgm')}
                          onClick={() => onSelect({ kind: 'audio', id: bgmClipId, audioRole: 'bgm' })}
                        >
                          {t('video.timeline.bgm')}
                        </button>
                      ) : (
                        <button
                          type="button"
                          data-block="audio"
                          className={`video-timeline-review__audio-clip video-timeline-review__audio-clip--bgm video-timeline-review__audio-clip--empty video-timeline-review__audio-clip--placeholder${isSelected('audio', bgmClipId, 'bgm') ? ' video-timeline-review__audio-clip--active' : ''}`}
                          title={t('video.timeline.addBgmHint')}
                          onClick={() => onSelect({ kind: 'audio', id: bgmClipId, audioRole: 'bgm' })}
                        >
                          {t('video.timeline.addBgm')}
                        </button>
                      )}
                    </TrackLane>
                  </div>
                );
              })()}

              {showSubtitleTrack && (
                <div className="video-timeline-review__track-row">
                  <div className="video-timeline-review__track-label">{t('video.timeline.subtitle')}</div>
                  <TrackLane className="video-timeline-review__track-lane--subtitle" widthPx={contentWidth}>
                    {subtitles.map((sub) => {
                      const left = secToPx(sub.startTime, pxPerSecond);
                      const width = Math.max(secToPx(sub.endTime - sub.startTime, pxPerSecond), 18);
                      const active = currentTime >= sub.startTime && currentTime < sub.endTime;
                      return (
                        <button
                          key={sub.id}
                          type="button"
                          data-block="subtitle"
                          className={`video-timeline-review__subtitle-clip${active ? ' video-timeline-review__subtitle-clip--active' : ''}${isSelected('subtitle', sub.id) ? ' video-timeline-review__subtitle-clip--selected' : ''}`}
                          style={{ left, width }}
                          title={sub.text}
                          onClick={() => onSelect({ kind: 'subtitle', id: sub.id })}
                        >
                          {sub.text}
                        </button>
                      );
                    })}
                  </TrackLane>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function clampTime(time: number, duration: number): number {
  return Math.max(0, Math.min(duration, time));
}
