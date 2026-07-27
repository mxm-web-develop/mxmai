import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MediaLoadingState } from './MediaLoadingState';
import { TaskProgressCompact } from './TaskProgressCompact';
import { GRAPH_THUMB_ERROR } from '../hooks/useGraphTaskThumbnails';

interface GraphTaskThumbProps {
  taskId: string;
  status: string;
  progress?: number | null;
  thumbUrl?: string;
  /** 图集辅图（index 1+），用于叠放层透出 */
  albumThumbUrls?: string[];
  onRequest: (taskId: string, options?: { mediaCount?: number }) => void;
  /** 有产出媒体时，失败态也拉缩略图展示 */
  hasMedia?: boolean;
  /** 图集任务：iOS 相册式叠放 + 张数徽标 */
  isAlbum?: boolean;
  mediaCount?: number;
}

function isGraphTaskInProgress(status: string): boolean {
  return status === 'pending' || status === 'queued' || status === 'processing';
}

function isGraphTaskFailed(status: string): boolean {
  return status === 'failed' || status === 'cancelled';
}

export function GraphTaskThumb({
  taskId,
  status,
  progress,
  thumbUrl,
  albumThumbUrls = [],
  onRequest,
  hasMedia = false,
  isAlbum = false,
  mediaCount = 1,
}: GraphTaskThumbProps) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canShowMedia = status === 'completed' || (hasMedia && isGraphTaskFailed(status));

  useEffect(() => {
    const el = rootRef.current;
    if (!el || !canShowMedia || thumbUrl) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          onRequest(taskId, { mediaCount: isAlbum ? Math.max(mediaCount, 1) : 1 });
          observer.disconnect();
        }
      },
      { rootMargin: '120px', threshold: 0.01 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [taskId, canShowMedia, thumbUrl, onRequest, isAlbum, mediaCount]);

  useEffect(() => {
    if (!canShowMedia || !isAlbum || !thumbUrl || thumbUrl === GRAPH_THUMB_ERROR) return;
    if (mediaCount <= 1) return;
    if (albumThumbUrls.length >= Math.min(2, mediaCount - 1)) return;
    onRequest(taskId, { mediaCount });
  }, [canShowMedia, isAlbum, thumbUrl, mediaCount, albumThumbUrls.length, onRequest, taskId]);

  if (isGraphTaskInProgress(status)) {
    return (
      <div className="graph-task-thumb graph-task-thumb--progress" ref={rootRef}>
        <TaskProgressCompact progress={progress ?? null} status={status} kind="image" />
      </div>
    );
  }

  if (isGraphTaskFailed(status) && !hasMedia) {
    return (
      <div className="graph-task-thumb graph-task-thumb--progress" ref={rootRef}>
        <TaskProgressCompact progress={progress ?? null} status={status} kind="image" failed />
      </div>
    );
  }

  if (isAlbum) {
    const backUrl = albumThumbUrls[1] || albumThumbUrls[0];
    const midUrl = albumThumbUrls[0];
    const count = mediaCount > 0 ? mediaCount : 1;

    return (
      <div
        className="graph-task-thumb graph-task-thumb--album"
        ref={rootRef}
        aria-label={t('common.viewer.graph.albumThumb', { count })}
      >
        <div className="graph-album-stack" aria-hidden>
          <span
            className={`graph-album-stack__sheet graph-album-stack__sheet--back${
              backUrl ? ' graph-album-stack__sheet--photo' : ''
            }`}
            style={backUrl ? { backgroundImage: `url(${backUrl})` } : undefined}
          />
          <span
            className={`graph-album-stack__sheet graph-album-stack__sheet--mid${
              midUrl ? ' graph-album-stack__sheet--photo' : ''
            }`}
            style={midUrl ? { backgroundImage: `url(${midUrl})` } : undefined}
          />
          <div className="graph-album-stack__front">
            {thumbUrl === GRAPH_THUMB_ERROR ? (
              <span className="graph-task-thumb-placeholder" title={t('common.previewFailedHint')}>
                {t('common.previewFailed')}
              </span>
            ) : thumbUrl ? (
              <img src={thumbUrl} alt="" className="graph-task-thumb-img" loading="lazy" decoding="async" />
            ) : (
              <MediaLoadingState variant="compact" kind="image" />
            )}
          </div>
        </div>
        {count > 1 ? <span className="graph-album-count">{count}</span> : null}
      </div>
    );
  }

  return (
    <div className="graph-task-thumb" ref={rootRef}>
      {thumbUrl === GRAPH_THUMB_ERROR ? (
        <span className="graph-task-thumb-placeholder" title={t('common.previewFailedHint')}>
          {t('common.previewFailed')}
        </span>
      ) : thumbUrl ? (
        <img src={thumbUrl} alt="" className="graph-task-thumb-img" loading="lazy" decoding="async" />
      ) : (
        <MediaLoadingState variant="compact" kind="image" />
      )}
    </div>
  );
}
