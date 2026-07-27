import { Dropdown } from 'antd';
import { MediaLoadingState } from '../MediaLoadingState';
import type { AssetMediaKind } from '../asset-loading/types';
import type { MenuProps } from 'antd';
import type { StorageObjectListItem } from '../../api/client';
import { normalizeUploadedMediaUrl } from '../../api/client';
import { useAuthMediaPreview } from '../../hooks/useAuthMediaPreview';

function mediaKind(contentType: string | null): AssetMediaKind {
  if (contentType?.startsWith('video/')) return 'video';
  if (contentType?.startsWith('audio/')) return 'audio';
  if (contentType?.startsWith('image/')) return 'image';
  return 'file';
}

const KIND_ICON: Record<string, string> = {
  image: '🖼️',
  video: '🎬',
  audio: '🔊',
  file: '📄',
};

const KIND_COLOR: Record<string, string> = {
  image: '#f59e0b',
  video: '#94a3b8',
  audio: '#475569',
  file: '#64748b',
};

type Props = {
  item: StorageObjectListItem;
  selectionMode: boolean;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onPreview: (item: StorageObjectListItem) => void;
  onDelete: (item: StorageObjectListItem) => void;
  onMove?: (item: StorageObjectListItem) => void;
};

/** 上传文件卡片 — 布局对齐知识库 asset-card */
export function StorageMediaCard({
  item,
  selectionMode,
  isSelected,
  onToggleSelect,
  onPreview,
  onDelete,
  onMove,
}: Props) {
  const mediaUrl = item.url.startsWith('http') ? item.url : normalizeUploadedMediaUrl(item.url);
  const { previewUrl, loading, failed } = useAuthMediaPreview(mediaUrl, { objectId: item.id });
  const kind = mediaKind(item.contentType);
  const typeColor = KIND_COLOR[kind];
  const isTemp = item.storageMode === 'temp';

  const menu: MenuProps['items'] = [
    { key: 'preview', label: '预览', onClick: () => onPreview(item) },
    ...(onMove
      ? [{ key: 'move', label: '移动到文件夹', onClick: () => onMove(item) }]
      : []),
    { type: 'divider' },
    { key: 'delete', label: '删除', danger: true, onClick: () => onDelete(item) },
  ];

  return (
    <div
      className={['asset-card', isSelected ? 'asset-card-selected' : ''].filter(Boolean).join(' ')}
      onClick={() => (selectionMode ? onToggleSelect(item.id) : onPreview(item))}
    >
      {selectionMode ? (
        <div className="asset-card-checkbox" onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={isSelected} onChange={() => onToggleSelect(item.id)} />
        </div>
      ) : null}

      <div className="asset-card-thumb-wrap">
        {previewUrl && !failed ? (
          <img src={previewUrl} alt="" className="asset-card-thumb" />
        ) : (
          <div
            className="asset-card-thumb-placeholder asset-card-thumb-placeholder--rich"
            style={{ background: `${typeColor}18` }}
          >
            {loading ? (
              <MediaLoadingState variant="compact" kind={kind} />
            ) : (
              <>
                <span className="asset-card-placeholder-icon" style={{ color: typeColor }}>
                  {KIND_ICON[kind]}
                </span>
                <span className="asset-card-placeholder-label" style={{ color: typeColor }}>
                  {isTemp ? '临时' : '资产'}
                </span>
              </>
            )}
          </div>
        )}
        <div className="asset-card-thumb-overlay" />
        <div className="asset-card-type-badge" style={{ background: `${typeColor}cc`, color: '#fff' }}>
          {isTemp ? '临时' : '资产'}
        </div>
        <div className="asset-card-more-menu" onClick={(e) => e.stopPropagation()}>
          <Dropdown menu={{ items: menu }} trigger={['click']}>
            <button type="button" className="asset-card-more-btn" aria-label="更多">
              ···
            </button>
          </Dropdown>
        </div>
      </div>

      <div className="asset-card-body">
        <div className="asset-card-title" title={item.originalName || item.id}>
          {item.originalName || item.id.slice(0, 12)}
        </div>
        <div className="asset-card-footer">
          <span
            className="asset-card-status"
            style={{ color: isTemp ? '#f59e0b' : '#10b981' }}
          >
            <span
              className="asset-card-status-dot"
              style={{ background: isTemp ? '#f59e0b' : '#10b981' }}
            />
            {isTemp ? '临时' : '已保存'}
          </span>
          <span className="asset-card-date">
            {new Date(item.createdAt).toLocaleDateString()}
          </span>
        </div>
      </div>
    </div>
  );
}
