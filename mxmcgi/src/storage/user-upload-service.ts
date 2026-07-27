import {
  RepositoryFactory,
  resolveFolderPathSegmentForUser,
  FolderPathNotFoundError,
  FolderPathForbiddenError,
  userTempTtlMs,
} from '@mxmai/mxmdata';
import type { StorageObjectMode } from '@mxmai/mxmdata';
import { resolveStorageObjectAccessUrl, resolveUserUploadAccessUrl } from './user-upload-url';

export interface UserUploadResult {
  objectId: string;
  url: string;
  key: string;
  bucket: string;
  provider: string;
  storageMode: StorageObjectMode;
  folderId: string | null;
}

export type UserUploadPurpose = 'reference' | 'character' | 'knowledge' | 'temp' | 'custom';

export interface UploadUserBlobParams {
  userId: string;
  purpose: UserUploadPurpose;
  buffer: Buffer;
  contentType: string;
  storageMode?: StorageObjectMode;
  folderId?: string;
  taskId?: string;
  originalName?: string;
  metadata?: Record<string, unknown>;
  tag?: string;
  partnerAppId?: string;
  partnerEndUserId?: string;
  /** 仅 temp：自定义过期毫秒数；默认走 userTempTtlMs()（7 天） */
  expiresInMs?: number;
}

export { FolderPathNotFoundError, FolderPathForbiddenError };

export class PartnerUploadForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PartnerUploadForbiddenError';
  }
}

function resolveStorageMode(params: UploadUserBlobParams): StorageObjectMode {
  if (params.partnerAppId && params.partnerEndUserId) return 'temp';
  if (params.storageMode) return params.storageMode;
  if (params.purpose === 'temp') return 'temp';
  return 'asset';
}

export async function uploadUserBlob(params: UploadUserBlobParams): Promise<UserUploadResult> {
  const isPartnerUpload = Boolean(params.partnerAppId && params.partnerEndUserId);
  const storageMode = resolveStorageMode(params);
  const storage = RepositoryFactory.getStorageService();

  let folderPath = '_';
  let folderId: string | null = null;
  if (storageMode === 'asset' && !isPartnerUpload) {
    if (params.folderId) {
      folderPath = await resolveFolderPathSegmentForUser(params.userId, params.folderId);
      folderId = params.folderId;
    }
  }

  const uploadPurpose = storageMode === 'temp' ? 'temp' : params.purpose;
  const stored = await storage.upload({
    domain: 'user_upload',
    purpose: uploadPurpose,
    userId: params.userId,
    buffer: params.buffer,
    contentType: params.contentType,
    pathVars: storageMode === 'asset' ? { folderPath } : undefined,
    metadata: {
      ...params.metadata,
      ...(params.originalName ? { originalName: params.originalName } : {}),
      ...(params.tag ? { tag: params.tag } : {}),
      ...(storageMode === 'temp' && params.taskId ? { tempForTaskId: params.taskId } : {}),
    },
  });

  const expiresAt =
    storageMode === 'temp'
      ? new Date(
          Date.now() +
            (typeof params.expiresInMs === 'number' &&
            Number.isFinite(params.expiresInMs) &&
            params.expiresInMs > 0
              ? params.expiresInMs
              : userTempTtlMs())
        ).toISOString()
      : null;

  const meta: Record<string, unknown> = {
    ...(params.metadata ?? {}),
    ...(params.tag ? { tag: params.tag } : {}),
    ...(storageMode === 'temp' && params.taskId ? { tempForTaskId: params.taskId } : {}),
  };

  const record = await RepositoryFactory.createStorageObjectRepository().create({
    user_id: params.userId,
    domain: 'user_upload',
    provider: stored.provider,
    bucket: stored.bucket,
    object_key: stored.key,
    purpose: params.purpose === 'temp' ? 'reference' : params.purpose,
    storage_mode: storageMode,
    folder_id: folderId,
    partner_app_id: isPartnerUpload ? params.partnerAppId : null,
    partner_end_user_id: isPartnerUpload ? params.partnerEndUserId : null,
    content_type: params.contentType,
    size_bytes: stored.size,
    original_name: params.originalName ?? null,
    metadata: meta,
    expires_at: expiresAt,
  });

  return {
    objectId: record.id,
    url: await resolveUserUploadAccessUrl({
      objectId: record.id,
      bucket: stored.bucket,
      key: stored.key,
      provider: stored.provider,
    }),
    key: stored.key,
    bucket: stored.bucket,
    provider: stored.provider,
    storageMode,
    folderId,
  };
}

