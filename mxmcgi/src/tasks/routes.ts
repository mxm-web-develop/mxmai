import { Router, Request, Response } from 'express';
import type { TaskScope } from './types';
import { loadTaskDefinition } from './task-definition';
import { mergePlatformFieldsIntoFormSchema, PARALLEL_COUNT_KEY } from './platform-fields';
import { resolveTaskCreateUx } from './task-create-ux';
import { extractCreateGuide } from './create-guide';
import { runTaskV2 } from './task-engine';
import { ValidationError, ConfigurationError } from './errors';
import { RepositoryFactory } from '@mxmai/mxmdata';
import {
  handleTaskAdminList,
  handleTaskGetById,
  handleTaskListMine,
  handleTaskListByUser,
  handleTaskCancel,
  handleTaskRecover,
  handleTaskRetry,
  handleTaskDelete,
  handleTaskApproveReview,
  handleTaskRetryRenderedReviewClips,
  handleTaskRetryAlbumItem,
  handleTaskRemoveAlbumItem,
  handleTaskRemoveCollectionItem,
  handleTaskGetReviewDraft,
} from './task-http-handlers';

const router = Router();

function getUserId(req: Request): string | undefined {
  return (req.headers['x-user-id'] as string | undefined) ?? undefined;
}

function asScope(v: unknown): TaskScope | null {
  if (
    v === 'writing' ||
    v === 'outline' ||
    v === 'graph' ||
    v === 'audio' ||
    v === 'music' ||
    v === 'video' ||
    v === 'text'
  ) {
    return v;
  }
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

    const { template, row } = await loadTaskDefinition({ scope, taskKey, subtype, lang: 'zh' });
    const createUx = resolveTaskCreateUx(template.pipeline, template.formSchema);
    const createGuide = extractCreateGuide(template.pipeline);
    let schema = mergePlatformFieldsIntoFormSchema(template.formSchema, scope);
    // warp-gates：先不暴露「生成份数」，默认 1 份
    if (createUx === 'warp-gates' && schema.properties && typeof schema.properties === 'object') {
      const props = { ...(schema.properties as Record<string, unknown>) };
      delete props[PARALLEL_COUNT_KEY];
      schema = { ...schema, properties: props as typeof schema.properties };
    }
    const extra = (row.extra ?? {}) as Record<string, unknown>;
    const display =
      extra.display && typeof extra.display === 'object'
        ? (extra.display as Record<string, unknown>)
        : null;
    const taskLabel = display && typeof display.taskLabel === 'string' ? display.taskLabel : null;
    const subtypeLabel =
      display && typeof display.subtypeLabel === 'string' ? display.subtypeLabel : null;
    const taskLabelI18n =
      display?.taskLabelI18n && typeof display.taskLabelI18n === 'object'
        ? (display.taskLabelI18n as Record<string, string>)
        : null;
    const subtypeLabelI18n =
      display?.subtypeLabelI18n && typeof display.subtypeLabelI18n === 'object'
        ? (display.subtypeLabelI18n as Record<string, string>)
        : null;
    const form_options_i18n =
      row.form_options_i18n && typeof row.form_options_i18n === 'object'
        ? (row.form_options_i18n as Record<string, Record<string, string>>)
        : null;
    return res.json({
      success: true,
      data: {
        scope,
        taskKey,
        subtype,
        schema,
        uiSchema: template.uiSchema ?? null,
        taskLabel,
        subtypeLabel,
        taskLabelI18n,
        subtypeLabelI18n,
        form_options_i18n,
        createUx,
        createGuide,
      },
    });
  } catch (e) {
    if (e instanceof ConfigurationError) {
      return res.status(404).json({ success: false, code: e.code, error: e.message });
    }
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ success: false, error: msg });
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
      .map((r: any) => {
        const extra = r.extra && typeof r.extra === 'object' ? r.extra : null;
        const display = extra && typeof (extra as any).display === 'object' ? (extra as any).display : null;
        const taskLabel = display && typeof display.taskLabel === 'string' ? display.taskLabel : null;
        const subtypeLabel = display && typeof display.subtypeLabel === 'string' ? display.subtypeLabel : null;
        const description =
          display && typeof display.description === 'string' ? display.description : null;
        const taskLabelI18n =
          display?.taskLabelI18n && typeof display.taskLabelI18n === 'object'
            ? (display.taskLabelI18n as Record<string, string>)
            : null;
        const subtypeLabelI18n =
          display?.subtypeLabelI18n && typeof display.subtypeLabelI18n === 'object'
            ? (display.subtypeLabelI18n as Record<string, string>)
            : null;
        const descriptionI18n =
          display?.descriptionI18n && typeof display.descriptionI18n === 'object'
            ? (display.descriptionI18n as Record<string, string>)
            : null;
        return {
          taskKey: String(r.type),
          subtype: r.subtype ?? null,
          taskLabel,
          subtypeLabel,
          description,
          taskLabelI18n,
          subtypeLabelI18n,
          descriptionI18n,
          updated_at: r.updated_at,
        };
      });

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
    if (err?.code === 'BILLING_MISCONFIGURED') {
      return res.status(503).json({
        success: false,
        code: 'BILLING_MISCONFIGURED',
        error: err.message || '该业务由于计费模块错误，暂不可用',
      });
    }
    if (err?.code === 'INSUFFICIENT_BALANCE') {
      return res.status(402).json({
        success: false,
        code: 'INSUFFICIENT_BALANCE',
        error: err.message,
        estimatedTokens: err.estimatedTokens,
        currentBalance: err.currentBalance,
      });
    }
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ success: false, error: msg });
  }
});

