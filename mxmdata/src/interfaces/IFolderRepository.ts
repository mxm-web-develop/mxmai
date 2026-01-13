/**
 * 文件夹数据仓库接口
 * 提供用户文件夹和文件关联管理功能
 */

export interface Folder {
  id: string;
  user_id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateFolderDto {
  name: string;
  parent_id?: string | null;
}

export interface UpdateFolderDto {
  name: string;
}

export interface FolderItem {
  folder_id: string;
  task_id: string;  // 任务 ID（来自 cgi-tasks 表）
  created_at: string;
}

export interface FolderQueryOptions {
  parent_id?: string | null;
  limit?: number;
  offset?: number;
}

export interface FolderItemsQueryOptions {
  limit?: number;
  offset?: number;
}

/**
 * 文件夹数据仓库接口
 */
export interface IFolderRepository {
  /**
   * 获取用户的文件夹列表
   */
  getFolders(userId: string, options?: FolderQueryOptions): Promise<Folder[]>;

  /**
   * 根据 ID 获取文件夹
   */
  getFolderById(folderId: string): Promise<Folder | null>;

  /**
   * 创建文件夹
   */
  createFolder(userId: string, data: CreateFolderDto): Promise<Folder>;

  /**
   * 更新文件夹
   */
  updateFolder(userId: string, folderId: string, data: UpdateFolderDto): Promise<Folder>;

  /**
   * 删除文件夹
   */
  deleteFolder(userId: string, folderId: string): Promise<void>;

  /**
   * 获取文件夹中的任务 ID 列表
   */
  getFolderItemIds(folderId: string, options?: FolderItemsQueryOptions): Promise<string[]>;

  /**
   * 获取文件夹中的文件总数
   */
  getFolderItemCount(folderId: string): Promise<number>;

  /**
   * 添加任务到文件夹
   */
  addItemToFolder(folderId: string, taskId: string): Promise<void>;

  /**
   * 从文件夹移除任务
   */
  removeItemFromFolder(folderId: string, taskId: string): Promise<void>;

  /**
   * 获取任务所属的文件夹列表
   */
  getItemFolders(taskId: string): Promise<Folder[]>;

  /**
   * 获取文件夹路径（从根目录到当前文件夹）
   */
  getFolderPath(folderId: string): Promise<Folder[]>;
}
