import { useEffect, useState } from 'react';
import { App, Button, Modal, Radio, Typography } from 'antd';
import { Clock, FileAudio } from 'lucide-react';
import BrandLoading from '../BrandLoading';
import {
  deleteStorageObject,
  listStorageObjects,
  normalizeUploadedMediaUrl,
  peekStorageObjectsList,
  prefetchStorageObjectPreviews,
  type StorageObjectListItem,
  type StorageObjectMode,
} from '../../api/client';
import { useAuthMediaPreview } from '../../hooks/useAuthMediaPreview';
import type { MediaPickPayload } from './types';
import '../schema-form/reference-images.css';

function matchesLibraryAccept(
  item: StorageObjectListItem,
  acceptVideos: boolean,
  acceptAudio: boolean
): boolean {
  const ct = item.contentType ?? '';
  if (acceptAudio) return ct.startsWith('audio/');
  if (ct.startsWith('image/')) return true;
  return acceptVideos && ct.startsWith('video/');
}

function RecentImageThumb({
  item,
  onSelect,
  onInvalid,
  timeLabel,
}: {
  item: StorageObjectListItem;
  onSelect: () => void;
  onInvalid: () => void;
  timeLabel: string;
}) {
  const { previewUrl, loading, failed } = useAuthMediaPreview(item.url, { objectId: item.id });
  return (
    <button type="button" className="ref-images__thumb" onClick={onSelect}>
      {loading ? (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <BrandLoading size="small" />
        </div>
      ) : previewUrl && !failed ? (
        <img src={previewUrl} alt={item.originalName ?? ''} onError={() => onInvalid()} />
      ) : (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#94a3b8' }}>
          失效
        </div>
      )}
      <span className="ref-images__thumb-time">{timeLabel}</span>
    </button>
  );
}

export type MediaLibraryPickerModalProps = {
  open: boolean;
  onClose: () => void;
  acceptVideos?: boolean;
  /** 仅列出音频资产（与 acceptVideos 互斥场景，如口播上传字段） */
  acceptAudio?: boolean;
  title?: string;
  pickSuccessMessage?: string;
  onPick: (item: MediaPickPayload) => void;
};

export function MediaLibraryPickerModal({
  open,
  onClose,
  acceptVideos = false,
  acceptAudio = false,
  title,
  pickSuccessMessage = '已选择',
  onPick,
}: MediaLibraryPickerModalProps) {
  const { message } = App.useApp();
  const [browseMode, setBrowseMode] = useState<StorageObjectMode>('temp');
  const [recentImages, setRecentImages] = useState<StorageObjectListItem[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const [recentRefreshing, setRecentRefreshing] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBrowseMode('temp');
  }, [open]);

  const loadRecent = (mode: StorageObjectMode) => {
    const opts = { storageMode: mode, uploadSource: 'self' as const, limit: acceptVideos || acceptAudio ? 80 : 48 };
    const cached = peekStorageObjectsList(opts);
    const filterMedia = (items: StorageObjectListItem[]) =>
      items.filter((it) => matchesLibraryAccept(it, acceptVideos, acceptAudio));
    const cachedImages = filterMedia(cached?.items ?? []);
    if (cachedImages.length > 0) {
      setRecentImages(cachedImages);
      setRecentLoading(false);
      setRecentRefreshing(true);
    } else {
      setRecentLoading(true);
    }

    return listStorageObjects(opts)
      .then((res) => {
        const images = filterMedia(res.items);
        setRecentImages(images);
        if (!acceptAudio) {
          prefetchStorageObjectPreviews(
            images.map((it) => ({ id: it.id, url: it.url, contentType: it.contentType })),
            { concurrency: 8 }
          );
        }
      })
      .catch(() => {
        if (cachedImages.length === 0) setRecentImages([]);
      })
      .finally(() => {
        setRecentLoading(false);
        setRecentRefreshing(false);
      });
  };

  useEffect(() => {
    if (!open) return;
    void loadRecent(browseMode);
  }, [open, browseMode, acceptVideos, acceptAudio]);

  const formatRelativeTime = (createdAt: string) => {
    const diff = Date.now() - new Date(createdAt).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '刚刚';
    if (mins < 60) return `${mins} 分钟前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} 小时前`;
    return `${Math.floor(hours / 24)} 天前`;
  };

  const selectRecentImage = (item: StorageObjectListItem) => {
    const content = normalizeUploadedMediaUrl(item.url || '');
    if (!content.trim()) {
      message.error('该资产缺少可用地址');
      return;
    }
    const mediaKind: 'image' | 'video' = item.contentType?.startsWith('video/') ? 'video' : 'image';
    onPick({
      content,
      mediaKind,
      source: 'asset',
      sourceLabel: item.originalName ?? '我的资产',
    });
    if (pickSuccessMessage) message.success(pickSuccessMessage);
    onClose();
  };

  const defaultTitle = acceptAudio ? '已上传音频' : acceptVideos ? '已上传资产' : '已上传资产';

  return (
    <Modal
      title={title ?? defaultTitle}
      open={open}
      onCancel={onClose}
      footer={null}
      width={Math.min(720, typeof window !== 'undefined' ? window.innerWidth - 32 : 720)}
      destroyOnClose
      className="unified-media-source-library-modal"
    >
      <div className="ref-images__panel">
        <div className="ref-images__panel-head">
          <div className="ref-images__panel-title">
            <Clock size={16} />
            最近上传
            <span className="ref-images__panel-badge ref-images__panel-badge--muted">
              {browseMode === 'temp' ? '临时' : '资产'}
            </span>
          </div>
          <Button size="small" loading={recentRefreshing} onClick={() => void loadRecent(browseMode)}>
            刷新
          </Button>
        </div>
        <div className="ref-images__browse-row">
          <Radio.Group
            size="small"
            value={browseMode}
            onChange={(e) => setBrowseMode(e.target.value)}
            optionType="button"
            buttonStyle="solid"
          >
            <Radio.Button value="temp">临时</Radio.Button>
            <Radio.Button value="asset">资产</Radio.Button>
          </Radio.Group>
        </div>
        {recentLoading && recentImages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 20 }}>
            <BrandLoading />
          </div>
        ) : recentImages.length === 0 ? (
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            暂无{acceptAudio ? '音频' : '素材'}，请先通过「拖拽 / 上传」添加
          </Typography.Text>
        ) : acceptAudio ? (
          <div className="ref-images__audio-list">
            {recentImages.map((item) => (
              <button
                key={item.id}
                type="button"
                className="ref-images__audio-row"
                onClick={() => selectRecentImage(item)}
              >
                <FileAudio size={16} />
                <span className="ref-images__audio-row-name">{item.originalName || '音频'}</span>
                <span className="ref-images__audio-row-time">{formatRelativeTime(item.createdAt)}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="ref-images__thumb-grid">
            {recentImages.map((item) =>
              item.contentType?.startsWith('video/') ? (
                <button key={item.id} type="button" className="ref-images__thumb" onClick={() => selectRecentImage(item)}>
                  <video src={item.url || ''} muted playsInline preload="metadata" />
                  <span className="ref-images__thumb-time">视频</span>
                </button>
              ) : (
                <RecentImageThumb
                  key={item.id}
                  item={item}
                  timeLabel={formatRelativeTime(item.createdAt)}
                  onSelect={() => selectRecentImage(item)}
                  onInvalid={() => {
                    void (async () => {
                      try {
                        await deleteStorageObject(item.id);
                      } catch {
                        /* ignore */
                      }
                      setRecentImages((prev) => prev.filter((img) => img.id !== item.id));
                    })();
                  }}
                />
              )
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
