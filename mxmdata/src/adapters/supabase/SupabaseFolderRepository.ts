/**
 * Supabase 文件夹数据仓库实现
 */

import { SupabaseClient } from '@supabase/supabase-js';
import type {
  IFolderRepository,
  Folder,
  CreateFolderDto,
  UpdateFolderDto,
  FolderQueryOptions,
  FolderItemsQueryOptions,
  FolderItem,
  FolderKind,
  FolderCardTag,
  FolderAssetRole,
  UpdateFolderIndexDto,
  FolderIndexEntry,
  UpsertFolderIndexEntryDto,
  FolderItemRefType,
} from '../../interfaces/IFolderRepository';
import { NotFoundError, DuplicateError, DataAccessError } from '../../interfaces/errors';
import { getSupabaseClient } from './SupabaseClient';

export class SupabaseFolderRepository implements IFolderRepository {
  private client: SupabaseClient;

  constructor(client?: SupabaseClient) {
    this.client = client || getSupabaseClient();
  }

  async getFolders(userId: string, options?: FolderQueryOptions): Promise<Folder[]> {
    try {
      let query = this.client
        .from('folders')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (options?.folder_kind) {
        query = query.eq('folder_kind', options.folder_kind);
      }

      if (options?.card_tag !== undefined) {
        if (options.card_tag === null) {
          query = query.is('card_tag', null);
        } else {
          query = query.eq('card_tag', options.card_tag);
        }
      }

      if (options?.parent_id !== undefined) {
        if (options.parent_id === null) {
          query = query.is('parent_id', null);
        } else {
          query = query.eq('parent_id', options.parent_id);
        }
      }

      if (options?.limit) {
        query = query.limit(options.limit);
      }

      if (options?.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 100) - 1);
      }

      const { data, error } = await query;

      if (error) {
        if (this.isTableMissingError(error)) {
          console.warn('[文件夹] 表不存在，返回空数组:', error.message);
          return [];
        }
        throw new DataAccessError(`Failed to get folders: ${error.message}`, 'QUERY_ERROR', error);
      }

