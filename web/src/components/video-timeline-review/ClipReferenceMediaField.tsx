import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Typography } from 'antd';
import { ReferenceImagesField } from '../schema-form/ReferenceImagesField';
import type { MxmReferenceAsset } from './referenceAssetUtils';
import {
  SEEDANCE_MAX_REFERENCE_IMAGES,
  SEEDANCE_MAX_REFERENCE_VIDEOS,
} from './referenceAssetUtils';

type RefRow = Record<string, unknown>;

export type ClipReferenceMediaFieldProps = {
  assets: MxmReferenceAsset[];
  taskId?: string;
  onChange: (next: MxmReferenceAsset[]) => void;
};

function assetsToRows(assets: MxmReferenceAsset[]): RefRow[] {
  return assets.map((a) => ({
    content: a.content,
    purpose: a.purpose ?? '',
    type: a.type ?? 'main-subject',
    mediaKind: a.mediaKind ?? 'image',
  }));
}

function rowsToAssets(rows: RefRow[]): MxmReferenceAsset[] {
  return rows
    .filter((r) => typeof r.content === 'string' && r.content.trim())
    .map((r) => ({
      content: String(r.content).trim(),
      purpose: typeof r.purpose === 'string' && r.purpose.trim() ? r.purpose.trim() : undefined,
      type: typeof r.type === 'string' ? r.type : 'main-subject',
      mediaKind: r.mediaKind === 'video' ? 'video' : 'image',
    }));
}

export function ClipReferenceMediaField({ assets, taskId, onChange }: ClipReferenceMediaFieldProps) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<RefRow[]>(() => assetsToRows(assets));

  useEffect(() => {
    setRows(assetsToRows(assets));
  }, [assets]);

  const fieldDef = useMemo(() => ({ items: { properties: { type: { default: 'main-subject' } } } }), []);

  return (
    <div className="video-timeline-review__ref-media-field">
      <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
        {t('video.reference.seedanceHint', {
          maxImages: SEEDANCE_MAX_REFERENCE_IMAGES,
          maxVideos: SEEDANCE_MAX_REFERENCE_VIDEOS,
        })}
      </Typography.Text>
      <ReferenceImagesField
        fieldName="mxmReferenceAssets"
        fieldDef={fieldDef}
        title={null}
        help={null}
        rows={rows}
        onChange={(next) => {
          setRows(next);
          onChange(rowsToAssets(next));
        }}
        formTaskId={taskId}
        embedded
        acceptVideos
        enableKnowledgeFolder
        maxImageItems={SEEDANCE_MAX_REFERENCE_IMAGES}
        maxVideoItems={SEEDANCE_MAX_REFERENCE_VIDEOS}
      />
    </div>
  );
}
