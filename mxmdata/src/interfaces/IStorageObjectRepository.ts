/**
 * 平台 storage_objects 元数据仓库接口
 */

import type { StorageDomain } from '../storage/StorageDomain';
import type { StorageProvider } from '../storage/StorageProvider';

export type StorageObjectMode = 'asset' | 'temp';

export type StorageUploadSource = 'self' | 'partner' | 'all';

export interface StorageObjectRecord {
  id: string;
  user_id: string | null;
  domain: StorageDomain;
  provider: StorageProvider;
  bucket: string;
  object_key: string;
  purpose: string;
  storage_mode: StorageObjectMode;
  folder_id: string | null;
  partner_app_id: string | null;
  partner_end_user_id: string | null;
  content_type: string | null;
  size_bytes: number | null;
  original_name: string | null;
  metadata: Record<string, unknown>;
  expires_at: string | null;
  deleted_at: string | null;
  created_at: string;
}

export interface CreateStorageObjectDto {
  user_id?: string | null;
  domain: StorageDomain;
  provider: StorageProvider;
  bucket: string;
  object_key: string;
  purpose: string;
  storage_mode?: StorageObjectMode;
  folder_id?: string | null;
  partner_app_id?: string | null;
  partner_end_user_id?: string | null;
  content_type?: string | null;
  size_bytes?: number | null;
  original_name?: string | null;
  metadata?: Record<string, unknown>;
  expires_at?: string | null;
}

export interface ListStorageObjectsByUserOptions {
  domain?: StorageDomain;
  purpose?: string;
  storageMode?: StorageObjectMode;
  /** Omit = no folder filter; null = root only (folder_id IS NULL) */
  folderId?: string | null;
  /** Default self — excludes Partner uploads from publisher personal lists */
  uploadSource?: StorageUploadSource;
  partnerAppId?: string;
  partnerEndUserId?: string;
  limit?: number;
  offset?: number;
}

export interface ListStorageObjectsByPartnerEndUserOptions {
  storageMode?: StorageObjectMode;
  limit?: number;
  offset?: number;
}

export interface IStorageObjectRepository {
  findById(id: string): Promise<StorageObjectRecord | null>;
  findByIdForUser(id: string, userId: string): Promise<StorageObjectRecord | null>;
  findByIdForPartnerEndUser(
    id: string,
    partnerAppId: string,
    endUserId: string
  ): Promise<StorageObjectRecord | null>;
  listByUser(
    userId: string,
    options?: ListStorageObjectsByUserOptions
  ): Promise<{ items: StorageObjectRecord[]; total: number }>;
  listByPartnerEndUser(
    partnerAppId: string,
    endUserId: string,
    options?: ListStorageObjectsByPartnerEndUserOptions
  ): Promise<{ items: StorageObjectRecord[]; total: number }>;
  listByTempForTaskId(
    userId: string,
    taskId: string
  ): Promise<StorageObjectRecord[]>;
  listExpiredSoftDeletable(limit?: number): Promise<StorageObjectRecord[]>;
  listPurgedCandidates(limit?: number): Promise<StorageObjectRecord[]>;
  markPurged(id: string): Promise<void>;
  listSystem(
    options?: { purpose?: string; limit?: number; offset?: number }
  ): Promise<{ items: StorageObjectRecord[]; total: number }>;
  create(dto: CreateStorageObjectDto): Promise<StorageObjectRecord>;
  /** 资产中心：仅更新逻辑目录，不修改 object_key */
  updateFolderId(id: string, userId: string, folderId: string | null): Promise<void>;
  softDelete(id: string, userId?: string | null): Promise<void>;
}
