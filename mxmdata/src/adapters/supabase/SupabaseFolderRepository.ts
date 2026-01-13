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
        // 如果表不存在（42P01 或相关错误），返回空数组而不是抛出错误
        // 这样用户在没有创建表的情况下也能正常使用（返回空列表）
        if (error.message?.includes("Could not find the table") || 
            error.message?.includes("does not exist") ||
            error.code === '42P01') {
          console.warn('[文件夹] 表不存在，返回空数组:', error.message);
          return [];
        }
        throw new DataAccessError(`Failed to get folders: ${error.message}`, 'QUERY_ERROR', error);
      }

      return (data || []).map(this.mapToFolder);
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
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
        if (error.code === 'PGRST116') {
          return null;
        }
        // 如果表不存在，返回 null（而不是抛出错误）
        if (error.message?.includes("Could not find the table") || 
            error.message?.includes("does not exist") ||
            error.code === '42P01') {
          return null;
        }
        throw new DataAccessError(`Failed to get folder by id: ${error.message}`, 'QUERY_ERROR', error);
      }

      return data ? this.mapToFolder(data) : null;
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error getting folder by id: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async createFolder(userId: string, data: CreateFolderDto): Promise<Folder> {
    try {
      const { data: folderData, error } = await this.client
        .from('folders')
        .insert({
          user_id: userId,
          name: data.name,
          parent_id: data.parent_id || null,
        })
        .select()
        .single();

      if (error) {
        // 检查是否是唯一约束冲突（同一父目录下重名）
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
      if (error instanceof DuplicateError || error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error creating folder: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async updateFolder(userId: string, folderId: string, data: UpdateFolderDto): Promise<Folder> {
    try {
      // 先验证文件夹存在且属于该用户
      const existing = await this.getFolderById(folderId);
      if (!existing) {
        throw new NotFoundError('Folder', folderId);
      }
      if (existing.user_id !== userId) {
        throw new DataAccessError('Folder does not belong to user', 'PERMISSION_ERROR');
      }

      const { data: folderData, error } = await this.client
        .from('folders')
        .update({
          name: data.name,
          updated_at: new Date().toISOString(),
        })
        .eq('id', folderId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        // 检查是否是唯一约束冲突
        if (error.code === '23505') {
          throw new DuplicateError('Folder', 'name', data.name);
        }
        throw new DataAccessError(`Failed to update folder: ${error.message}`, 'UPDATE_ERROR', error);
      }

      if (!folderData) {
        throw new NotFoundError('Folder', folderId);
      }

      return this.mapToFolder(folderData);
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof DuplicateError || error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error updating folder: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async deleteFolder(userId: string, folderId: string): Promise<void> {
    try {
      // 先验证文件夹存在且属于该用户
      const existing = await this.getFolderById(folderId);
      if (!existing) {
        throw new NotFoundError('Folder', folderId);
      }
      if (existing.user_id !== userId) {
        throw new DataAccessError('Folder does not belong to user', 'PERMISSION_ERROR');
      }

      // 检查是否有子文件夹
      const { data: children, error: childrenError } = await this.client
        .from('folders')
        .select('id')
        .eq('parent_id', folderId)
        .limit(1);

      if (childrenError) {
        throw new DataAccessError(`Failed to check child folders: ${childrenError.message}`, 'QUERY_ERROR', childrenError);
      }

      if (children && children.length > 0) {
        throw new DataAccessError('Cannot delete folder with child folders', 'VALIDATION_ERROR');
      }

      const { error } = await this.client
        .from('folders')
        .delete()
        .eq('id', folderId)
        .eq('user_id', userId);

      if (error) {
        throw new DataAccessError(`Failed to delete folder: ${error.message}`, 'DELETE_ERROR', error);
      }
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error deleting folder: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async getFolderItemIds(folderId: string, options?: FolderItemsQueryOptions): Promise<string[]> {
    try {
      let query = this.client
        .from('folder_items')
        .select('task_id')
        .eq('folder_id', folderId)
        .order('created_at', { ascending: false });

      if (options?.limit) {
        query = query.limit(options.limit);
      }

      if (options?.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 100) - 1);
      }

      const { data, error } = await query;

      if (error) {
        // 如果表不存在，返回空数组
        if (error.message?.includes("Could not find the table") || 
            error.message?.includes("does not exist") ||
            error.code === '42P01') {
          console.warn('[文件夹] 表不存在，返回空数组:', error.message);
          return [];
        }
        throw new DataAccessError(`Failed to get folder items: ${error.message}`, 'QUERY_ERROR', error);
      }

      return (data || []).map((item: any) => item.task_id);
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
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
        // 如果表不存在，返回 0
        if (error.message?.includes("Could not find the table") || 
            error.message?.includes("does not exist") ||
            error.code === '42P01') {
          return 0;
        }
        throw new DataAccessError(`Failed to get folder item count: ${error.message}`, 'QUERY_ERROR', error);
      }

      return count || 0;
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error getting folder item count: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async addItemToFolder(folderId: string, taskId: string): Promise<void> {
    try {
      const { error } = await this.client
        .from('folder_items')
        .insert({
          folder_id: folderId,
          task_id: taskId,
        });

      if (error) {
        // 如果是唯一约束冲突，说明已经存在，忽略
        if (error.code === '23505') {
          return;
        }
        throw new DataAccessError(`Failed to add item to folder: ${error.message}`, 'CREATE_ERROR', error);
      }
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error adding item to folder: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async removeItemFromFolder(folderId: string, taskId: string): Promise<void> {
    try {
      const { error } = await this.client
        .from('folder_items')
        .delete()
        .eq('folder_id', folderId)
        .eq('task_id', taskId);

      if (error) {
        throw new DataAccessError(`Failed to remove item from folder: ${error.message}`, 'DELETE_ERROR', error);
      }
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error removing item from folder: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async getItemFolders(taskId: string): Promise<Folder[]> {
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
            created_at,
            updated_at
          )
        `)
        .eq('task_id', taskId);

      if (error) {
        // 如果表不存在，返回空数组
        if (error.message?.includes("Could not find the table") || 
            error.message?.includes("does not exist") ||
            error.code === '42P01') {
          return [];
        }
        throw new DataAccessError(`Failed to get item folders: ${error.message}`, 'QUERY_ERROR', error);
      }

      return (data || [])
        .map((item: any) => item.folders)
        .filter((folder: any) => folder !== null)
        .map(this.mapToFolder);
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error getting item folders: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async getFolderPath(folderId: string): Promise<Folder[]> {
    try {
      const path: Folder[] = [];
      let currentId: string | null = folderId;

      while (currentId) {
        const folder = await this.getFolderById(currentId);
        if (!folder) {
          break;
        }

        path.unshift(folder);
        currentId = folder.parent_id;
      }

      return path;
    } catch (error: any) {
      // 如果表不存在，返回空数组
      if (error?.message?.includes("Could not find the table") || 
          error?.message?.includes("does not exist") ||
          error?.code === '42P01') {
        return [];
      }
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error getting folder path: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  private mapToFolder(data: any): Folder {
    return {
      id: data.id,
      user_id: data.user_id,
      name: data.name,
      parent_id: data.parent_id,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }
}