export async function deleteUserStorageObject(userId: string, objectId: string): Promise<void> {
  const repo = RepositoryFactory.createStorageObjectRepository();
  const record = await repo.findByIdForUser(objectId, userId);
  if (!record) {
    throw new UserStorageObjectNotFoundError();
  }
  const storage = RepositoryFactory.getStorageService();
  // 物理删除失败不阻断软删：本地库可能残留生产 R2 记录、或缺 R2_* 凭据导致 Invalid URL
  try {
    await storage.delete({
      domain: record.domain,
      provider: record.provider,
      bucket: record.bucket,
      key: record.object_key,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[deleteUserStorageObject] object store delete failed (continuing soft-delete) id=${objectId} provider=${record.provider} bucket=${record.bucket}: ${msg}`
    );
  }
  await repo.softDelete(objectId, userId);

  if (record.partner_app_id) {
    try {
      const partnerRepo = RepositoryFactory.createPartnerRepository();
      await partnerRepo.appendAuditLog({
        partnerAppId: record.partner_app_id,
        action: 'upload_delete',
        actorUserId: userId,
        endUserId: record.partner_end_user_id ?? undefined,
        detail: { objectId },
      });
    } catch (err) {
      console.warn('[deleteUserStorageObject] partner audit log failed', err);
    }
  }
}

export async function deletePartnerEndUserStorageObject(
  partnerAppId: string,
  endUserId: string,
  objectId: string
): Promise<void> {
  const repo = RepositoryFactory.createStorageObjectRepository();
  const record = await repo.findByIdForPartnerEndUser(objectId, partnerAppId, endUserId);
  if (!record || !record.user_id) {
    throw new UserStorageObjectNotFoundError();
  }
  const storage = RepositoryFactory.getStorageService();
  try {
    await storage.delete({
      domain: record.domain,
      provider: record.provider,
      bucket: record.bucket,
      key: record.object_key,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[deletePartnerEndUserStorageObject] object store delete failed (continuing soft-delete) id=${objectId} provider=${record.provider}: ${msg}`
    );
  }
  await repo.softDelete(objectId, record.user_id);
}

export class UserStorageObjectNotFoundError extends Error {
  constructor() {
    super('Storage object not found');
    this.name = 'UserStorageObjectNotFoundError';
  }
}

/** 移动资产到逻辑文件夹（仅更新 folder_id，不搬迁 R2 对象） */
export async function moveUserStorageObjects(
  userId: string,
  objectIds: string[],
  folderId: string | null
): Promise<number> {
  if (!objectIds.length) return 0;
  if (folderId) {
    await resolveFolderPathSegmentForUser(userId, folderId);
  }
  const repo = RepositoryFactory.createStorageObjectRepository();
  let moved = 0;
  let blockedPartner = 0;
  for (const id of objectIds) {
    const record = await repo.findByIdForUser(id, userId);
    if (!record || record.domain !== 'user_upload' || record.storage_mode !== 'asset') {
      continue;
    }
    if (record.partner_app_id) {
      blockedPartner += 1;
      continue;
    }
    await repo.updateFolderId(id, userId, folderId);
    moved += 1;
  }
  if (blockedPartner > 0 && moved === 0) {
    throw new PartnerUploadForbiddenError('应用用户上传不可移动到资产文件夹');
  }
  if (moved === 0) {
    throw new UserStorageObjectNotFoundError();
  }
  return moved;
}
