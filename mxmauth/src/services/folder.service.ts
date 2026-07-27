/**
 * 文件夹服务
 * 提供文件夹相关的业务逻辑
 */

import { RepositoryFactory, type FolderKind } from '@mxmai/mxmdata';
import { DuplicateError } from '@mxmai/mxmdata';

export interface FolderCreateResult {
  id: string;
  name: string;
  created: boolean;
  folder_kind: FolderKind;
}

export class FolderService {
  private folderRepo = RepositoryFactory.createFolderRepository();

  async checkServiceAvailable(): Promise<boolean> {
    try {
      await this.folderRepo.getFolders('00000000-0000-0000-0000-000000000000', {});
      return true;
    } catch (error: unknown) {
      const err = error as { message?: string };
      if (err?.message?.includes('Could not find the table') || err?.message?.includes('does not exist')) {
        return false;
      }
      return true;
    }
  }

  /**
   * 为用户创建上传管理器默认目录。
   * 虚拟文件夹不预置「默认收藏」——由用户自行建树。
   */
  async createDefaultFolders(userId: string): Promise<FolderCreateResult[]> {
    const isAvailable = await this.checkServiceAvailable();
    if (!isAvailable) {
      console.warn('⚠️ 文件夹服务不可用，跳过默认文件夹创建');
      return [];
    }

    const results: FolderCreateResult[] = [];
    const created = await this.ensureDefaultFolder(userId, '默认', 'upload');
    if (created) results.push(created);
    return results;
  }

  /** @deprecated 使用 createDefaultFolders */
  async createDefaultFolder(userId: string): Promise<FolderCreateResult | null> {
    const list = await this.createDefaultFolders(userId);
    return list.find((f) => f.folder_kind === 'upload') ?? list[0] ?? null;
  }

  private async ensureDefaultFolder(
    userId: string,
    name: string,
    folderKind: FolderKind
  ): Promise<FolderCreateResult | null> {
    try {
      const folders = await this.folderRepo.getFolders(userId, { parent_id: null, folder_kind: folderKind });
      const existing = folders.find((f) => f.name === name);

      if (existing) {
        return { id: existing.id, name: existing.name, created: false, folder_kind: folderKind };
      }

      const folder = await this.folderRepo.createFolder(userId, {
        name,
        parent_id: null,
        folder_kind: folderKind,
      });

      console.log(`✅ 用户 ${userId} ${folderKind} 默认文件夹创建成功:`, folder.id);
      return { id: folder.id, name: folder.name, created: true, folder_kind: folderKind };
    } catch (error: unknown) {
      if (error instanceof DuplicateError) {
        try {
          const folders = await this.folderRepo.getFolders(userId, { parent_id: null, folder_kind: folderKind });
          const existing = folders.find((f) => f.name === name);
          if (existing) {
            return { id: existing.id, name: existing.name, created: false, folder_kind: folderKind };
          }
        } catch {
          /* ignore */
        }
        return null;
      }
      console.error(`❌ 用户 ${userId} ${folderKind} 默认文件夹创建失败:`, error);
      return null;
    }
  }
}
