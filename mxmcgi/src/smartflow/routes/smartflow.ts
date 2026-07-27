/**
 * Smartflow API 路由
 */

import { Router, Request, Response } from 'express';
import { smartflowRepository } from '../core/engine/repository';
import { executionRepository } from '../core/engine/executionRepository';
import { SmartflowEngine } from '../core/engine/engine';
import { CreateSmartflowDto, UpdateSmartflowDto } from '../core/models/types';
import { validateSmartflowSchema } from '../core/smartflow-schema-validator';
import {
  applyMxmSmartflowBundleImport,
  buildSmartflowBundle,
  smartflowToBundleItem,
} from '../core/smartflow-bundle-import-apply';
import type { SmartflowBundle, SmartflowBundleImportPolicy } from '../core/smartflow-bundle-types';

const router = Router();

// 初始化引擎
const engine = new SmartflowEngine(smartflowRepository, executionRepository);

const SCHEMA_VALIDATE_OPTS = { requireBusinessSubtype: true } as const;

// Smartflow 列表与 CRUD 仅以 DB 为准；不再在启动时注入 predefined-flows / photographyV2 硬编码。
// 上架流程请用 bundle 导入：pnpm run apply:smartflow-bundle -- path/to/*.smartflow.json

// ============= Bundle 导出 / 导入（须在 /:id 之前注册） =============

router.get('/bundle', async (req: Request, res: Response) => {
  try {
    const id = String(req.query.id ?? '').trim();
    if (!id) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'query.id 必填' },
      });
    }
    const sf = await smartflowRepository.findById(id);
    if (!sf) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Smartflow not found: ${id}` },
      });
    }
    const bundle = buildSmartflowBundle([smartflowToBundleItem(sf)]);
    res.json({ success: true, data: bundle });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message },
    });
  }
});

router.post('/bundle/export', async (req: Request, res: Response) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? (req.body.ids as string[]).map(String).filter(Boolean) : [];
    if (ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'body.ids 必须为非空字符串数组' },
      });
    }
    const warnings: string[] = [];
    const items = [];
    for (const id of ids) {
      const sf = await smartflowRepository.findById(id);
      if (!sf) {
        warnings.push(`未找到: ${id}`);
        continue;
      }
      items.push(smartflowToBundleItem(sf));
    }
    if (items.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: '未导出任何工作流' },
        warnings,
      });
    }
    res.json({ success: true, data: buildSmartflowBundle(items), warnings });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message },
    });
  }
});

router.post('/bundle/import', async (req: Request, res: Response) => {
  try {
    const bundle = req.body?.bundle as SmartflowBundle | undefined;
    const conflictPolicy = (req.body?.conflictPolicy ?? 'upsert') as SmartflowBundleImportPolicy;
    if (!bundle) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'body.bundle 必填' },
      });
    }
    const authorId = (req.headers['x-user-id'] as string) || req.body?.author_id || null;
    const data = await applyMxmSmartflowBundleImport({
      bundle,
      conflictPolicy,
      repository: smartflowRepository,
      authorId,
    });
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: error.message },
    });
  }
});

// ============= 获取 Smartflow 列表 =============
router.get('/', async (req: Request, res: Response) => {
  try {
    const { public: isPublic, userId, limit = '50', offset = '0' } = req.query;
    
    let smartflows;
    if (isPublic === 'true') {
      smartflows = await smartflowRepository.findPublic(Number(limit), Number(offset));
    } else if (userId) {
      smartflows = await smartflowRepository.findByUserId(userId as string, Number(limit), Number(offset));
    } else {
      smartflows = await smartflowRepository.findAll(Number(limit), Number(offset));
    }

    res.json({
      success: true,
      data: smartflows,
      count: smartflows.length,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message },
    });
  }
});

// ============= 获取单个 Smartflow =============
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const smartflow = await smartflowRepository.findById(req.params.id);
    
    if (!smartflow) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Smartflow not found: ${req.params.id}` },
      });
    }

    res.json({
      success: true,
      data: smartflow,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message },
    });
  }
});

// ============= 创建 Smartflow =============
router.post('/', async (req: Request, res: Response) => {
  try {
    const dto: CreateSmartflowDto = req.body;
    
    if (!dto.name || !dto.schema) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'name and schema are required' },
      });
    }

    const schemaCheck = validateSmartflowSchema(dto.schema as any, SCHEMA_VALIDATE_OPTS);
    if (!schemaCheck.ok) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: schemaCheck.message },
      });
    }

    const authorId = dto.author_id || req.headers['x-user-id'] as string;
    if (authorId) {
      dto.author_id = authorId;
    }

    const smartflow = await smartflowRepository.create(dto);

    res.status(201).json({
      success: true,
      data: smartflow,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message },
    });
  }
});

// ============= 更新 Smartflow =============
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const dto: UpdateSmartflowDto = req.body;

    if (dto.schema) {
      const schemaCheck = validateSmartflowSchema(dto.schema as any, SCHEMA_VALIDATE_OPTS);
      if (!schemaCheck.ok) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: schemaCheck.message },
        });
      }
    }

    const smartflow = await smartflowRepository.update(req.params.id, dto);

    res.json({
      success: true,
      data: smartflow,
    });
  } catch (error: any) {
    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: error.message },
      });
    }
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message },
    });
  }
});

// ============= 删除 Smartflow =============
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await smartflowRepository.delete(req.params.id);

    res.json({
      success: true,
      message: 'Smartflow deleted successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message },
    });
  }
});

// ============= 执行 Smartflow =============
router.post('/:id/execute', async (req: Request, res: Response) => {
  try {
    const { input_data, conversation_id, mode = 'run' } = req.body;
    const userId = req.headers['x-user-id'] as string || req.body.user_id || 'anonymous';

    if (!input_data) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'input_data is required' },
      });
    }

    const executionDto = {
      smartflow_id: req.params.id,
      user_id: userId,
      conversation_id,
      input_data,
      mode,
    };

    res.json({
      success: true,
      data: (await engine.start(req.params.id, executionDto as any)).execution,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message },
    });
  }
});

export default router;
