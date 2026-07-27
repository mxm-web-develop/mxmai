import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { App, Button, Space, Typography } from 'antd';
import { FolderOpen, Globe, Upload as UploadIcon } from 'lucide-react';
import { useMediaFileUpload } from '../media-source/mediaFileUpload';
import { MediaKnowledgeFolderPickerModal } from '../media-source/MediaKnowledgeFolderPickerModal';
import { UnifiedMediaList } from '../media-source/UnifiedMediaList';
import type { MediaListRow, MediaPickPayload } from '../media-source/types';
import type { StockImageItem } from '../../api/client';
import { ReferenceImageStockPicker } from './ReferenceImageStockPicker';
import type { ReferenceImagesFieldProps } from './referenceImagesUtils';
import { countMediaRows } from './referenceImagesUtils';
import './reference-images.css';
import '../media-source/unified-media-source.css';

export type { ReferenceImagesFieldProps } from './referenceImagesUtils';

function getReferenceImagesDefaultType(fieldName: string, def: Record<string, unknown>): string {
  const items = def.items;
  if (items && typeof items === 'object' && !Array.isArray(items)) {
    const props = (items as Record<string, unknown>).properties;
    if (props && typeof props === 'object' && !Array.isArray(props)) {
      const typeDef = (props as Record<string, unknown>).type;
      if (typeDef && typeof typeDef === 'object' && !Array.isArray(typeDef)) {
        const d = (typeDef as Record<string, unknown>).default;
        if (typeof d === 'string' && d.trim()) return d.trim();
      }
    }
  }
  const lower = fieldName.toLowerCase();
  if (lower.includes('clothing') || lower.includes('outfit') || lower.includes('garment')) return 'outfits';
  return 'main-subject';
}

export function ReferenceImagesField({
  fieldName,
  fieldDef,
  title,
  help,
  rows,
  onChange,
  formTaskId,
  embedded = false,
  acceptVideos = false,
  enableKnowledgeFolder = false,
  maxImageItems,
  maxVideoItems,
  stockSearchDefault = '',
}: ReferenceImagesFieldProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const defaultRefType = getReferenceImagesDefaultType(fieldName, fieldDef);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const [stockOpen, setStockOpen] = useState(false);

  const listRows = rows as MediaListRow[];
  const imageCount = countMediaRows(listRows, 'image');
  const videoCount = countMediaRows(listRows, 'video');

  const canAddMedia = (kind: 'image' | 'video') => {
    if (kind === 'video') return maxVideoItems == null || videoCount < maxVideoItems;
    return maxImageItems == null || imageCount < maxImageItems;
  };

  const mediaLimitHint =
    maxImageItems != null || maxVideoItems != null
      ? t('form.referenceImages.limitHint', {
          images: imageCount,
          maxImages: maxImageItems ?? '∞',
          videos: videoCount,
          maxVideos: maxVideoItems ?? '∞',
        })
      : null;

  const appendPick = (pick: MediaPickPayload) => {
    const kind = pick.mediaKind === 'video' ? 'video' : 'image';
    if (!canAddMedia(kind)) {
      message.warning(
        kind === 'video'
          ? t('form.referenceImages.maxVideos', { max: maxVideoItems ?? 0 })
          : t('form.referenceImages.maxImages', { max: maxImageItems ?? 0 })
      );
      return;
    }
    if (listRows.some((r) => r.content === pick.content)) {
      message.info(t('form.referenceImages.alreadyInList'));
      return;
    }
    onChange([
      ...rows,
      {
        content: pick.content,
        type: defaultRefType,
        purpose: pick.purpose ?? '',
        groupKey: fieldName,
        mediaKind: kind,
        __source: pick.source,
        __sourceLabel: pick.sourceLabel,
      },
    ]);
  };

  const { pickFile, uploading } = useMediaFileUpload({
    acceptVideos,
    formTaskId,
    onPick: appendPick,
  });

  const selectStockImage = (item: StockImageItem) => {
    appendPick({
      content: item.imageUrl,
      mediaKind: 'image',
      source: 'stock',
      sourceLabel: item.title,
      purpose: item.title,
    });
    setStockOpen(false);
  };

  const updatePurpose = (idx: number, purpose: string) => {
    onChange(rows.map((r, i) => (i === idx ? { ...r, purpose } : r)));
  };

  const removeRow = (idx: number) => onChange(rows.filter((_, i) => i !== idx));

  const rootClass = embedded ? 'ref-images--embedded' : 'schema-form__field';

  return (
    <div className={rootClass}>
      {!embedded && title}
      {!embedded && help}

      <div className="ref-images__body">
        <div className="ref-images__actions">
          <Space wrap size={8}>
            <Button
              size="small"
              icon={<UploadIcon size={14} />}
              loading={uploading}
              onClick={pickFile}
            >
              {t('form.referenceImages.localUpload')}
            </Button>
            <Button size="small" icon={<FolderOpen size={14} />} onClick={() => setResourcesOpen(true)}>
              {t('form.referenceImages.myResources')}
            </Button>
            <Button size="small" icon={<Globe size={14} />} onClick={() => setStockOpen(true)}>
              {t('form.referenceImages.freeStock')}
            </Button>
          </Space>
          {mediaLimitHint ? (
            <Typography.Text type="secondary" className="ref-images__actions-meta">
              {mediaLimitHint}
            </Typography.Text>
          ) : null}
        </div>

        <UnifiedMediaList
          rows={listRows}
          embedded={embedded}
          title={t('form.referenceImages.selectedTitle')}
          emptyHint={t('form.referenceImages.emptyHint')}
          showPurpose
          onUpdatePurpose={updatePurpose}
          onRemove={removeRow}
        />

        {!embedded ? (
          <Typography.Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
            {t('form.referenceImages.footerHint')}
          </Typography.Text>
        ) : null}
      </div>

      <MediaKnowledgeFolderPickerModal
        open={resourcesOpen}
        onClose={() => setResourcesOpen(false)}
        accept="visual"
        enableMyUploads
        onPick={appendPick}
      />

      <ReferenceImageStockPicker
        open={stockOpen}
        onClose={() => setStockOpen(false)}
        onSelect={selectStockImage}
        initialQuery={stockSearchDefault}
      />
    </div>
  );
}
