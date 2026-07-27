/**
 * 口播音频全屏预览 — 演播室级沉浸布局：GSAP 入场 + 字幕聚焦 + 玻璃控制台
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { Music2 } from 'lucide-react';
import type { WritingTaskItem } from '../api/client';
import { fetchAudioSubtitles } from '../api/client';
import { MediaLoadingState } from './MediaLoadingState';
import { MediaViewerHeader } from './MediaViewerHeader';
import { useAdminGatedViewerMode } from './viewer/useAdminGatedViewerMode';
import { AudioSubtitlePanel } from './audio/AudioSubtitlePanel';
import { ThemeAudioPlayer } from './audio/ThemeAudioPlayer';
import { normalizeSubtitlePayload, type SubtitleCue } from '../lib/audioSubtitles';
import { animateViewerShellEnter, MOTION } from '../lib/motion/gsapPresets';
import './AudioViewerModal.css';

gsap.registerPlugin(useGSAP);

interface AudioViewerModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  task: WritingTaskItem | null;
  mediaUrls: string[];
  loading?: boolean;
  error?: string | null;
  /** 默认 true；音乐等无字幕场景设为 false */
  showSubtitles?: boolean;
  /** 顶栏工作室标识，默认 Voice Over Studio / Music Studio */
  studioEyebrow?: string;
  /** 内容 Tab 文案，默认「口播」/「音乐」 */
  contentTabLabel?: string;
}