      return (data || []).map(this.mapToFolder);
    } catch (error) {
      if (error instanceof DataAccessError) throw error;
      throw new DataAccessError(`Unexpected error getting folders: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async getFolderById(folderId: string): Promise<Folder | null> {
    try {
      const { data, error } = await this.client
        .from('folders')
        .select('*')
        .eq('id', folderId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        if (this.isTableMissingError(error)) return null;
        throw new DataAccessError(`Failed to get folder by id: ${error.message}`, 'QUERY_ERROR', error);
      }

      return data ? this.mapToFolder(data) : null;
    } catch (error) {
      if (error instanceof DataAccessError) throw error;
      throw new DataAccessError(`Unexpected error getting folder by id: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async createFolder(userId: string, data: CreateFolderDto): Promise<Folder> {
    try {
      const folderKind = data.folder_kind ?? 'upload';
      const { data: folderData, error } = await this.client
        .from('folders')
        .insert({
          user_id: userId,
          name: data.name,
          parent_id: data.parent_id || null,
          folder_kind: folderKind,
          index_status: folderKind === 'virtual' ? 'none' : null,
          card_tag: data.card_tag ?? null,
          card_status: data.card_tag ? 'idle' : 'idle',
          card_summary: {},
          is_system: data.is_system === true,
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new DuplicateError('Folder', 'name', data.name);
        }
        throw new DataAccessError(`Failed to create folder: ${error.message}`, 'CREATE_ERROR', error);
      }

      if (!folderData) {
        throw new DataAccessError('Failed to create folder: no data returned', 'CREATE_ERROR');
      }

      return this.mapToFolder(folderData);
    } catch (error) {
      if (error instanceof DuplicateError || error instanceof DataAccessError) throw error;
      throw new DataAccessError(`Unexpected error creating folder: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async updateFolder(userId: string, folderId: string, data: UpdateFolderDto): Promise<Folder> {
    try {
      const existing = await this.getFolderById(folderId);
      if (!existing) throw new NotFoundError('Folder', folderId);
      if (existing.user_id !== userId) {
        throw new DataAccessError('Folder does not belong to user', 'PERMISSION_ERROR');
      }

      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (data.name !== undefined) patch.name = data.name;
      if (data.card_tag !== undefined) {
        patch.card_tag = data.card_tag;
        // 打标/清标时重置卡状态；清标回到 idle
        if (data.card_tag === null) {
          patch.card_status = 'idle';
        } else if (existing.card_tag !== data.card_tag) {
          patch.card_status = 'idle';
          patch.card_summary = {};
        }
      }

      const { data: folderData, error } = await this.client
        .from('folders')
        .update(patch)
        .eq('id', folderId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        if (error.code === '23505') throw new DuplicateError('Folder', 'name', String(data.name ?? existing.name));
        throw new DataAccessError(`Failed to update folder: ${error.message}`, 'UPDATE_ERROR', error);
      }

      if (!folderData) throw new NotFoundError('Folder', folderId);
      return this.mapToFolder(folderData);
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof DuplicateError || error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error updating folder: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async getSystemFolders(options?: { card_tag?: FolderCardTag | null }): Promise<Folder[]> {
    try {
      let query = this.client
        .from('folders')
        .select('*')
        .eq('is_system', true)
        .eq('folder_kind', 'virtual')
        .order('created_at', { ascending: false });

      if (options?.card_tag !== undefined) {
        if (options.card_tag === null) query = query.is('card_tag', null);
        else query = query.eq('card_tag', options.card_tag);
      }

      const { data, error } = await query;
      if (error) {
        if (this.isTableMissingError(error)) return [];
        throw new DataAccessError(`Failed to get system folders: ${error.message}`, 'QUERY_ERROR', error);
      }
      return (data || []).map(this.mapToFolder);
    } catch (error) {
      if (error instanceof DataAccessError) throw error;
      throw new DataAccessError(`Unexpected error getting system folders: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async updateFolderIndex(userId: string, folderId: string, data: UpdateFolderIndexDto): Promise<Folder> {
    const existing = await this.getFolderById(folderId);
    if (!existing) throw new NotFoundError('Folder', folderId);
    if (existing.user_id !== userId && !existing.is_system) {
      throw new DataAccessError('Folder does not belong to user', 'PERMISSION_ERROR');
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.index_status !== undefined) patch.index_status = data.index_status;
    if (data.indexed_at !== undefined) patch.indexed_at = data.indexed_at;
    if (data.knowledge_base_id !== undefined) patch.knowledge_base_id = data.knowledge_base_id;
    if (data.index_error !== undefined) patch.index_error = data.index_error;
    if (data.card_status !== undefined) patch.card_status = data.card_status;
    if (data.card_summary !== undefined) patch.card_summary = data.card_summary;

    let query = this.client.from('folders').update(patch).eq('id', folderId);
    if (!existing.is_system) {
      query = query.eq('user_id', userId);
    }
    const { data: folderData, error } = await query.select().single();

    if (error) {
      throw new DataAccessError(`Failed to update folder index: ${error.message}`, 'UPDATE_ERROR', error);
    }
    if (!folderData) throw new NotFoundError('Folder', folderId);
    return this.mapToFolder(folderData);
  }

  async deleteFolder(userId: string, folderId: string): Promise<void> {
    try {
      const existing = await this.getFolderById(folderId);
      if (!existing) throw new NotFoundError('Folder', folderId);
      if (existing.user_id !== userId) {
        throw new DataAccessError('Folder does not belong to user', 'PERMISSION_ERROR');
      }

      // 递归删除子文件夹（虚拟夹仅为软链容器，删除不影响原始任务/上传）
      const { data: children, error: childrenError } = await this.client
        .from('folders')
        .select('id')
        .eq('parent_id', folderId)
        .eq('user_id', userId);

      if (childrenError) {
        throw new DataAccessError(`Failed to check child folders: ${childrenError.message}`, 'QUERY_ERROR', childrenError);
      }

      for (const child of children || []) {
        await this.deleteFolder(userId, String(child.id));
      }

      // 清理软链与索引条目
      await this.client.from('folder_items').delete().eq('folder_id', folderId);
      await this.client.from('folder_index_entries').delete().eq('folder_id', folderId);

      const { error } = await this.client.from('folders').delete().eq('id', folderId).eq('user_id', userId);

      if (error) {
        throw new DataAccessError(`Failed to delete folder: ${error.message}`, 'DELETE_ERROR', error);
      }
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof DataAccessError) throw error;
      throw new DataAccessError(`Unexpected error deleting folder: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async getFolderItemIds(folderId: string, options?: FolderItemsQueryOptions): Promise<string[]> {
    const items = await this.getFolderItems(folderId, options);
    return items.map((i) => i.task_id).filter((id): id is string => !!id);
  }

  async getFolderItems(folderId: string, options?: FolderItemsQueryOptions): Promise<FolderItem[]> {
    try {
      let query = this.client
        .from('folder_items')
        .select('id, folder_id, task_id, storage_object_id, asset_role, created_at')
        .eq('folder_id', folderId)
        .order('created_at', { ascending: false });

      if (options?.limit) query = query.limit(options.limit);
      if (options?.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 100) - 1);
      }

      const { data, error } = await query;

      if (error) {
        if (this.isTableMissingError(error)) return [];
        throw new DataAccessError(`Failed to get folder items: ${error.message}`, 'QUERY_ERROR', error);
      }

      return (data || []).map(this.mapToFolderItem);
    } catch (error) {
      if (error instanceof DataAccessError) throw error;
      throw new DataAccessError(`Unexpected error getting folder items: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async getFolderItemCount(folderId: string): Promise<number> {
    try {
      const { count, error } = await this.client
        .from('folder_items')
        .select('*', { count: 'exact', head: true })
        .eq('folder_id', folderId);

      if (error) {
        if (this.isTableMissingError(error)) return 0;
        throw new DataAccessError(`Failed to get folder item count: ${error.message}`, 'QUERY_ERROR', error);
      }

      return count || 0;
    } catch (error) {
      if (error instanceof DataAccessError) throw error;
      throw new DataAccessError(`Unexpected error getting folder item count: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async addItemToFolder(folderId: string, taskId: string): Promise<void> {
    await this.insertFolderItem({ folder_id: folderId, task_id: taskId, storage_object_id: null });
    await this.markFolderStaleIfIndexed(folderId);
  }

  async addStorageObjectToFolder(folderId: string, storageObjectId: string): Promise<void> {
    await this.insertFolderItem({
      folder_id: folderId,
      task_id: null,
      storage_object_id: storageObjectId,
    });
    await this.markFolderStaleIfIndexed(folderId);
  }

  async removeItemFromFolder(folderId: string, taskId: string): Promise<void> {
    const { error } = await this.client
      .from('folder_items')
      .delete()
      .eq('folder_id', folderId)
      .eq('task_id', taskId);

    if (error) {
      throw new DataAccessError(`Failed to remove item from folder: ${error.message}`, 'DELETE_ERROR', error);
    }
    await this.markFolderStaleIfIndexed(folderId);
  }

  async removeStorageObjectFromFolder(folderId: string, storageObjectId: string): Promise<void> {
    const { error } = await this.client
      .from('folder_items')
      .delete()
      .eq('folder_id', folderId)
      .eq('storage_object_id', storageObjectId);

    if (error) {
      throw new DataAccessError(`Failed to remove storage object from folder: ${error.message}`, 'DELETE_ERROR', error);
    }
    await this.markFolderStaleIfIndexed(folderId);
  }

  async getItemFolders(taskId: string, folderKind?: FolderKind): Promise<Folder[]> {
    try {
      const { data, error } = await this.client
        .from('folder_items')
        .select(`
          folder_id,
          folders (
            id,
            user_id,
            name,
            parent_id,
            folder_kind,
            index_status,
            indexed_at,
            knowledge_base_id,
            index_error,
            created_at,
            updated_at
          )
        `)
        .eq('task_id', taskId);

      if (error) {
        if (this.isTableMissingError(error)) return [];
        throw new DataAccessError(`Failed to get item folders: ${error.message}`, 'QUERY_ERROR', error);
      }

      return (data || [])
        .map((item: { folders: unknown }) => item.folders)
        .filter((folder): folder is Record<string, unknown> => folder != null)
        .map(this.mapToFolder)
        .filter((f) => !folderKind || f.folder_kind === folderKind);
    } catch (error) {
      if (error instanceof DataAccessError) throw error;
      throw new DataAccessError(`Unexpected error getting item folders: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async getStorageObjectVirtualFolders(storageObjectId: string): Promise<Folder[]> {
    try {
      const { data, error } = await this.client
        .from('folder_items')
        .select(`
          folder_id,
          folders (
            id,
            user_id,
            name,
            parent_id,
            folder_kind,
            index_status,
            indexed_at,
            knowledge_base_id,
            index_error,
            created_at,
            updated_at
          )
        `)
        .eq('storage_object_id', storageObjectId);

      if (error) {
        if (this.isTableMissingError(error)) return [];
        throw new DataAccessError(`Failed to get storage object folders: ${error.message}`, 'QUERY_ERROR', error);
      }

      return (data || [])
        .map((item: { folders: unknown }) => item.folders)
        .filter((folder): folder is Record<string, unknown> => folder != null)
        .map(this.mapToFolder)
        .filter((f) => f.folder_kind === 'virtual');
    } catch (error) {
      if (error instanceof DataAccessError) throw error;
      throw new DataAccessError(
        `Unexpected error getting storage object folders: ${error}`,
        'UNEXPECTED_ERROR',
        error as Error
      );
    }
  }

  async getFolderPath(folderId: string): Promise<Folder[]> {
    try {
      const path: Folder[] = [];
      let currentId: string | null = folderId;

      while (currentId) {
        const folder = await this.getFolderById(currentId);
        if (!folder) break;
        path.unshift(folder);
        currentId = folder.parent_id;
      }

      return path;
    } catch (error: unknown) {
      const err = error as { message?: string; code?: string };
      if (this.isTableMissingError(err)) return [];
      if (error instanceof DataAccessError) throw error;
      throw new DataAccessError(`Unexpected error getting folder path: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async markFolderStaleIfIndexed(folderId: string): Promise<void> {
    const folder = await this.getFolderById(folderId);
    if (!folder || folder.folder_kind !== 'virtual') return;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (folder.index_status === 'indexed') {
      patch.index_status = 'stale';
    }
    if (folder.card_tag && (folder.card_status === 'ready' || folder.card_status === 'parsing')) {
      patch.card_status = 'stale';
    }
    if (Object.keys(patch).length > 1) {
      await this.client.from('folders').update(patch).eq('id', folderId);
    }
  }

  async updateFolderItemAssetRole(
    folderId: string,
    itemId: string,
    assetRole: FolderAssetRole
  ): Promise<FolderItem> {
    const { data, error } = await this.client
      .from('folder_items')
      .update({ asset_role: assetRole })
      .eq('id', itemId)
      .eq('folder_id', folderId)
      .select('id, folder_id, task_id, storage_object_id, asset_role, created_at')
      .single();

    if (error) {
      throw new DataAccessError(`Failed to update asset_role: ${error.message}`, 'UPDATE_ERROR', error);
    }
    if (!data) throw new NotFoundError('FolderItem', itemId);
    await this.markFolderStaleIfIndexed(folderId);
    return this.mapToFolderItem(data);
  }

  async getFolderIndexEntries(folderId: string): Promise<FolderIndexEntry[]> {
    const { data, error } = await this.client
      .from('folder_index_entries')
      .select('*')
      .eq('folder_id', folderId)
      .order('created_at', { ascending: false });

    if (error) {
      if (this.isTableMissingError(error)) return [];
      throw new DataAccessError(`Failed to get folder index entries: ${error.message}`, 'QUERY_ERROR', error);
    }

    return (data || []).map(this.mapToFolderIndexEntry);
  }

  async upsertFolderIndexEntry(folderId: string, data: UpsertFolderIndexEntryDto): Promise<FolderIndexEntry> {
    const now = new Date().toISOString();
    const row = {
      folder_id: folderId,
      ref_type: data.ref_type,
      ref_id: data.ref_id,
      content_hash: data.content_hash ?? null,
      status: data.status,
      chunk_count: data.chunk_count ?? 0,
      indexed_at: data.indexed_at ?? null,
      error_message: data.error_message ?? null,
      analysis: data.analysis ?? null,
      updated_at: now,
    };

    const { data: result, error } = await this.client
      .from('folder_index_entries')
      .upsert(row, { onConflict: 'folder_id,ref_type,ref_id' })
      .select()
      .single();

    if (error) {
      throw new DataAccessError(`Failed to upsert folder index entry: ${error.message}`, 'UPSERT_ERROR', error);
    }

    return this.mapToFolderIndexEntry(result);
  }

  async deleteFolderIndexEntriesNotIn(
    folderId: string,
    refs: Array<{ ref_type: FolderItemRefType; ref_id: string }>
  ): Promise<void> {
    const entries = await this.getFolderIndexEntries(folderId);
    const keep = new Set(refs.map((r) => `${r.ref_type}:${r.ref_id}`));
    const toDelete = entries.filter((e) => !keep.has(`${e.ref_type}:${e.ref_id}`));

    for (const entry of toDelete) {
      await this.client.from('folder_index_entries').delete().eq('id', entry.id);
    }
  }

  private async insertFolderItem(row: {
    folder_id: string;
    task_id: string | null;
    storage_object_id: string | null;
  }): Promise<void> {
    const { error } = await this.client.from('folder_items').insert(row);

    if (error) {
      if (error.code === '23505') return;
      throw new DataAccessError(`Failed to add item to folder: ${error.message}`, 'CREATE_ERROR', error);
    }
  }

  private isTableMissingError(error: { message?: string; code?: string }): boolean {
    return (
      !!error.message?.includes('Could not find the table') ||
      !!error.message?.includes('does not exist') ||
      error.code === '42P01'
    );
  }

  private mapToFolder = (data: Record<string, unknown>): Folder => ({
    id: String(data.id),
    user_id: String(data.user_id),
    name: String(data.name),
    parent_id: (data.parent_id as string | null) ?? null,
    folder_kind: (data.folder_kind as FolderKind) || 'upload',
    index_status: (data.index_status as Folder['index_status']) ?? null,
    indexed_at: (data.indexed_at as string | null) ?? null,
    knowledge_base_id: (data.knowledge_base_id as string | null) ?? null,
    index_error: (data.index_error as string | null) ?? null,
    card_tag: (data.card_tag as Folder['card_tag']) ?? null,
    card_status: (data.card_status as Folder['card_status']) ?? 'idle',
    card_summary:
      data.card_summary && typeof data.card_summary === 'object'
        ? (data.card_summary as Record<string, unknown>)
        : {},
    is_system: data.is_system === true,
    created_at: String(data.created_at),
    updated_at: String(data.updated_at),
  });

  private mapToFolderItem = (data: Record<string, unknown>): FolderItem => ({
    id: String(data.id),
    folder_id: String(data.folder_id),
    task_id: (data.task_id as string | null) ?? null,
    storage_object_id: (data.storage_object_id as string | null) ?? null,
    asset_role: (data.asset_role as FolderAssetRole | null) ?? 'unknown',
    created_at: String(data.created_at),
  });

  private mapToFolderIndexEntry = (data: Record<string, unknown>): FolderIndexEntry => ({
    id: String(data.id),
    folder_id: String(data.folder_id),
    ref_type: data.ref_type as FolderIndexEntry['ref_type'],
    ref_id: String(data.ref_id),
    content_hash: (data.content_hash as string | null) ?? null,
    status: data.status as FolderIndexEntry['status'],
    chunk_count: Number(data.chunk_count ?? 0),
    indexed_at: (data.indexed_at as string | null) ?? null,
    error_message: (data.error_message as string | null) ?? null,
    analysis:
      data.analysis && typeof data.analysis === 'object'
        ? (data.analysis as Record<string, unknown>)
        : null,
    created_at: String(data.created_at),
    updated_at: String(data.updated_at),
  });
}
