import { useEffect, useRef, useState } from 'react';
import { MediaLoadingState } from '../MediaLoadingState';
import {
  fetchStorageObjectBlobUrl,
  getCachedAuthenticatedMediaPreviewUrl,
} from '../../api/client';

type UploadPickerThumbProps = {
  objectId: string;
  contentUrl: string;
  contentType?: string | null;
};

export function UploadPickerThumb({ objectId, contentUrl, contentType }: UploadPickerThumbProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const isVisual =
    contentType?.startsWith('image/') || contentType?.startsWith('video/') || false;
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(() =>
    getCachedAuthenticatedMediaPreviewUrl(contentUrl, objectId)
  );

  useEffect(() => {
    const hit = getCachedAuthenticatedMediaPreviewUrl(contentUrl, objectId);
    if (hit) setPreviewUrl(hit);
  }, [contentUrl, objectId]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || !isVisual || previewUrl) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          void fetchStorageObjectBlobUrl(contentUrl, objectId)
            .then((url) => setPreviewUrl(url))
            .catch(() => undefined);
          observer.disconnect();
        }
      },
      { rootMargin: '120px', threshold: 0.01 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [contentUrl, isVisual, objectId, previewUrl]);

  return (
    <div className="graph-task-thumb" ref={rootRef}>
      {!isVisual ? (
        <span className="graph-task-thumb-placeholder" title={contentType ?? '文件'}>
          文档
        </span>
      ) : previewUrl ? (
        <img src={previewUrl} alt="" className="graph-task-thumb-img" loading="lazy" decoding="async" />
      ) : (
        <MediaLoadingState variant="compact" kind={contentType?.startsWith('video/') ? 'video' : 'image'} />
      )}
    </div>
  );
}