export function AudioViewerModal({
  visible,
  onClose,
  title,
  task,
  mediaUrls,
  loading,
  error,
  showSubtitles = true,
  studioEyebrow: _studioEyebrow,
  contentTabLabel,
}: AudioViewerModalProps) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const { viewMode, setViewMode } = useAdminGatedViewerMode<'content' | 'raw'>('content');
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [subtitleCues, setSubtitleCues] = useState<SubtitleCue[]>([]);
  const [subtitleLoading, setSubtitleLoading] = useState(false);
  const [subtitleError, setSubtitleError] = useState<string | null>(null);
  const [downloadBusy, setDownloadBusy] = useState(false);

  const primaryUrl = mediaUrls[0];
  const taskId = task?.id;
  const displayTitle = title || (showSubtitles ? t('common.viewer.audio.voiceoverTitle') : t('common.viewer.audio.musicTitle'));
  const tabLabel = contentTabLabel ?? (showSubtitles ? t('common.viewer.audio.voiceoverTab') : t('common.viewer.audio.musicTab'));

  useGSAP(
    () => {
      if (!visible || !rootRef.current) return;
      const backdrop = rootRef.current.querySelector('.audio-viewer-backdrop');
      const shell = rootRef.current.querySelector('.audio-viewer-shell');
      const tl = gsap.timeline();
      if (backdrop && shell) {
        animateViewerShellEnter(backdrop, shell);
      }
      tl.fromTo(
        '.audio-viewer-orb',
        { scale: 0.6, opacity: 0 },
        { scale: 1, opacity: 1, duration: 1.1, stagger: 0.12, ease: MOTION.viewerShell.ease },
        0
      )
        .fromTo(
          '.mvh-header',
          { y: -12, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.45, ease: 'power2.out' },
          0.2
        )
        .fromTo(
          '.audio-viewer-dock',
          { y: 48, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.55, ease: MOTION.viewerShell.ease },
          0.28
        );
    },
    { scope: rootRef, dependencies: [visible], revertOnUpdate: true }
  );

  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [visible, onClose]);

  useEffect(() => {
    if (!visible) {
      setCurrentTimeMs(0);
      setSubtitleCues([]);
      setSubtitleError(null);
      setSubtitleLoading(false);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || !showSubtitles || viewMode !== 'content' || !taskId || !primaryUrl) {
      setSubtitleCues([]);
      setSubtitleError(null);
      if (!showSubtitles) setSubtitleLoading(false);
      return;
    }

    let cancelled = false;
    setSubtitleLoading(true);
    setSubtitleError(null);

    void fetchAudioSubtitles(taskId)
      .then((payload) => {
        if (cancelled) return;
        const cues = normalizeSubtitlePayload(payload);
        setSubtitleCues(cues);
        if (!cues.length) setSubtitleError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setSubtitleCues([]);
        setSubtitleError(e instanceof Error ? e.message : t('common.viewer.audio.subtitleLoadFailed'));
      })
      .finally(() => {
        if (!cancelled) setSubtitleLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [visible, showSubtitles, viewMode, taskId, primaryUrl, t]);

  const handleDownload = useCallback(async () => {
    if (!primaryUrl || downloadBusy) return;
    setDownloadBusy(true);
    try {
      const res = await fetch(primaryUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const base = task?.id ? `${showSubtitles ? 'audio' : 'music'}-${task.id}` : showSubtitles ? 'audio-result' : 'music-result';
      const name = `${base}.mp3`;
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = name;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
    } catch {
      window.alert(t('common.viewer.audio.downloadFailed'));
    } finally {
      setDownloadBusy(false);
    }
  }, [primaryUrl, task?.id, downloadBusy, showSubtitles, t]);

  if (!visible) return null;

  return (
    <div
      ref={rootRef}
      className={`audio-viewer-root${showSubtitles ? '' : ' audio-viewer-root--music'}`}
      role="dialog"
      aria-modal="true"
      aria-label={displayTitle}
    >
      <div className="audio-viewer-backdrop" onClick={onClose} aria-hidden />

      <div className="audio-viewer-ambient" aria-hidden>
        <div className="audio-viewer-orb audio-viewer-orb--a" />
        <div className="audio-viewer-orb audio-viewer-orb--b" />
        <div className="audio-viewer-orb audio-viewer-orb--c" />
        <div className="audio-viewer-grid" />
      </div>

      <div className="audio-viewer-shell">
        <MediaViewerHeader
          title={displayTitle}
          tabs={[
            { value: 'content', label: tabLabel },
            { value: 'raw', label: t('common.viewer.tabs.data') },
          ]}
          activeTab={viewMode}
          onTabChange={(tab) => setViewMode(tab as 'content' | 'raw')}
          onClose={onClose}
          closeTitle={t("common.viewer.closeEsc")}
        />

        <div className="audio-viewer-body">
          {loading && (
            <div className="audio-viewer-main audio-viewer-main--centered">
              <MediaLoadingState variant="stage" kind="audio" />
            </div>
          )}

          {error && <p className="audio-viewer-error">{error}</p>}

          {!loading && !error && viewMode === 'content' && !primaryUrl && (
            <p className="audio-viewer-empty">{t('common.media.noResults')}</p>
          )}

          {!loading && !error && viewMode === 'content' && primaryUrl && (
            <div className="audio-viewer-main">
              <div className={`audio-viewer-console${showSubtitles ? '' : ' audio-viewer-console--music'}`}>
                {showSubtitles ? (
                  <div className="audio-viewer-stage">
                    <AudioSubtitlePanel
                      cues={subtitleCues}
                      currentTimeMs={currentTimeMs}
                      loading={subtitleLoading}
                      error={subtitleError}
                    />
                  </div>
                ) : (
                  <div className="audio-viewer-stage audio-viewer-stage--music" aria-hidden>
                    <div className="audio-viewer-music-visual">
                      <Music2 size={48} strokeWidth={1.5} className="audio-viewer-music-icon" />
                      <p className="audio-viewer-music-hint">{t('common.viewer.audio.playingMusic')}</p>
                    </div>
                  </div>
                )}
                <footer className="audio-viewer-dock">
                  <ThemeAudioPlayer
                    src={primaryUrl}
                    onTimeUpdate={(sec) => setCurrentTimeMs(sec * 1000)}
                    onDownload={() => void handleDownload()}
                    downloadBusy={downloadBusy}
                  />
                  {mediaUrls.length > 1 ? (
                    <p className="audio-viewer-multi-hint">{t('common.viewer.audio.multiHint', { count: mediaUrls.length })}</p>
                  ) : null}
                </footer>
              </div>
            </div>
          )}

          {!loading && viewMode === 'raw' && task && (
            <pre className="audio-viewer-raw">{JSON.stringify(task, null, 2)}</pre>
          )}
        </div>
      </div>
    </div>
  );
}
