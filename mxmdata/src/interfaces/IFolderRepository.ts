/**
 * 文件夹数据仓库接口
 * 提供用户文件夹和文件关联管理功能
 */

export type FolderKind = 'upload' | 'virtual';

export type FolderIndexStatus = 'none' | 'indexing' | 'indexed' | 'stale';

export type FolderCardTag = 'style' | 'character' | 'knowledge' | 'writing';

export type FolderCardStatus = 'idle' | 'parsing' | 'ready' | 'stale' | 'failed';

export type FolderAssetRole =
  | 'style_ref'
  | 'palette'
  | 'appearance'
  | 'description'
  | 'voice'
  | 'doc'
  | 'unknown';

export type FolderItemRefType = 'task' | 'storage_object';

export type FolderIndexEntryStatus = 'pending' | 'indexed' | 'failed' | 'skipped';

export interface Folder {
  id: string;
  user_id: string;
  name: string;
  parent_id: string | null;
  folder_kind: FolderKind;
  index_status?: FolderIndexStatus | null;
  indexed_at?: string | null;
  knowledge_base_id?: string | null;
  index_error?: string | null;
  card_tag?: FolderCardTag | null;
  card_status?: FolderCardStatus;
  card_summary?: Record<string, unknown> | null;
  is_system?: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateFolderDto {
  name: string;
  parent_id?: string | null;
  folder_kind?: FolderKind;
  card_tag?: FolderCardTag | null;
  is_system?: boolean;
}

export interface UpdateFolderDto {
  name?: string;
  card_tag?: FolderCardTag | null;
}

export interface FolderItem {
  id: string;
  folder_id: string;
  task_id: string | null;
  storage_object_id: string | null;
  asset_role?: FolderAssetRole | null;
  created_at: string;
}

export interface FolderQueryOptions {
  parent_id?: string | null;
  folder_kind?: FolderKind;
  card_tag?: FolderCardTag | null;
  include_system?: boolean;
  limit?: number;
  offset?: number;
}

export interface FolderItemsQueryOptions {
  limit?: number;
  offset?: number;
}

export interface FolderIndexEntry {
  id: string;
  folder_id: string;
  ref_type: FolderItemRefType;
  ref_id: string;
  content_hash: string | null;
  status: FolderIndexEntryStatus;
  chunk_count: number;
  indexed_at: string | null;
  error_message: string | null;
  analysis?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface UpdateFolderIndexDto {
  index_status?: FolderIndexStatus;
  indexed_at?: string | null;
  knowledge_base_id?: string | null;
  index_error?: string | null;
  card_status?: FolderCardStatus;
  card_summary?: Record<string, unknown> | null;
}

export interface UpsertFolderIndexEntryDto {
  ref_type: FolderItemRefType;
  ref_id: string;
  content_hash?: string | null;
  status: FolderIndexEntryStatus;
  chunk_count?: number;
  indexed_at?: string | null;
  error_message?: string | null;
  analysis?: Record<string, unknown> | null;
}

/**
 * 文件夹数据仓库接口
 */
export interface IFolderRepository {
  getFolders(userId: string, options?: FolderQueryOptions): Promise<Folder[]>;

  /** 系统共享卡（is_system=true），不按 user_id 过滤 */
  getSystemFolders(options?: { card_tag?: FolderCardTag | null }): Promise<Folder[]>;

  getFolderById(folderId: string): Promise<Folder | null>;

  createFolder(userId: string, data: CreateFolderDto): Promise<Folder>;

  updateFolder(userId: string, folderId: string, data: UpdateFolderDto): Promise<Folder>;

  deleteFolder(userId: string, folderId: string): Promise<void>;

  updateFolderIndex(userId: string, folderId: string, data: UpdateFolderIndexDto): Promise<Folder>;

  /** @deprecated 使用 getFolderItems */
  getFolderItemIds(folderId: string, options?: FolderItemsQueryOptions): Promise<string[]>;

  getFolderItems(folderId: string, options?: FolderItemsQueryOptions): Promise<FolderItem[]>;

  getFolderItemCount(folderId: string): Promise<number>;

  addItemToFolder(folderId: string, taskId: string): Promise<void>;

  addStorageObjectToFolder(folderId: string, storageObjectId: string): Promise<void>;

  removeItemFromFolder(folderId: string, taskId: string): Promise<void>;

  removeStorageObjectFromFolder(folderId: string, storageObjectId: string): Promise<void>;

  updateFolderItemAssetRole(
    folderId: string,
    itemId: string,
    assetRole: FolderAssetRole
  ): Promise<FolderItem>;

  getItemFolders(taskId: string, folderKind?: FolderKind): Promise<Folder[]>;

  getStorageObjectVirtualFolders(storageObjectId: string): Promise<Folder[]>;

  getFolderPath(folderId: string): Promise<Folder[]>;

  markFolderStaleIfIndexed(folderId: string): Promise<void>;

  getFolderIndexEntries(folderId: string): Promise<FolderIndexEntry[]>;

  upsertFolderIndexEntry(folderId: string, data: UpsertFolderIndexEntryDto): Promise<FolderIndexEntry>;

  deleteFolderIndexEntriesNotIn(
    folderId: string,
    refs: Array<{ ref_type: FolderItemRefType; ref_id: string }>
  ): Promise<void>;
}
