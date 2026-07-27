import { useEffect, useState } from 'react';
import { Button, Input } from 'antd';
import { Plus, Trash2 } from 'lucide-react';
import BrandLoading from '../BrandLoading';
import { useAuthMediaPreview } from '../../hooks/useAuthMediaPreview';
import { mediaSourceLabel } from './sourceLabels';
import type { MediaListRow, MediaSourceOrigin } from './types';
import { rowHasContent, rowMediaKind } from './types';
import './unified-media-source.css';

function badgeClass(source?: MediaSourceOrigin): string {
  const base = 'unified-media-source__badge';
  if (!source) return base;
  return `${base} unified-media-source__badge--${source}`;
}

function MediaListItem({
  row,
  idx,
  showPurpose,
  onUpdatePurpose,
  onRemove,
}: {
  row: MediaListRow;
  idx: number;
  showPurpose?: boolean;
  onUpdatePurpose?: (idx: number, purpose: string) => void;
  onRemove: (idx: number) => void;
}) {
  const content = typeof row.content === 'string' ? row.content : '';
  const purpose = typeof row.purpose === 'string' ? row.purpose : '';
  const sourceLabel = typeof row.__sourceLabel === 'string' ? row.__sourceLabel : undefined;
  const isVideo = rowMediaKind(row) === 'video';
  const uploading = row.__uploading === true;
  const localPreview = typeof row.__localPreview === 'string' ? row.__localPreview : '';
  const [imgError, setImgError] = useState(false);

  const { previewUrl, loading, failed } = useAuthMediaPreview(uploading ? '' : content);
  const displayUrl = uploading ? localPreview : previewUrl || localPreview;

  useEffect(() => {
    setImgError(false);
  }, [content, displayUrl]);

  return (
    <li className="unified-media-source__item">
      <div className="unified-media-source__thumb">
        {displayUrl && !imgError && !failed ? (
          isVideo ? (
            <video src={displayUrl} muted playsInline preload="metadata" />
          ) : (
            <img src={displayUrl} alt="" onError={() => setImgError(true)} />
          )
        ) : !uploading && !loading ? (
          <div className="unified-media-source__thumb-loading">
            <span style={{ fontSize: 10, color: '#94a3b8' }}>失效</span>
          </div>
        ) : null}
        {(uploading || loading) && !displayUrl ? (
          <div className="unified-media-source__thumb-loading">
            <BrandLoading size="small" />
          </div>
        ) : null}
      </div>

      <div className="unified-media-source__body">
        <div className="unified-media-source__row">
          <span className={badgeClass(row.__source)}>
            {mediaSourceLabel(row.__source, sourceLabel)}
          </span>
          <span className="unified-media-source__label">
            {isVideo ? '视频' : '图片'} #{idx + 1}
          </span>
        </div>
        {showPurpose && onUpdatePurpose ? (
          <Input
            size="small"
            value={purpose}
            placeholder="用途描述（可选）"
            disabled={uploading}
            onChange={(e) => onUpdatePurpose(idx, e.target.value)}
          />
        ) : sourceLabel && !showPurpose ? (
          <span className="unified-media-source__label">{sourceLabel}</span>
        ) : null}
      </div>

      <div className="unified-media-source__actions">
        <Button
          type="text"
          size="small"
          danger
          icon={<Trash2 size={14} />}
          aria-label="移除"
          disabled={uploading}
          onClick={() => onRemove(idx)}
        />
      </div>
    </li>
  );
}

export type UnifiedMediaListProps = {
  rows: MediaListRow[];
  embedded?: boolean;
  title?: string;
  limitHint?: string | null;
  emptyHint?: string;
  showPurpose?: boolean;
  maxItems?: number;
  showAddButton?: boolean;
  addLabel?: string;
  onAddClick?: () => void;
  onUpdatePurpose?: (idx: number, purpose: string) => void;
  onRemove: (idx: number) => void;
};

export function UnifiedMediaList({
  rows,
  embedded = false,
  title = '已选素材',
  limitHint,
  emptyHint = '从下方添加本地上传、资产、知识库或免费图库素材',
  showPurpose = false,
  maxItems,
  showAddButton = false,
  addLabel = '添加素材',
  onAddClick,
  onUpdatePurpose,
  onRemove,
}: UnifiedMediaListProps) {
  const filledRows = rows
    .map((row, idx) => ({ row, idx }))
    .filter(({ row }) => rowHasContent(row) || row.__uploading === true);

  const canAdd = maxItems == null || filledRows.length < maxItems;

  return (
    <div className={`unified-media-source${embedded ? ' unified-media-source--embedded' : ''}`}>
      <div className="unified-media-source__head">
        <span className="unified-media-source__title">{title}</span>
        {limitHint ? <span className="unified-media-source__meta">{limitHint}</span> : null}
      </div>

      {filledRows.length === 0 ? (
        <div className="unified-media-source__empty">{emptyHint}</div>
      ) : (
        <ul className="unified-media-source__list">
          {filledRows.map(({ row, idx }) => (
            <MediaListItem
              key={`${idx}-${typeof row.content === 'string' ? row.content : 'pending'}`}
              row={row}
              idx={idx}
              showPurpose={showPurpose}
              onUpdatePurpose={onUpdatePurpose}
              onRemove={onRemove}
            />
          ))}
        </ul>
      )}

      {showAddButton && canAdd && onAddClick ? (
        <div className="unified-media-source__add-bar">
          <Button
            type="dashed"
            size="small"
            className="unified-media-source__add-btn"
            icon={<Plus size={14} />}
            onClick={onAddClick}
          >
            {addLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
