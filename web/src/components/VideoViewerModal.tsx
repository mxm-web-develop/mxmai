/**
 * 视频任务查看弹窗 - 展示最终成片，或自动剪辑过程中的 AI 视频/配图片段
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { WritingTaskItem } from '../api/client';
import type { AutocutClipPreview } from '../lib/autocutClipPreviews';
import { MediaLoadingState } from './MediaLoadingState';
import { MediaViewerHeader } from './MediaViewerHeader';
import { useAdminGatedViewerMode } from './viewer/useAdminGatedViewerMode';
import './VideoViewerModal.css';

interface VideoViewerModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  task: WritingTaskItem | null;
  videoUrl: string | null;
  /** 自动剪辑等：过程中生成的 AI 视频 / 配图，可在无成片时预览 */
  clipPreviews?: AutocutClipPreview[];
  loading?: boolean;
  error?: string | null;
  onPlayError?: () => void;
  /** 无成片但有片段时的提示（非阻断） */
  hint?: string | null;
}

export function VideoViewerModal({
  visible,
  onClose,
  title,
  task,
  videoUrl,
  clipPreviews = [],
  loading,
  error,
  onPlayError,
  hint,
}: VideoViewerModalProps) {
  const { t } = useTranslation();
  const { viewMode, setViewMode } = useAdminGatedViewerMode<'content' | 'raw'>('content');
  const [playError, setPlayError] = useState<string | null>(null);
  const [activeClipId, setActiveClipId] = useState<string | null>(null);

  useEffect(() => {
    setPlayError(null);
  }, [videoUrl, visible]);

  useEffect(() => {
    if (!visible) return;
    if (videoUrl) {
      setActiveClipId(null);
      return;
    }
    if (clipPreviews.length > 0) {
      setActiveClipId((prev) => {
        if (prev && clipPreviews.some((c) => c.clipId === prev)) return prev;
        return clipPreviews[0]!.clipId;
      });
    } else {
      setActiveClipId(null);
    }
  }, [visible, videoUrl, clipPreviews]);

  useEffect(() => {
    return () => {
      if (videoUrl && typeof videoUrl === 'string' && videoUrl.startsWith('blob:')) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [videoUrl]);

  if (!visible) return null;

  const activeClip =
    !videoUrl && activeClipId
      ? clipPreviews.find((c) => c.clipId === activeClipId) ?? clipPreviews[0]
      : undefined;
  const showClipGallery = !loading && !error && !videoUrl && clipPreviews.length > 0;

  return (
    <div
      className="vv-root"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <div className="vv-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="vv-shell">
        <MediaViewerHeader
          title={title || t('video.viewer.title')}
          tabs={[
            { value: 'content', label: t('common.viewer.tabs.content') },
            { value: 'raw', label: t('common.viewer.tabs.data') },
          ]}
          activeTab={viewMode}
          onTabChange={(tab) => setViewMode(tab as 'content' | 'raw')}
          onClose={onClose}
        />

        <main className="vv-body">
          {loading && (
            <div className="media-viewer-loading-wrap video-viewer-loading-wrap">
              <MediaLoadingState variant="stage" kind="video" />
            </div>
          )}
          {error && !showClipGallery && <p className="vv-error">{error}</p>}
          {playError && !error && <p className="vv-error">{playError}</p>}
          {hint && showClipGallery && viewMode === 'content' && (
            <p className="vv-hint">{hint}</p>
          )}
          {!loading && !error && viewMode === 'content' && !videoUrl && clipPreviews.length === 0 && (
            <p className="vv-empty">{t('video.viewer.noResults')}</p>
          )}
          {!loading && !error && viewMode === 'content' && videoUrl && (
            <div className="vv-player">
              <video
                key={videoUrl}
                src={videoUrl}
                controls
                className="vv-video"
                onError={() => {
                  setPlayError(t('video.viewer.loadFailed'));
                  onPlayError?.();
                }}
              />
            </div>
          )}
          {viewMode === 'content' && showClipGallery && (
            <div className="vv-clip-layout">
              <div className="vv-player vv-player--clip">
                {activeClip?.kind === 'video' ? (
                  <video
                    key={activeClip.url}
                    src={activeClip.url}
                    controls
                    autoPlay
                    className="vv-video"
                    onError={() => setPlayError(t('video.viewer.segmentFailed'))}
                  />
                ) : activeClip?.kind === 'image' ? (
                  <img
                    key={activeClip.url}
                    src={activeClip.url}
                    alt={activeClip.label}
                    className="vv-image"
                  />
                ) : null}
              </div>
              <ul className="vv-clip-strip" aria-label={t('common.media.aiSegmentAria')}>
                {clipPreviews.map((clip) => (
                  <li key={clip.clipId}>
                    <button
                      type="button"
                      className={`vv-clip-tile${
                        activeClip?.clipId === clip.clipId ? ' vv-clip-tile--active' : ''
                      }`}
                      onClick={() => setActiveClipId(clip.clipId)}
                      title={clip.label}
                    >
                      {clip.kind === 'video' ? (
                        <video src={clip.url} muted playsInline preload="metadata" />
                      ) : (
                        <img src={clip.url} alt="" loading="lazy" />
                      )}
                      <span className="vv-clip-tile-label">
                        {clip.kind === 'video' ? t('common.media.video') : t('common.media.image')}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {activeClip ? (
                <p className="vv-clip-caption" title={activeClip.label}>
                  {activeClip.label}
                  {activeClip.childTaskId ? (
                    <span className="vv-clip-task-id">
                      {' '}
                      · {t('common.media.taskId', { id: `${activeClip.childTaskId.slice(0, 8)}…` })}
                    </span>
                  ) : null}
                </p>
              ) : null}
            </div>
          )}
          {viewMode === 'raw' && task && (
            <pre className="vv-pre">{JSON.stringify(task, null, 2)}</pre>
          )}
        </main>
      </div>
    </div>
  );
}
