/**
 * Prompt 模板管理路由
 */

import { Router, Request, Response } from 'express';
import type {
  CreatePromptTemplateDto,
  UpdatePromptTemplateDto,
} from '@mxmai/mxmdata';
import { createPromptTemplateService } from '../core/prompt-template/service';

const router = Router();

// 延迟初始化 service，避免在模块加载时就初始化 RepositoryFactory
let serviceInstance: ReturnType<typeof createPromptTemplateService> | null = null;

function getService() {
  if (!serviceInstance) {
    serviceInstance = createPromptTemplateService();
  }
  return serviceInstance;
}

/**
 * GET /api/v1/prompt-templates
 * 获取模板列表
 * Query:
 *   - userId: 用户 ID（可选，获取该用户的模板）
 *   - public: true/false（可选，获取公开的模板）
 *   - category: 分类（可选，按分类筛选）
 *   - limit: 数量限制（可选，默认 50）
 *   - offset: 偏移量（可选，默认 0）
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const service = getService();
    const { userId, public: isPublic, category, limit, offset } = req.query;

    if (isPublic === 'true') {
      // 获取公开的模板
      const templates = await service.getPublicTemplates(
        limit ? Number(limit) : undefined,
        offset ? Number(offset) : undefined
      );
      return res.json({
        success: true,
        data: templates,
        count: templates.length,
      });
    } else if (category) {
      // 按分类获取模板
      const templates = await service.getTemplatesByCategory(
        category as string,
        limit ? Number(limit) : undefined,
        offset ? Number(offset) : undefined
      );
      return res.json({
        success: true,
        data: templates,
        count: templates.length,
      });
    } else if (userId) {
      // 获取用户的模板
      const templates = await service.getUserTemplates(
        userId as string,
        limit ? Number(limit) : undefined,
        offset ? Number(offset) : undefined
      );
      return res.json({
        success: true,
        data: templates,
        count: templates.length,
      });
    } else {
      // 默认返回所有模板
      const templates = await service.getAllTemplates(
        limit ? Number(limit) : undefined,
        offset ? Number(offset) : undefined
      );
      return res.json({
        success: true,
        data: templates,
        count: templates.length,
      });
    }
  } catch (error) {
    console.error('Error getting prompt templates:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/v1/prompt-templates/:id
 * 获取单个模板详情
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const service = getService();
    const { id } = req.params;

    const template = await service.getTemplateById(id);

    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
      });
    }

    return res.json({
      success: true,
      data: template,
    });
  } catch (error) {
    console.error('Error getting prompt template:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/v1/prompt-templates/name/:name
 * 根据名称获取模板
 */
router.get('/name/:name', async (req: Request, res: Response) => {
  try {
    const service = getService();
    const { name } = req.params;

    const template = await service.getTemplateByName(name);

    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
      });
    }

    return res.json({
      success: true,
      data: template,
    });
  } catch (error) {
    console.error('Error getting prompt template by name:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/v1/prompt-templates
 * 创建模板
 * Body: CreatePromptTemplateDto
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const service = getService();
    const data = req.body as CreatePromptTemplateDto;

    // 验证必需字段
    if (!data.name || !data.display_name || !data.template) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, display_name, template',
      });
    }

    const template = await service.createTemplate(data);

    return res.status(201).json({
      success: true,
      data: template,
    });
  } catch (error) {
    console.error('Error creating prompt template:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * PUT /api/v1/prompt-templates/:id
 * 更新模板
 * Body: UpdatePromptTemplateDto
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const service = getService();
    const { id } = req.params;
    const data = req.body as UpdatePromptTemplateDto;

    const template = await service.updateTemplate(id, data);

    return res.json({
      success: true,
      data: template,
    });
  } catch (error) {
    console.error('Error updating prompt template:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * DELETE /api/v1/prompt-templates/:id
 * 删除模板
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const service = getService();
    const { id } = req.params;

    await service.deleteTemplate(id);

    return res.json({
      success: true,
      message: 'Template deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting prompt template:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
