/**
 * 文件夹服务
 * 提供文件夹相关的业务逻辑
 */

import { RepositoryFactory } from '@mxmai/mxmdata';
import { DuplicateError } from '@mxmai/mxmdata';

export interface FolderCreateResult {
  id: string;
  name: string;
  created: boolean;
}

export class FolderService {
  private folderRepo = RepositoryFactory.createFolderRepository();

  /**
   * 检查文件夹服务是否可用
   */
  async checkServiceAvailable(): Promise<boolean> {
    try {
      // 尝试获取文件夹仓库，如果失败则服务不可用
      await this.folderRepo.getFolders('00000000-0000-0000-0000-000000000000', {});
      return true;
    } catch (error: any) {
      // 如果是表不存在的错误，服务不可用
      if (error?.message?.includes('Could not find the table') || 
          error?.message?.includes('does not exist')) {
        return false;
      }
      // 其他错误（如权限错误）说明服务可用，只是查询失败
      return true;
    }
  }

  /**
   * 为用户创建默认文件夹
   * @param userId 用户 ID
   * @returns 文件夹信息，如果创建失败或服务不可用则返回 null
   */
  async createDefaultFolder(userId: string): Promise<FolderCreateResult | null> {
    // 检查服务是否可用
    const isAvailable = await this.checkServiceAvailable();
    if (!isAvailable) {
      console.warn(`⚠️ 文件夹服务不可用，跳过默认文件夹创建`);
      return null;
    }

    try {
      // 检查是否已存在"默认"文件夹
      const folders = await this.folderRepo.getFolders(userId, { parent_id: null });
      const defaultFolder = folders.find(f => f.name === '默认');
      
      if (defaultFolder) {
        console.log(`✅ 用户 ${userId} 已存在默认文件夹:`, defaultFolder.id);
        return {
          id: defaultFolder.id,
          name: defaultFolder.name,
          created: false,
        };
      }

      // 创建"默认"文件夹
      const folder = await this.folderRepo.createFolder(userId, {
        name: '默认',
        parent_id: null,
      });

      console.log(`✅ 用户 ${userId} 默认文件夹创建成功:`, folder.id);
      return {
        id: folder.id,
        name: folder.name,
        created: true,
      };
    } catch (error: any) {
      // 如果是重复错误（理论上不应该发生，因为已经检查过），返回已存在的文件夹
      if (error instanceof DuplicateError) {
        console.warn(`⚠️ 用户 ${userId} 默认文件夹已存在（重复创建）`);
        // 尝试获取已存在的文件夹
        try {
          const folders = await this.folderRepo.getFolders(userId, { parent_id: null });
          const defaultFolder = folders.find(f => f.name === '默认');
          if (defaultFolder) {
            return {
              id: defaultFolder.id,
              name: defaultFolder.name,
              created: false,
            };
          }
        } catch (e) {
          // 忽略获取错误
        }
        return null;
      }

      // 其他错误记录日志但不影响用户注册流程
      console.error(`❌ 用户 ${userId} 默认文件夹创建失败:`, error);
      return null;
    }
  }
}