/**
 * POST /api/v2/tasks/estimate — 生成前预估 MXM-TOKEN
 * body.estimatePhase: create（默认，审核前）| after_review（审核后后续）| full
 */
router.post('/estimate', async (req: Request, res: Response) => {
  try {
    const body = req.body as any;
    const scope = asScope(body?.scope);
    const taskKey = typeof body?.taskKey === 'string' ? body.taskKey : '';
    const subtype = body?.subtype != null ? String(body.subtype) : null;
    const params = body?.params && typeof body.params === 'object' ? body.params : {};
    const estimatePhaseRaw = typeof body?.estimatePhase === 'string' ? body.estimatePhase : 'create';
    const estimatePhase =
      estimatePhaseRaw === 'after_review' || estimatePhaseRaw === 'full' ? estimatePhaseRaw : 'create';
    if (!scope || !taskKey) {
      return res.status(400).json({ success: false, error: 'scope/taskKey are required' });
    }
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Missing x-user-id header' });
    }

    const { estimateTaskV2 } = await import('./estimate-task-v2');
    const data = await estimateTaskV2({
      scope,
      taskKey,
      subtype,
      params,
      userId,
      estimatePhase,
    });
    if (data.code === 'BILLING_MISCONFIGURED') {
      return res.status(503).json({
        success: false,
        code: data.code,
        error: data.message,
        data,
      });
    }
    return res.json({ success: true, data });
  } catch (e) {
    const err = e as any;
    if (err instanceof ConfigurationError) {
      return res.status(404).json({
        success: false,
        code: err.code || 'CONFIGURATION_ERROR',
        error: err.message,
      });
    }
    if (err?.code === 'BILLING_MISCONFIGURED') {
      return res.status(503).json({
        success: false,
        code: 'BILLING_MISCONFIGURED',
        error: err.message || '该业务由于计费模块错误，暂不可用',
      });
    }
    const msg = e instanceof Error ? e.message : String(e);
    if (/未配置.+业务模型/.test(msg)) {
      return res.status(404).json({
        success: false,
        code: 'CONFIGURATION_ERROR',
        error: msg,
      });
    }
    return res.status(500).json({ success: false, error: msg });
  }
});

/** GET /api/v2/tasks/admin — Admin 任务列表 */
router.get('/admin', (req, res) => void handleTaskAdminList(req, res));

/** GET /api/v2/tasks/by-user/:userId */
router.get('/by-user/:userId', (req, res) => void handleTaskListByUser(req, res));

/** GET /api/v2/tasks — 当前用户任务列表 */
router.get('/', (req, res) => void handleTaskListMine(req, res));

/** GET /api/v2/tasks/:taskId */
router.get('/:taskId', (req, res) => void handleTaskGetById(req, res));

/** POST /api/v2/tasks/:taskId/cancel */
router.post('/:taskId/cancel', (req, res) => void handleTaskCancel(req, res));

/** POST|GET /api/v2/tasks/:taskId/recover */
router.post('/:taskId/recover', (req, res) => void handleTaskRecover(req, res));
router.get('/:taskId/recover', (req, res) => void handleTaskRecover(req, res));

/** POST|GET /api/v2/tasks/:taskId/retry */
router.post('/:taskId/retry', (req, res) => void handleTaskRetry(req, res));
router.get('/:taskId/retry', (req, res) => void handleTaskRetry(req, res));

/** GET /api/v2/tasks/:taskId/review-draft — 读取人工审核草稿（不落库） */
router.get('/:taskId/review-draft', (req, res) => void handleTaskGetReviewDraft(req, res));

/** POST /api/v2/tasks/:taskId/approve-review — 人工审核通过后继续管线 */
router.post('/:taskId/approve-review', (req, res) => void handleTaskApproveReview(req, res));

/** POST /api/v2/tasks/:taskId/retry-album-item — 图集失败单项重试 */
router.post('/:taskId/retry-album-item', (req, res) =>
  void handleTaskRetryAlbumItem(req, res)
);

/** POST /api/v2/tasks/:taskId/remove-album-item — 图集单项删除 */
router.post('/:taskId/remove-album-item', (req, res) =>
  void handleTaskRemoveAlbumItem(req, res)
);

/** POST /api/v2/tasks/:taskId/remove-collection-item — 写作文集单项删除 */
router.post('/:taskId/remove-collection-item', (req, res) =>
  void handleTaskRemoveCollectionItem(req, res)
);

/** POST /api/v2/tasks/:taskId/retry-rendered-review-clips — 成片审核阶段重试失败片段 */
router.post('/:taskId/retry-rendered-review-clips', (req, res) =>
  void handleTaskRetryRenderedReviewClips(req, res)
);

/** DELETE /api/v2/tasks/:taskId */
router.delete('/:taskId', (req, res) => void handleTaskDelete(req, res));

export default router;
