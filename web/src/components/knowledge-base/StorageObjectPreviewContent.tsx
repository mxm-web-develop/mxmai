import { useEffect, useState } from 'react';
import BrandLoading from '../BrandLoading';
import { fetchStorageObjectText, normalizeUploadedMediaUrl } from '../../api/client';
import { useAuthMediaPreview } from '../../hooks/useAuthMediaPreview';

export type StorageObjectPreviewItem = {
  id: string;
  name: string;
  contentType?: string | null;
  url: string;
};

function isTextualStorageObject(item: StorageObjectPreviewItem): boolean {
  const ct = (item.contentType ?? '').toLowerCase();
  if (ct.includes('markdown') || ct.startsWith('text/')) return true;
  return /\.(md|markdown|txt)$/i.test((item.name ?? '').trim());
}

export function StorageObjectPreviewContent({ item }: { item: StorageObjectPreviewItem }) {
  const mediaUrl = item.url.startsWith('http') ? item.url : normalizeUploadedMediaUrl(item.url);
  const asText = isTextualStorageObject(item);
  const mediaPreview = useAuthMediaPreview(asText ? undefined : mediaUrl, { objectId: item.id });
  const [text, setText] = useState<string | null>(null);
  const [textLoading, setTextLoading] = useState(asText);
  const [textError, setTextError] = useState<string | null>(null);

  useEffect(() => {
    if (!asText) return;
    let cancelled = false;
    setTextLoading(true);
    setTextError(null);
    void fetchStorageObjectText(mediaUrl, item.id)
      .then((body) => {
        if (!cancelled) setText(body);
      })
      .catch((e) => {
        if (!cancelled) setTextError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setTextLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [asText, item.id, mediaUrl]);

  if (asText) {
    if (textLoading) return <BrandLoading />;
    if (textError) return <p className="muted">无法加载文稿：{textError}</p>;
    return (
      <pre
        className="asset-preview-text"
        style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, maxHeight: '70vh', overflow: 'auto' }}
      >
        {text || '（空文稿）'}
      </pre>
    );
  }

  const { previewUrl, loading, failed } = mediaPreview;
  if (loading) return <BrandLoading />;
  if (failed || !previewUrl) return <p className="muted">无法加载预览</p>;

  const ct = (item.contentType ?? '').toLowerCase();
  if (ct.startsWith('video/')) {
    return <video src={previewUrl} controls className="asset-preview-video" />;
  }
  if (ct.startsWith('audio/') || /\.(mp3|m4a|wav|aac|ogg|flac)$/i.test(item.name)) {
    return (
      <div className="asset-preview-audio-wrap">
        <audio src={previewUrl} controls className="asset-preview-audio" />
      </div>
    );
  }
  return <img src={previewUrl} alt={item.name} className="asset-preview-image" />;
}
