/**
 * Smartflow 数据仓库接口
 * 提供 Smartflow 定义的 CRUD 操作
 */

import type {
  Smartflow,
  CreateSmartflowDto,
  UpdateSmartflowDto,
} from '../models/Smartflow';

/**
 * Smartflow 数据仓库接口
 */
export interface ISmartflowRepository {
  /**
   * 根据 ID 查找 Smartflow
   */
  findById(id: string): Promise<Smartflow | null>;

  /**
   * 根据用户 ID 查找所有 Smartflow 列表
   */
  findByUserId(userId: string, limit?: number, offset?: number): Promise<Smartflow[]>;

  /**
   * 查找所有公开的 Smartflow
   */
  findPublic(limit?: number, offset?: number): Promise<Smartflow[]>;

  /**
   * 查找所有 Smartflow（默认返回所有，包括公开和私有的）
   */
  findAll(limit?: number, offset?: number): Promise<Smartflow[]>;

  /**
   * 创建 Smartflow
   */
  create(data: CreateSmartflowDto): Promise<Smartflow>;

  /**
   * 更新 Smartflow
   */
  update(id: string, data: UpdateSmartflowDto): Promise<Smartflow>;

  /**
   * 删除 Smartflow
   */
  delete(id: string): Promise<void>;
}
