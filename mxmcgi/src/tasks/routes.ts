import { Router, Request, Response } from 'express';
import type { TaskScope } from './types';
import { loadTaskDefinition } from './task-definition';
import { runTaskV2 } from './task-engine';
import { ValidationError, ConfigurationError } from './errors';
import { RepositoryFactory } from '@mxmai/mxmdata';

const router = Router();

function getUserId(req: Request): string | undefined {
  return (req.headers['x-user-id'] as string | undefined) ?? undefined;
}

function asScope(v: unknown): TaskScope | null {
  if (v === 'writing' || v === 'outline' || v === 'graph' || v === 'audio' || v === 'video') return v;
  return null;
}

/**
 * GET /api/v2/tasks/form-config?scope=writing&taskKey=xxx&subtype=yyy
 */
router.get('/form-config', async (req: Request, res: Response) => {
  try {
    const scope = asScope(req.query.scope);
    const taskKey = String(req.query.taskKey || '');
    const subtype = req.query.subtype != null ? String(req.query.subtype) : null;
    if (!scope || !taskKey) {
      return res.status(400).json({ success: false, error: 'scope/taskKey are required' });
    }

    const { template } = await loadTaskDefinition({ scope, taskKey, subtype, lang: 'zh' });
    return res.json({
      success: true,
      data: {
        scope,
        taskKey,
        subtype,
        schema: template.formSchema,
        uiSchema: template.uiSchema ?? null,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const code = (e as any)?.code;
    const status = code === 'TASK_CONFIG_ERROR' ? 404 : 500;
    return res.status(status).json({ success: false, error: msg });
  }
});

/**
 * GET /api/v2/tasks/form-config/list?scope=writing
 * 列出当前 scope 下所有可用 taskKey（type）/subtype 组合
 */
router.get('/form-config/list', async (req: Request, res: Response) => {
  try {
    const scope = asScope(req.query.scope);
    if (!scope) return res.status(400).json({ success: false, error: 'scope is required' });

    const repo = RepositoryFactory.createPromptEngineeringConfigRepository();
    const list = await repo.list({ scope, limit: 500, offset: 0 });
    const items = (list.items || [])
      .filter((r: any) => r && r.is_active !== false)
      .map((r: any) => ({
        taskKey: String(r.type),
        subtype: r.subtype ?? null,
        updated_at: r.updated_at,
      }));

    return res.json({ success: true, data: { scope, items } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ success: false, error: msg });
  }
});

/**
 * POST /api/v2/tasks/run
 */
router.post('/run', async (req: Request, res: Response) => {
  try {
    const body = req.body as any;
    const scope = asScope(body?.scope);
    const taskKey = typeof body?.taskKey === 'string' ? body.taskKey : '';
    const subtype = body?.subtype != null ? String(body.subtype) : null;
    const params = (body?.params && typeof body.params === 'object') ? body.params : null;
    if (!scope || !taskKey || !params) {
      return res.status(400).json({ success: false, error: 'scope/taskKey/params are required' });
    }
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Missing x-user-id header' });
    }

    const result = await runTaskV2(
      { scope, taskKey, subtype, params, options: body?.options },
      userId
    );
    return res.json(result);
  } catch (e) {
    const err = e as any;
    if (err instanceof ValidationError) {
      return res.status(400).json({ success: false, code: err.code, error: err.message, details: err.details ?? null });
    }
    if (err instanceof ConfigurationError) {
      return res.status(404).json({ success: false, code: err.code, error: err.message });
    }
    if ((err as any)?.code === 'INSUFFICIENT_BALANCE') {
      return res.status(402).json({ success: false, code: 'INSUFFICIENT_BALANCE', error: err.message });
    }
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ success: false, error: msg });
  }
});

export default router;

