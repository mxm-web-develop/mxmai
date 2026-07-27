/**
 * 克隆音色登记到 storage_objects + 虚拟文件夹软链，供角色管理与表单引用。
 */

import { RepositoryFactory } from '@mxmai/mxmdata';
import type { MinimaxVoiceItem } from './maxplan-voice-service';
import { uploadUserBlob } from '../../storage/user-upload-service';

export const MINIMAX_VOICE_ASSET_TYPE = 'minimax_voice';

export type MinimaxVoiceAssetMetadata = {
  asset_type: typeof MINIMAX_VOICE_ASSET_TYPE;
  voice_id: string;
  label: string;
  mode: 'clone';
  model: string;
  demo_audio?: string;
};

export type RegisterClonedVoiceAssetParams = {
  userId: string;
  virtualFolderId?: string;
  voiceId: string;
  label: string;
  model: string;
  demoAudio?: string;
  sourceBuffer: Buffer;
  sourceFilename: string;
  sourceMimeType?: string;
};

export type RegisterClonedVoiceAssetResult = {
  storageObjectId: string;
  virtualFolderId?: string;
};

async function assertVirtualFolderForUser(userId: string, folderId: string): Promise<void> {
  const folderRepo = RepositoryFactory.createFolderRepository();
  const folder = await folderRepo.getFolderById(folderId);
  if (!folder || folder.user_id !== userId) {
    throw new Error('虚拟文件夹不存在或无权限');
  }
  if (folder.folder_kind !== 'virtual') {
    throw new Error('仅支持虚拟文件夹保存克隆音色');
  }
}

function isMinimaxVoiceMetadata(meta: Record<string, unknown> | null | undefined): meta is MinimaxVoiceAssetMetadata {
  return meta?.asset_type === MINIMAX_VOICE_ASSET_TYPE && typeof meta.voice_id === 'string' && meta.voice_id.trim() !== '';
}

/** 克隆成功后：上传源音频 + 写入 metadata，并可选挂到虚拟文件夹 */
export async function registerClonedVoiceAsset(
  params: RegisterClonedVoiceAssetParams,
): Promise<RegisterClonedVoiceAssetResult> {
  const label = params.label.trim() || params.voiceId;

  const uploaded = await uploadUserBlob({
    userId: params.userId,
    purpose: 'custom',
    storageMode: 'asset',
    buffer: params.sourceBuffer,
    contentType: params.sourceMimeType || 'application/octet-stream',
    originalName: params.sourceFilename,
    metadata: {
      asset_type: MINIMAX_VOICE_ASSET_TYPE,
      voice_id: params.voiceId,
      label,
      mode: 'clone',
      model: params.model,
      ...(params.demoAudio ? { demo_audio: params.demoAudio } : {}),
    },
    tag: 'minimax_voice',
  });

  return {
    storageObjectId: uploaded.objectId,
    virtualFolderId: linkedFolderId,
  };
}

/** 从虚拟文件夹软链中筛选 minimax_voice 资产 */
export async function listVoiceAssetsFromVirtualFolder(
  userId: string,
  folderId: string,
): Promise<MinimaxVoiceItem[]> {
  await assertVirtualFolderForUser(userId, folderId);

  const folderRepo = RepositoryFactory.createFolderRepository();
  const storageRepo = RepositoryFactory.createStorageObjectRepository();
  const items = await folderRepo.getFolderItems(folderId, { limit: 500 });
  const objectIds = items.map((i) => i.storage_object_id).filter((id): id is string => !!id);
  if (objectIds.length === 0) return [];

  const voices: MinimaxVoiceItem[] = [];
  for (const objectId of objectIds) {
    const obj = await storageRepo.findByIdForUser(objectId, userId);
    if (!obj || obj.deleted_at) continue;
    const meta = obj.metadata as Record<string, unknown>;
    if (!isMinimaxVoiceMetadata(meta)) continue;
    voices.push({
      voice_id: meta.voice_id,
      voice_name: meta.label || meta.voice_id,
      description: [],
      created_time: obj.created_at,
      source: 'voice_cloning',
    });
  }

  return voices.sort((a, b) => (b.created_time ?? '').localeCompare(a.created_time ?? ''));
}
