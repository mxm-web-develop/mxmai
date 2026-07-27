/**
 * Admin：写作质量评估 API
 * 挂载于 /system/admin/quality-eval
 */

import { Router, Request, Response } from 'express';
import { reattributeRun, runQualityEval, qualityEvalStore } from './service';
import type { QualityEvalSourceKind, QualityEvalSourceRef } from './types';
import {
  DEFAULT_QUALITY_EVAL_MODEL,
  DEFAULT_QUALITY_EVAL_PROVIDER,
} from './types';

const router = Router();

async function requireAdmin(req: Request, res: Response, next: () => void): Promise<void> {
  try {
    const userRole = req.headers['x-user-role'] as string | undefined;
    if (userRole === 'admin') {
      next();
      return;
    }
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
      res.status(403).json({ success: false, error: 'Admin access required' });
      return;
    }
    const { RepositoryFactory } = await import('@mxmai/mxmdata');
    const userRepo = RepositoryFactory.createUserRepository();
    const user = await userRepo.findById(userId);
    if (user && user.role === 'admin') {
      next();
      return;
    }
    res.status(403).json({ success: false, error: 'Admin access required' });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to check admin' });
  }
}

router.use(requireAdmin);

/** GET /system/admin/quality-eval/defaults — 默认模型选项 */
router.get('/defaults', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      provider: DEFAULT_QUALITY_EVAL_PROVIDER,
      modelKey: DEFAULT_QUALITY_EVAL_MODEL,
      modelOptions: [
        { provider: 'atlascloud', modelKey: 'openai/gpt-5.6-luna', label: 'GPT 5.6 Luna' },
        { provider: 'atlascloud', modelKey: 'openai/gpt-5.6-terra', label: 'GPT 5.6 Terra（默认）' },
        { provider: 'atlascloud', modelKey: 'openai/gpt-5.6-sol', label: 'GPT 5.6 Sol' },
      ],
    },
  });
});

/** GET /system/admin/quality-eval/rubrics?scope=writing */
router.get('/rubrics', async (req: Request, res: Response) => {
  try {
    const scope = String(req.query.scope || 'writing');
    const rubrics = await qualityEvalStore.listRubrics(scope);
    res.json({ success: true, data: rubrics });
  } catch (e) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

/** PUT /system/admin/quality-eval/rubrics — upsert 单条 */
router.put('/rubrics', async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const rubric = await qualityEvalStore.upsertRubric({
      scope: body.scope || 'writing',
      task_key: body.task_key || body.taskKey,
      subtype: body.subtype,
      dimensions: body.dimensions,
      business_brief: body.business_brief ?? body.businessBrief,
      provider: body.provider,
      model_key: body.model_key || body.modelKey,
      auto_on_complete: body.auto_on_complete ?? body.autoOnComplete,
      is_active: body.is_active ?? body.isActive,
    });
    res.json({ success: true, data: rubric });
  } catch (e) {
    res.status(400).json({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

/** GET /system/admin/quality-eval/runs */
router.get('/runs', async (req: Request, res: Response) => {
  try {
    const result = await qualityEvalStore.listRuns({
      scope: req.query.scope ? String(req.query.scope) : undefined,
      taskKey: req.query.taskKey ? String(req.query.taskKey) : undefined,
      subtype: req.query.subtype ? String(req.query.subtype) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      offset: req.query.offset ? Number(req.query.offset) : undefined,
    });
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

/** GET /system/admin/quality-eval/runs/:id */
router.get('/runs/:id', async (req: Request, res: Response) => {
  try {
    const run = await qualityEvalStore.getRunById(String(req.params.id));
    if (!run) {
      res.status(404).json({ success: false, error: 'Not found' });
      return;
    }
    res.json({ success: true, data: run });
  } catch (e) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST /system/admin/quality-eval/runs — 发起评估（同步，可能较久） */
router.post('/runs', async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const sourceKind = String(body.sourceKind || body.source_kind || '') as QualityEvalSourceKind;
    if (!['task', 'folder_item', 'paste'].includes(sourceKind)) {
      res.status(400).json({ success: false, error: 'sourceKind 须为 task | folder_item | paste' });
      return;
    }
    const taskKey = String(body.taskKey || body.task_key || '').trim();
    const subtype = String(body.subtype || '').trim();
    if (!taskKey || !subtype) {
      res.status(400).json({ success: false, error: 'taskKey 与 subtype 必填' });
      return;
    }

    const sourceRef = (body.sourceRef || body.source_ref || null) as QualityEvalSourceRef | null;
    const modelOverride =
      body.modelOverride || body.model_override
        ? {
            provider: (body.modelOverride || body.model_override).provider,
            modelKey: (body.modelOverride || body.model_override).modelKey || (body.modelOverride || body.model_override).model_key,
          }
        : undefined;

    const createdBy = (req.headers['x-user-id'] as string | undefined) || null;

    const run = await runQualityEval({
      scope: body.scope || 'writing',
      taskKey,
      subtype,
      sourceKind,
      sourceRef,
      text: body.text,
      modelOverride,
      createdBy,
    });

    res.json({ success: true, data: run });
  } catch (e: any) {
    const run = e?.run;
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : String(e),
      data: run || undefined,
    });
  }
});

/** POST /system/admin/quality-eval/runs/:id/reattribute */
router.post('/runs/:id/reattribute', async (req: Request, res: Response) => {
  try {
    const run = await reattributeRun(String(req.params.id));
    res.json({ success: true, data: run });
  } catch (e) {
    res.status(400).json({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

export default router;
