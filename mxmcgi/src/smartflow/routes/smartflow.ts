/**
 * Smartflow API 路由
 */

import { Router, Request, Response } from 'express';
import { smartflowRepository, InMemorySmartflowRepository } from '../core/engine/repository';
import { executionRepository } from '../core/engine/executionRepository';
import { SmartflowEngine } from '../core/engine/engine';
import { PREDEFINED_SMARTFLOWS } from '../core/photographyV2';
import { PREDEFINED_EXAMPLE_FLOWS } from '../core/predefined-flows';
import { CreateSmartflowDto, UpdateSmartflowDto } from '../core/models/types';

const router = Router();

// 初始化引擎
const engine = new SmartflowEngine(smartflowRepository, executionRepository);

const ALLOWED_NODE_TYPES = new Set([
  'start',
  'end',
  'model', // 业务
  'tools',
  'condition',
  'variable',
  'loop',
]);

function validateSmartflowSchema(schema: any): { ok: true } | { ok: false; message: string } {
  if (!schema || typeof schema !== 'object') return { ok: false, message: 'schema 必须是对象' };
  const nodes = schema.nodes;
  const edges = schema.edges;
  if (!Array.isArray(nodes) || !Array.isArray(edges)) {
    return { ok: false, message: 'schema 必须包含 nodes / edges 数组' };
  }

  const ids = new Set<string>();
  let hasStart = false;
  let hasEnd = false;

  for (const n of nodes) {
    if (!n || typeof n !== 'object') return { ok: false, message: 'nodes 中存在非对象节点' };
    if (typeof n.id !== 'string' || !n.id.trim()) return { ok: false, message: '节点 id 必须是非空字符串' };
    if (ids.has(n.id)) return { ok: false, message: `节点 id 重复: ${n.id}` };
    ids.add(n.id);

    const t = String(n.type ?? '');
    if (!ALLOWED_NODE_TYPES.has(t)) {
      return { ok: false, message: `不支持的节点类型: ${t}（仅允许 ${Array.from(ALLOWED_NODE_TYPES).join(', ')}）` };
    }
    if (t === 'start') hasStart = true;
    if (t === 'end') hasEnd = true;
  }

  if (!hasStart) return { ok: false, message: 'schema 必须包含 start 节点' };
  if (!hasEnd) return { ok: false, message: 'schema 必须包含 end 节点' };

  for (const e of edges) {
    if (!e || typeof e !== 'object') return { ok: false, message: 'edges 中存在非对象边' };
    const from = String(e.from ?? '');
    const to = String(e.to ?? '');
    if (!from || !to) return { ok: false, message: 'edge 必须包含 from/to' };
    if (!ids.has(from)) return { ok: false, message: `edge.from 不存在: ${from}` };
    if (!ids.has(to)) return { ok: false, message: `edge.to 不存在: ${to}` };
  }

  return { ok: true };
}

// 初始化预定义工作流
async function initPredefinedSmartflows() {
  for (const sf of PREDEFINED_SMARTFLOWS) {
    const existing = await smartflowRepository.findById(sf.id);
    if (!existing) {
      await smartflowRepository.create(sf as any);
      console.log(`[mxmcgi/smartflow] Created predefined smartflow: ${sf.id}`);
    }
  }
  for (const sf of PREDEFINED_EXAMPLE_FLOWS) {
    const existing = await smartflowRepository.findById(sf.id);
    if (!existing) {
      await smartflowRepository.create(sf as any);
      console.log(`[mxmcgi/smartflow] Created example smartflow: ${sf.id}`);
    }
  }
}
initPredefinedSmartflows();

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

    const schemaCheck = validateSmartflowSchema(dto.schema as any);
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
      const schemaCheck = validateSmartflowSchema(dto.schema as any);
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

    const result = await engine.execute(req.params.id, executionDto as any);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'EXECUTION_ERROR', message: result.error },
        data: result.execution,
      });
    }

    res.json({
      success: true,
      data: result.execution,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message },
    });
  }
});

export default router;
