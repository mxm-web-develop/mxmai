import { useEffect, useRef } from 'react';
import { needsAuthenticatedMediaFetch } from '../../api/client';
import { useMediaPlaybackUrl } from './useMediaPlaybackUrl';

type StaticClipVideoProps = {
  clipId: string;
  url: string;
  fit: React.CSSProperties['objectFit'];
  active: boolean;
  clipElapsed: number;
  /** 与时间轴播放同步；暂停时保留当前帧 */
  isPlaying?: boolean;
  preload?: 'none' | 'metadata' | 'auto';
  onCanPlay?: () => void;
  onError?: () => void;
};

/** 静态素材视频预览：鉴权 URL → blob，并按时间轴播放头同步 currentTime */
export function StaticClipVideo({
  clipId,
  url,
  fit,
  active,
  clipElapsed,
  isPlaying = true,
  preload = 'metadata',
  onCanPlay,
  onError,
}: StaticClipVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const { playbackUrl } = useMediaPlaybackUrl(url, { delivery: 'stream' });
  const src = playbackUrl ?? (!needsAuthenticatedMediaFetch(url) ? url : undefined);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !src) return;

    if (!active) {
      el.pause();
      return;
    }

    const syncTime = () => {
      const duration = el.duration;
      if (!Number.isFinite(duration) || duration <= 0) return;
      const target = clipElapsed % duration;
      if (Math.abs(el.currentTime - target) > 0.35) {
        try {
          el.currentTime = target;
        } catch {
          /* metadata not ready */
        }
      }
    };

    syncTime();
    if (isPlaying) {
      void el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, [active, clipElapsed, isPlaying, src]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !src || !active) return;

    const onLoaded = () => {
      onCanPlay?.();
      const duration = el.duration;
      if (Number.isFinite(duration) && duration > 0) {
        try {
          el.currentTime = clipElapsed % duration;
        } catch {
          /* ignore */
        }
      }
    };

    const onVideoError = () => {
      onError?.();
    };

    el.addEventListener('loadeddata', onLoaded);
    el.addEventListener('error', onVideoError);
    if (el.readyState >= 2) onLoaded();
    return () => {
      el.removeEventListener('loadeddata', onLoaded);
      el.removeEventListener('error', onVideoError);
    };
  }, [active, clipElapsed, src, onCanPlay, onError]);

  if (!src) return null;

  return (
    <video
      key={clipId}
      ref={videoRef}
      src={src}
      className={[
        'video-timeline-review__stage-image',
        active ? 'video-timeline-review__stage-image--active' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ objectFit: fit }}
      muted
      playsInline
      loop
      preload={preload}
      aria-hidden={!active}
    />
  );
}
