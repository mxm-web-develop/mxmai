/**
 * CGI Task 数据仓库接口
 * 提供 CGI 任务的 CRUD 操作
 */

import type {
  CGITask,
  CreateCGITaskDto,
  UpdateCGITaskDto,
  ListCGITasksOptions,
} from '../models/CGITask';

/**
 * CGI Task 数据仓库接口
 */
export interface ICGITaskRepository {
  /**
   * 根据 ID 查找任务
   * @param includeDeleted 是否包含已软删除的任务（仅 admin 使用）
   */
  findById(id: string, includeDeleted?: boolean): Promise<CGITask | null>;

  /**
   * 创建任务
   */
  create(data: CreateCGITaskDto): Promise<CGITask>;

  /**
   * 更新任务
   */
  update(id: string, data: UpdateCGITaskDto): Promise<CGITask>;

  /**
   * 删除任务（硬删除，仅 admin 使用）
   */
  delete(id: string): Promise<void>;

  /**
   * 软删除任务（标记 deleted_at，普通用户使用）
   */
  softDelete(id: string): Promise<void>;

  /**
   * 查询任务列表
   */
  findMany(options?: ListCGITasksOptions): Promise<{ tasks: CGITask[]; total: number }>;

  /**
   * 根据用户 ID 查询任务列表
   */
  findByUserId(userId: string, options?: Omit<ListCGITasksOptions, 'user_id'>): Promise<{ tasks: CGITask[]; total: number }>;

  /**
   * 原子领取 pending/queued 任务（FOR UPDATE SKIP LOCKED）
   * 需要 Supabase RPC：claim_pending_cgi_tasks
   */
  claimPendingTasks(workerId: string, limit?: number): Promise<CGITask[]>;
}
