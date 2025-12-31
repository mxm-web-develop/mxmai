/**
 * Prompt 模板数据仓库接口
 * 提供 Prompt 模板的 CRUD 操作
 */

import type {
  PromptTemplate,
  CreatePromptTemplateDto,
  UpdatePromptTemplateDto,
} from '../models/PromptTemplate';

/**
 * Prompt 模板数据仓库接口
 */
export interface IPromptTemplateRepository {
  /**
   * 根据 ID 查找模板
   */
  findById(id: string): Promise<PromptTemplate | null>;

  /**
   * 根据名称查找模板
   */
  findByName(name: string): Promise<PromptTemplate | null>;

  /**
   * 根据用户 ID 查找所有模板列表
   */
  findByUserId(userId: string, limit?: number, offset?: number): Promise<PromptTemplate[]>;

  /**
   * 查找所有公开的模板
   */
  findPublic(limit?: number, offset?: number): Promise<PromptTemplate[]>;

  /**
   * 查找所有模板（默认返回所有，包括公开和私有的）
   */
  findAll(limit?: number, offset?: number): Promise<PromptTemplate[]>;

  /**
   * 按分类查找模板
   */
  findByCategory(category: string, limit?: number, offset?: number): Promise<PromptTemplate[]>;

  /**
   * 创建模板
   */
  create(data: CreatePromptTemplateDto): Promise<PromptTemplate>;

  /**
   * 更新模板
   */
  update(id: string, data: UpdatePromptTemplateDto): Promise<PromptTemplate>;

  /**
   * 删除模板
   */
  delete(id: string): Promise<void>;

  /**
   * 增加模板使用次数
   */
  incrementUsageCount(id: string): Promise<void>;
}
