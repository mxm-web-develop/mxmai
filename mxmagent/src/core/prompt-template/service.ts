/**
 * Prompt 模板服务
 */

import { RepositoryFactory } from '@mxmai/mxmdata';
import type {
  PromptTemplate,
  CreatePromptTemplateDto,
  UpdatePromptTemplateDto,
} from '@mxmai/mxmdata';

export function createPromptTemplateService() {
  const repo = RepositoryFactory.createPromptTemplateRepository();

  return {
    /**
     * 根据 ID 获取模板
     */
    async getTemplateById(id: string): Promise<PromptTemplate | null> {
      return await repo.findById(id);
    },

    /**
     * 根据名称获取模板
     */
    async getTemplateByName(name: string): Promise<PromptTemplate | null> {
      return await repo.findByName(name);
    },

    /**
     * 获取用户的模板列表
     */
    async getUserTemplates(
      userId: string,
      limit?: number,
      offset?: number
    ): Promise<PromptTemplate[]> {
      return await repo.findByUserId(userId, limit, offset);
    },

    /**
     * 获取公开的模板列表
     */
    async getPublicTemplates(
      limit?: number,
      offset?: number
    ): Promise<PromptTemplate[]> {
      return await repo.findPublic(limit, offset);
    },

    /**
     * 获取所有模板（包括公开和私有的）
     */
    async getAllTemplates(
      limit?: number,
      offset?: number
    ): Promise<PromptTemplate[]> {
      return await repo.findAll(limit, offset);
    },

    /**
     * 按分类获取模板
     */
    async getTemplatesByCategory(
      category: string,
      limit?: number,
      offset?: number
    ): Promise<PromptTemplate[]> {
      return await repo.findByCategory(category, limit, offset);
    },

    /**
     * 创建模板
     */
    async createTemplate(data: CreatePromptTemplateDto): Promise<PromptTemplate> {
      return await repo.create(data);
    },

    /**
     * 更新模板
     */
    async updateTemplate(
      id: string,
      data: UpdatePromptTemplateDto
    ): Promise<PromptTemplate> {
      return await repo.update(id, data);
    },

    /**
     * 删除模板
     */
    async deleteTemplate(id: string): Promise<void> {
      return await repo.delete(id);
    },

    /**
     * 增加模板使用次数
     */
    async incrementUsageCount(id: string): Promise<void> {
      return await repo.incrementUsageCount(id);
    },
  };
}
