import { useMemo, useState } from 'react';
import { App, Button, Space } from 'antd';
import { FolderTree, Globe, Images, Upload as UploadIcon } from 'lucide-react';
import { MediaLibraryPickerModal } from '../media-source/MediaLibraryPickerModal';
import { useMediaFileUpload } from '../media-source/mediaFileUpload';
import { MediaVirtualFolderPickerModal } from '../media-source/MediaVirtualFolderPickerModal';
import { UnifiedMediaList } from '../media-source/UnifiedMediaList';
import type { MediaListRow, MediaPickPayload } from '../media-source/types';
import { StockMediaPickerModal, type StockMediaPick } from './StockMediaPickerModal';
import '../media-source/unified-media-source.css';

export type ClipStaticMediaSourceFieldProps = {
  imageUrl?: string;
  videoUrl?: string;
  assetId?: string;
  stockSearchDefault?: string;
  onChange: (patch: {
    mxmSourceImageUrl?: string;
    mxmSourceVideoUrl?: string;
    mxmSourceAssetId?: string;
    mxmAutoStockImage?: boolean;
    mxmAutoStockVideo?: boolean;
    mxmUserEdited?: boolean;
  }) => void;
};

function toListRow(
  url: string,
  kind: 'image' | 'video',
  source?: MediaListRow['__source'],
  sourceLabel?: string
): MediaListRow {
  return {
    content: url,
    mediaKind: kind,
    __source: source,
    __sourceLabel: sourceLabel,
  };
}

export function ClipStaticMediaSourceField({
  imageUrl,
  videoUrl,
  assetId,
  stockSearchDefault = '',
  onChange,
}: ClipStaticMediaSourceFieldProps) {
  const { message } = App.useApp();
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [virtualOpen, setVirtualOpen] = useState(false);
  const [stockOpen, setStockOpen] = useState(false);
  const [stockTab, setStockTab] = useState<'image' | 'video'>('image');

  const activeUrl = videoUrl?.trim() || imageUrl?.trim() || '';
  const activeKind: 'image' | 'video' = videoUrl?.trim() ? 'video' : 'image';

  const rows = useMemo((): MediaListRow[] => {
    if (!activeUrl) return [];
    return [toListRow(activeUrl, activeKind, assetId ? 'asset' : undefined)];
  }, [activeUrl, activeKind, assetId]);

  const applyPick = (pick: MediaPickPayload | StockMediaPick) => {
    const kind = 'mediaKind' in pick ? pick.mediaKind : pick.kind;
    const url = 'content' in pick ? pick.content : pick.url;
    onChange({
      mxmSourceImageUrl: kind === 'image' ? url : undefined,
      mxmSourceVideoUrl: kind === 'video' ? url : undefined,
      mxmSourceAssetId: undefined,
      mxmAutoStockImage: false,
      mxmAutoStockVideo: false,
      mxmUserEdited: true,
    });
    message.success(`已选用${kind === 'video' ? '视频' : '图片'}素材`);
  };

  const { pickFile, uploading } = useMediaFileUpload({
    acceptVideos: true,
    onPick: applyPick,
    successMessage: '',
  });

  const clearMedia = () => {
    onChange({
      mxmSourceImageUrl: undefined,
      mxmSourceVideoUrl: undefined,
      mxmSourceAssetId: undefined,
      mxmUserEdited: true,
    });
  };

  const openStock = (tab: 'image' | 'video') => {
    setStockTab(tab);
    setStockOpen(true);
  };

  return (
    <div className="unified-media-source unified-media-source--embedded">
      <div className="ref-images__actions">
        <Space wrap size={8}>
          <Button size="small" icon={<UploadIcon size={14} />} loading={uploading} onClick={pickFile}>
            本地上传
          </Button>
          <Button size="small" icon={<Images size={14} />} onClick={() => setLibraryOpen(true)}>
            我的资产
          </Button>
          <Button size="small" icon={<FolderTree size={14} />} onClick={() => setVirtualOpen(true)}>
            虚拟文件夹
          </Button>
          <Button size="small" icon={<Globe size={14} />} onClick={() => openStock('image')}>
            免费图库
          </Button>
          <Button size="small" icon={<Globe size={14} />} onClick={() => openStock('video')}>
            免费视频库
          </Button>
        </Space>
      </div>

      <UnifiedMediaList
        rows={rows}
        embedded
        title="片段素材"
        maxItems={1}
        emptyHint="未选手动素材时将按检索词自动匹配；也可从上方添加"
        onRemove={() => clearMedia()}
      />

      <MediaLibraryPickerModal
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        acceptVideos
        onPick={(pick) => applyPick(pick)}
      />

      <MediaVirtualFolderPickerModal
        open={virtualOpen}
        onClose={() => setVirtualOpen(false)}
        onPick={(pick) => applyPick(pick)}
      />

      <StockMediaPickerModal
        open={stockOpen}
        onClose={() => setStockOpen(false)}
        onSelect={applyPick}
        initialQuery={stockSearchDefault}
        defaultTab={stockTab}
      />
    </div>
  );
}
