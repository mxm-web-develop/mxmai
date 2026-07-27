import { useCallback, useState } from 'react';
import { App } from 'antd';
import { normalizeUploadedMediaUrl, uploadReferenceImageToR2 } from '../../api/client';
import type { MediaPickPayload } from './types';

export function isAcceptedMediaFile(file: File, acceptVideos: boolean): boolean {
  if (file.type.startsWith('image/')) return true;
  return acceptVideos && file.type.startsWith('video/');
}

export type UploadMediaFileOptions = {
  acceptVideos?: boolean;
  formTaskId?: string;
  storageMode?: 'temp' | 'asset';
  folderId?: string;
};

export async function uploadMediaFile(
  file: File,
  options: UploadMediaFileOptions
): Promise<MediaPickPayload> {
  const { acceptVideos = false, formTaskId, storageMode = 'temp', folderId } = options;
  if (!isAcceptedMediaFile(file, acceptVideos)) {
    throw new Error(acceptVideos ? '仅支持图片或视频文件' : '仅支持图片文件');
  }

  const mediaKind: 'image' | 'video' = file.type.startsWith('video/') ? 'video' : 'image';
  const r2Result = await uploadReferenceImageToR2(file, {
    storageMode,
    folderId: storageMode === 'asset' ? folderId : undefined,
    taskId: storageMode === 'temp' ? formTaskId : undefined,
    purpose: 'reference',
  });
  const content = normalizeUploadedMediaUrl(r2Result.url || '');
  if (!content.trim()) {
    throw new Error('上传成功但缺少可用地址');
  }

  return {
    content,
    mediaKind,
    source: 'upload',
    sourceLabel: file.name,
  };
}

export type UseMediaFileUploadOptions = {
  acceptVideos?: boolean;
  formTaskId?: string;
  onPick: (item: MediaPickPayload) => void;
  successMessage?: string;
};

export function useMediaFileUpload({
  acceptVideos = false,
  formTaskId,
  onPick,
  successMessage = '已加入素材列表',
}: UseMediaFileUploadOptions) {
  const { message } = App.useApp();
  const [uploading, setUploading] = useState(false);

  const pickFile = useCallback(() => {
    if (uploading) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = acceptVideos ? 'image/*,video/mp4,video/quicktime,video/webm' : 'image/*';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      if (!isAcceptedMediaFile(file, acceptVideos)) {
        message.warning(acceptVideos ? '仅支持图片或视频文件' : '仅支持图片文件');
        return;
      }

      setUploading(true);
      void uploadMediaFile(file, { acceptVideos, formTaskId, storageMode: 'temp' })
        .then((payload) => {
          onPick(payload);
          if (successMessage) message.success(successMessage);
        })
        .catch((err) => {
          message.error(`上传失败：${err instanceof Error ? err.message : String(err)}`);
        })
        .finally(() => {
          setUploading(false);
        });
    };
    input.click();
  }, [acceptVideos, formTaskId, message, onPick, successMessage, uploading]);

  return { pickFile, uploading };
}
