import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MediaLoadingState } from './MediaLoadingState';
import { VIDEO_THUMB_ERROR } from '../hooks/useVideoTaskThumbnails';

type VideoTaskThumbProps = {
  taskId: string;
  status: string;
  thumbUrl?: string;
  onRequest: (taskId: string) => void;
};

export function VideoTaskThumb({ taskId, status, thumbUrl, onRequest }: VideoTaskThumbProps) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || status !== 'completed' || thumbUrl) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          onRequest(taskId);
          observer.disconnect();
        }
      },
      { rootMargin: '120px', threshold: 0.01 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [taskId, status, thumbUrl, onRequest]);

  const hasPoster = Boolean(thumbUrl && thumbUrl !== VIDEO_THUMB_ERROR);

  return (
    <div
      className={`video-thumb${hasPoster ? ' video-thumb--has-poster' : ''}`}
      ref={rootRef}
      aria-hidden
    >
      {status !== 'completed' ? (
        <span className="video-thumb-placeholder">—</span>
      ) : thumbUrl === VIDEO_THUMB_ERROR ? (
        <span className="video-thumb-placeholder" title={t('common.coverLoadFailed')}>
          {t('common.noCover')}
        </span>
      ) : thumbUrl ? (
        <img src={thumbUrl} alt="" className="video-thumb-img" loading="lazy" decoding="async" />
      ) : (
        <MediaLoadingState variant="compact" kind="video" />
      )}
      {status === 'completed' && thumbUrl !== VIDEO_THUMB_ERROR ? (
        <div className="video-thumb-play" aria-hidden />
      ) : null}
    </div>
  );
}
