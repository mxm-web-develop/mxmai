import { useEffect, useState } from 'react';
import {
  getCachedAuthenticatedMediaPreviewUrl,
  needsAuthenticatedMediaFetch,
  parseStorageObjectIdFromUrl,
  resolveAuthenticatedMediaPreviewUrl,
  shouldUseBlobMediaPreview,
  toSameOriginApiPath,
} from '../api/client';

type PreviewState = {
  previewUrl: string;
  loading: boolean;
  failed: boolean;
};

type PreviewOptions = {
  objectId?: string;
};

function buildPreviewState(sourceUrl: string | undefined, objectId?: string): PreviewState {
  if (!sourceUrl) {
    return { previewUrl: '', loading: false, failed: false };
  }

  // 公网读路径：直接用同源 URL，避免每张图下载 blob
  if (sourceUrl.includes('/media/public/')) {
    const previewUrl =
      sourceUrl.startsWith('http://') ||
      sourceUrl.startsWith('https://') ||
      sourceUrl.startsWith('blob:') ||
      sourceUrl.startsWith('data:')
        ? sourceUrl
        : toSameOriginApiPath(sourceUrl);
    return { previewUrl, loading: false, failed: false };
  }

  const resolvedObjectId = objectId ?? parseStorageObjectIdFromUrl(sourceUrl) ?? undefined;

  if (shouldUseBlobMediaPreview(sourceUrl, resolvedObjectId)) {
    const cached = getCachedAuthenticatedMediaPreviewUrl(sourceUrl, resolvedObjectId);
    if (cached) {
      return { previewUrl: cached, loading: false, failed: false };
    }
    return { previewUrl: '', loading: true, failed: false };
  }

  if (!needsAuthenticatedMediaFetch(sourceUrl)) {
    const previewUrl =
      sourceUrl.startsWith('http://') || sourceUrl.startsWith('https://')
        ? sourceUrl
        : toSameOriginApiPath(sourceUrl);
    return {
      previewUrl,
      loading: false,
      failed: false,
    };
  }

  const cached = getCachedAuthenticatedMediaPreviewUrl(sourceUrl, resolvedObjectId);
  if (cached) {
    return { previewUrl: cached, loading: false, failed: false };
  }

  return { previewUrl: '', loading: true, failed: false };
}

/** 将需鉴权的 media/object URL 转为可给 <img> 用的 blob: URL */
export function useAuthMediaPreview(
  sourceUrl: string | undefined,
  options?: PreviewOptions
): PreviewState {
  const objectId = options?.objectId;
  const [state, setState] = useState<PreviewState>(() => buildPreviewState(sourceUrl, objectId));

  useEffect(() => {
    const next = buildPreviewState(sourceUrl, objectId);
    if (!sourceUrl) {
      setState(next);
      return;
    }

    if (sourceUrl.includes('/media/public/')) {
      setState(buildPreviewState(sourceUrl, objectId));
      return;
    }

    if (next.previewUrl && !next.loading) {
      setState(next);
      return;
    }

    const resolvedObjectId = objectId ?? parseStorageObjectIdFromUrl(sourceUrl) ?? undefined;
    if (!shouldUseBlobMediaPreview(sourceUrl, resolvedObjectId) && !needsAuthenticatedMediaFetch(sourceUrl)) {
      setState(next);
      return;
    }

    let cancelled = false;
    setState({ previewUrl: '', loading: true, failed: false });

    void resolveAuthenticatedMediaPreviewUrl(sourceUrl, resolvedObjectId)
      .then((url) => {
        if (cancelled) return;
        setState({ previewUrl: url, loading: false, failed: false });
      })
      .catch(() => {
        if (!cancelled) setState({ previewUrl: '', loading: false, failed: true });
      });

    return () => {
      cancelled = true;
    };
  }, [sourceUrl, objectId]);

  return state;
}
