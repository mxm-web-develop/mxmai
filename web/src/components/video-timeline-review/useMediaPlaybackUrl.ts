import { useEffect, useMemo, useState } from 'react';
import {
  getCachedAuthenticatedMediaPreviewUrl,
  needsAuthenticatedMediaFetch,
  resolveAuthenticatedMediaPreviewUrl,
  resolveAuthenticatedMediaStreamUrl,
} from '../../api/client';
import { rewriteInternalStorageMediaUrl } from './voiceoverTimelineEnrich';

export type MediaPlaybackState = {
  playbackUrl?: string;
  isLoading: boolean;
  hasError: boolean;
};

export type MediaPlaybackOptions = {
  /**
   * stream：鉴权媒体直链 ?token=，video/audio 可 Range 边下边播（默认）
   * blob：整文件下载为 blob:（图片缩略图等仍适用）
   */
  delivery?: 'stream' | 'blob';
};

/** 鉴权 / 内网媒体 URL → 直链或 blob，供 <video>/<audio> 预览 */
export function useMediaPlaybackUrl(
  sourceUrl?: string,
  options?: MediaPlaybackOptions
): MediaPlaybackState {
  const delivery = options?.delivery ?? 'stream';
  const normalized = useMemo(
    () => (sourceUrl ? rewriteInternalStorageMediaUrl(sourceUrl) : undefined),
    [sourceUrl]
  );

  const streamPlaybackUrl = useMemo(() => {
    if (!normalized || delivery !== 'stream') return undefined;
    if (!needsAuthenticatedMediaFetch(normalized)) return normalized;
    return resolveAuthenticatedMediaStreamUrl(normalized);
  }, [normalized, delivery]);

  const [blobPlaybackUrl, setBlobPlaybackUrl] = useState<string | undefined>(() => {
    if (!normalized || delivery === 'stream') return undefined;
    if (!needsAuthenticatedMediaFetch(normalized)) return normalized;
    return getCachedAuthenticatedMediaPreviewUrl(normalized);
  });
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (delivery === 'stream') return;

    if (!normalized) {
      setBlobPlaybackUrl(undefined);
      setHasError(false);
      return;
    }
    if (!needsAuthenticatedMediaFetch(normalized)) {
      setBlobPlaybackUrl(normalized);
      setHasError(false);
      return;
    }
    const cached = getCachedAuthenticatedMediaPreviewUrl(normalized);
    if (cached) {
      setBlobPlaybackUrl(cached);
      setHasError(false);
      return;
    }
    let cancelled = false;
    setHasError(false);
    void resolveAuthenticatedMediaPreviewUrl(normalized)
      .then((url) => {
        if (!cancelled) {
          setBlobPlaybackUrl(url);
          setHasError(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBlobPlaybackUrl(undefined);
          setHasError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [normalized, delivery]);

  if (delivery === 'stream') {
    if (!normalized) {
      return { playbackUrl: undefined, isLoading: false, hasError: false };
    }
    return {
      playbackUrl: streamPlaybackUrl,
      isLoading: false,
      hasError: false,
    };
  }

  return {
    playbackUrl: blobPlaybackUrl,
    isLoading: Boolean(normalized) && !blobPlaybackUrl && !hasError,
    hasError,
  };
}
