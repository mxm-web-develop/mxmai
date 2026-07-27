/**
 * 任务 HTTP 处理（列表 / 详情 / 取消 / 恢复 / 重试 / 删除）
 * 供 /api/v2/tasks 使用；原 /api/v1/cgi-tasks 已移除。
 */

import type { Request, Response } from 'express';
import { taskExecutor } from '../task/task-executor';
import type { TaskType } from '../task/types';
import { sanitizeBase64InObject } from '../task/reference-image';
import { toTaskListSummary } from '../task/task-list-summary';
import { filterUserFacingListTasks } from '../task/task-list-visibility';
import { hasPendingManualReviewGate } from '../task/task-status-normalize';

function mapTaskForListResponse(task: unknown): Record<string, unknown> {
  const row = task as Record<string, unknown>;
  const sanitized = {
    ...row,
    requestParams: pruneDuplicateGraphReferenceFields(
      sanitizeBase64InObject(row.requestParams)
    ),
  };
  return toTaskListSummary(sanitized);
}

/** 已有合并 referenceImage 时，从返回体中省略与 reference 重复的 model_images / clothing_images / environment_images */
export function pruneDuplicateGraphReferenceFields(requestParams: unknown): unknown {
  if (!requestParams || typeof requestParams !== 'object') return requestParams;
  const rp = { ...(requestParams as Record<string, unknown>) };
  const inner = rp.params;
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
    const p = { ...(inner as Record<string, unknown>) };
    const ref = p.referenceImage;
    const hasRef =
      (Array.isArray(ref) && ref.length > 0) ||
      (typeof ref === 'string' && (ref as string).length > 0);
    if (hasRef) {
      delete p.model_images;
      delete p.clothing_images;
      delete p.environment_images;
    }
    rp.params = p;
  }
  return rp;
}

export async function isAdminUser(req: Request): Promise<boolean> {
  try {
    const userRole = req.headers['x-user-role'] as string | undefined;
    if (userRole === 'admin') {
      return true;
    }

    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
      return false;
    }

    try {
      const { RepositoryFactory } = await import('@mxmai/mxmdata');
      const userRepo = RepositoryFactory.createUserRepository();
      const user = await userRepo.findById(userId);

      if (user && user.role === 'admin') {
        return true;
      }
    } catch (dbError) {
      console.warn('[TaskHttpHandlers] 查询用户角色失败:', dbError);
    }

    return false;
  } catch (error) {
    console.warn('[TaskHttpHandlers] 检查管理员权限失败:', error);
    return false;
  }
}

export async function handleTaskAdminList(req: Request, res: Response): Promise<void> {
  try {
    const isAdmin = await isAdminUser(req);
    if (!isAdmin) {
      res.status(403).json({
        success: false,
        error: 'Admin access required',
      });
      return;
    }

    const {
      type,
      status,
      model,
      userId,
      limit = 20,
      offset = 0,
      startDate,
      endDate,
      includeDeleted,
    } = req.query;

    const taskManager = taskExecutor.getTaskManager();
    const response = await taskManager.listTasks({
      userId: typeof userId === 'string' && userId.length > 0 ? userId : undefined,
      type: type as TaskType | undefined,
      status: status as any,
      model: model as string | undefined,
      limit: Number(limit),
      offset: Number(offset),
      includeDeleted: includeDeleted === 'true',
      startDate: typeof startDate === 'string' && startDate.length > 0 ? startDate : undefined,
      endDate: typeof endDate === 'string' && endDate.length > 0 ? endDate : undefined,
    });

    const userIds = [...new Set(response.tasks.map((t) => t.metadata?.userId).filter(Boolean))] as string[];
    const userIdToName = new Map<string, string>();
    try {
      const { RepositoryFactory } = await import('@mxmai/mxmdata');
      const userRepo = RepositoryFactory.createUserRepository();
      for (const uid of userIds) {
        const user = await userRepo.findById(uid);
        userIdToName.set(uid, user?.username ?? uid);
      }
    } catch (err) {
      console.warn('[TaskHttpHandlers] 解析用户名失败，列表仍返回 userId:', err);
    }
    const tasksWithUserNames = response.tasks.map((t) => ({
      ...t,
      metadata: {
        ...t.metadata,
        userName: t.metadata?.userId ? userIdToName.get(t.metadata.userId) ?? t.metadata.userId : undefined,
      },
    }));

    res.json({
      success: true,
      data: {
        ...response,
        tasks: tasksWithUserNames.map((t) => mapTaskForListResponse(t)),
      },
    });
  } catch (error) {
    console.error('[TaskHttpHandlers] Admin 查询任务列表失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function handleTaskGetById(req: Request, res: Response): Promise<void> {
  try {
    const { taskId } = req.params;
    const userId = req.headers['x-user-id'] as string | undefined;
    const { type } = req.query;

    const isAdmin = await isAdminUser(req);

    const taskManager = taskExecutor.getTaskManager();
    const response = await taskManager.getTaskForApi(taskId, isAdmin);

    if (userId && response.task.metadata.userId !== userId) {
      res.status(403).json({
        success: false,
        error: 'Forbidden: You can only view your own tasks',
      });
      return;
    }

    if (type) {
      const expectedType = type as TaskType;
      if (response.task.type !== expectedType) {
        res.status(404).json({
          success: false,
          error: `Task type mismatch: expected ${expectedType}, got ${response.task.type}`,
        });
        return;
      }
    }

    const sanitizedTask = {
      ...response.task,
      requestParams: pruneDuplicateGraphReferenceFields(
        sanitizeBase64InObject(response.task.requestParams)
      ),
    };

    res.json({
      success: true,
      data: sanitizedTask,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({
        success: false,
        error: error.message,
      });
      return;
    }
    console.error('[TaskHttpHandlers] 查询任务失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function handleTaskListMine(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Missing x-user-id header',
      });
      return;
    }

    const {
      type,
      status,
      model,
      limit = 20,
      offset = 0,
      startDate,
      endDate,
      creationSource,
    } = req.query;

    const creationSourceFilter =
      creationSource === 'web' || creationSource === 'open_api' ? creationSource : undefined;

    const taskManager = taskExecutor.getTaskManager();
    const response = await taskManager.listTasks({
      userId,
      type: type as TaskType | undefined,
      status: status as any,
      model: model as string | undefined,
      limit: Number(limit),
      offset: Number(offset),
      startDate: typeof startDate === 'string' && startDate.length > 0 ? startDate : undefined,
      endDate: typeof endDate === 'string' && endDate.length > 0 ? endDate : undefined,
      creationSource: creationSourceFilter,
    });

    const visibleTasks = filterUserFacingListTasks(response.tasks);

    res.json({
      success: true,
      data: {
        ...response,
        tasks: visibleTasks.map((t) => mapTaskForListResponse(t)),
        count: visibleTasks.length,
        total: Math.max(0, response.total - (response.tasks.length - visibleTasks.length)),
      },
    });
  } catch (error) {
    console.error('[TaskHttpHandlers] 查询任务列表失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function handleTaskListByUser(req: Request, res: Response): Promise<void> {
  try {
    const { userId } = req.params;
    const {
      type,
      status,
      model,
      limit = 20,
      offset = 0,
    } = req.query;

    if (!userId) {
      res.status(400).json({
        success: false,
        error: 'Missing userId in path params',
      });
      return;
    }

    const taskManager = taskExecutor.getTaskManager();
    const response = await taskManager.listTasks({
      userId,
      type: type as TaskType | undefined,
      status: status as any,
      model: model as string | undefined,
      limit: Number(limit),
      offset: Number(offset),
    });

    res.json({
      success: true,
      data: {
        ...response,
        tasks: response.tasks.map((t) => mapTaskForListResponse(t)),
      },
    });
  } catch (error) {
    console.error('[TaskHttpHandlers] 按用户查询任务列表失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function handleTaskCancel(req: Request, res: Response): Promise<void> {
  try {
    const { taskId } = req.params;
    const userId = req.headers['x-user-id'] as string | undefined;
    const isAdmin = await isAdminUser(req);

    const taskManager = taskExecutor.getTaskManager();
    const taskResponse = await taskManager.getTask(taskId);

    if (!isAdmin && userId && taskResponse.task.metadata.userId !== userId) {
      res.status(403).json({
        success: false,
        error: 'Forbidden: You can only cancel your own tasks',
      });
      return;
    }

    if (['completed', 'failed', 'cancelled'].includes(taskResponse.task.status)) {
      res.status(400).json({
        success: false,
        error: `Cannot cancel task in status: ${taskResponse.task.status}`,
      });
      return;
    }

    await taskManager.cancelTask(taskId);

    if (taskResponse.task.status === 'awaiting_review') {
      const { deleteAllManualReviewDrafts } = await import('../tasks/manual-review-store');
      await deleteAllManualReviewDrafts(taskId);
    }

    res.json({
      success: true,
      message: 'Task cancelled successfully',
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({
        success: false,
        error: error.message,
      });
      return;
    }
    console.error('[TaskHttpHandlers] 取消任务失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function handleTaskRecover(req: Request, res: Response): Promise<void> {
  try {
    const { taskId } = req.params;
    const userId = req.headers['x-user-id'] as string | undefined;
    const isAdmin = await isAdminUser(req);

    const taskManager = taskExecutor.getTaskManager();
    const taskResponse = await taskManager.getTask(taskId);

    if (!isAdmin && userId && taskResponse.task.metadata.userId !== userId) {
      res.status(403).json({
        success: false,
        error: 'Forbidden: You can only recover your own tasks',
      });
      return;
    }

    if (taskResponse.task.status !== 'processing') {
      res.status(400).json({
        success: false,
        error: `Cannot recover task in status: ${taskResponse.task.status}. Only processing tasks can be recovered.`,
      });
      return;
    }

    const { taskRecoveryService } = await import('../task/task-recovery');
    await taskRecoveryService.recoverTask(taskId);

    res.json({
      success: true,
      message: 'Task recovered successfully',
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({
        success: false,
        error: error.message,
      });
      return;
    }
    console.error('[TaskHttpHandlers] 恢复任务失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function handleTaskRetry(req: Request, res: Response): Promise<void> {
  try {
    const { taskId } = req.params;
    const userId = req.headers['x-user-id'] as string | undefined;
    const isAdmin = await isAdminUser(req);

    const taskManager = taskExecutor.getTaskManager();
    const taskResponse = await taskManager.getTask(taskId);

    const task = taskResponse.task;

    if (!isAdmin && userId && task.metadata.userId !== userId) {
      res.status(403).json({
        success: false,
        error: 'Forbidden: You can only retry your own tasks',
      });
      return;
    }

    const status = task.status;
    const progressStatus = task.progress?.status;
    const hasError = !!task.progress?.error;

    const canRetry =
      status === 'processing' ||
      status === 'failed' ||
      progressStatus === 'failed' ||
      (status === 'completed' && hasError);

    if (!canRetry) {
      res.status(400).json({
        success: false,
        error: `Cannot retry task in status: ${status}. Only failed or processing tasks can be retried.`,
      });
      return;
    }

    const { taskRecoveryService } = await import('../task/task-recovery');
    await taskRecoveryService.retryTaskById(taskId);

    res.json({
      success: true,
      message: 'Task retry initiated successfully',
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({
        success: false,
        error: error.message,
      });
      return;
    }
    console.error('[TaskHttpHandlers] 重试任务失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function handleTaskGetReviewDraft(req: Request, res: Response): Promise<void> {
  try {
    const { taskId } = req.params;
    const gateIdQuery = typeof req.query.gateId === 'string' ? req.query.gateId.trim() : '';
    const userId = req.headers['x-user-id'] as string | undefined;
    const isAdmin = await isAdminUser(req);

    const taskManager = taskExecutor.getTaskManager();
    const taskResponse = await taskManager.getTask(taskId);
    const task = taskResponse.task;

    if (!isAdmin && userId && task.metadata.userId !== userId) {
      res.status(403).json({ success: false, error: 'Forbidden' });
      return;
    }

    if (task.status !== 'awaiting_review' && !hasPendingManualReviewGate(task)) {
      res.status(400).json({
        success: false,
        error: `Task is not awaiting review (status=${task.status})`,
      });
      return;
    }

    const { resolveGateIdFromTaskMetadata } = await import('./manual-review');
    const { getManualReviewDraft } = await import('./manual-review-store');

    const gateId = gateIdQuery || resolveGateIdFromTaskMetadata(task.metadata as Record<string, unknown>);
    if (!gateId) {
      res.status(400).json({
        success: false,
        error: 'gateId is required (query param or metadata.manualReviewGate.gateId)',
      });
      return;
    }

    let draft = await getManualReviewDraft(taskId, gateId);
    let draftRecovered = false;
    if (!draft) {
      const { reconstructReviewDraftFromTask } = await import('./manual-review-draft-reconstruct');
      const { setManualReviewDraft } = await import('./manual-review-store');
      draft = reconstructReviewDraftFromTask(
        {
          requestParams: task.requestParams as Record<string, unknown>,
          metadata: task.metadata as Record<string, unknown>,
        },
        gateId
      );
      if (draft) {
        draftRecovered = true;
        void setManualReviewDraft(taskId, gateId, draft).catch((e) => {
          console.warn('[TaskHttpHandlers] 恢复审核草稿写回 Redis 失败:', e);
        });
      }
    }

    // writing-chat：打开弹窗不得再跑 LLM。缺交互卡字段时从合同同步补齐。
    if (draft?.kind === 'writing-chat') {
      const hasFields =
        (Array.isArray(draft.interactiveCardFields) && draft.interactiveCardFields.length > 0) ||
        (Array.isArray(draft.metadata?.fields) && (draft.metadata!.fields as unknown[]).length > 0);
      if (!hasFields && draft.json != null) {
        try {
          const {
            buildWritingChatInteractiveFields,
            buildDeterministicWritingChatSummary,
          } = await import('./writing-chat-review-fields');
          const { setManualReviewDraft } = await import('./manual-review-store');
          const fields = buildWritingChatInteractiveFields(draft.json, {
            step: 'manualReview',
            params: { kind: 'writing-chat', id: gateId },
          }, gateId);
          draft = {
            ...draft,
            interactiveCardFields: fields,
            summary:
              String(draft.summary ?? '').trim() ||
              buildDeterministicWritingChatSummary(draft.json, {
                label: draft.label,
                hint: draft.hint,
              }),
            metadata: {
              ...(draft.metadata ?? {}),
              ui: 'writing-chat',
              fields,
            },
          };
          void setManualReviewDraft(taskId, gateId, draft).catch((e) => {
            console.warn('[TaskHttpHandlers] writing-chat 字段补齐写回 Redis 失败:', e);
          });
        } catch (e) {
          console.warn(
            '[TaskHttpHandlers] writing-chat 字段补齐失败:',
            e instanceof Error ? e.message : e
          );
        }
      }
    }

    const gateMeta = task.metadata.manualReviewGate as Record<string, unknown> | undefined;

    res.json({
      success: true,
      data: {
        taskId,
        gateId,
        draft,
        draftRecovered,
        gate: gateMeta ?? null,
        text: draft?.text ?? '',
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({ success: false, error: error.message });
      return;
    }
    console.error('[TaskHttpHandlers] 获取审核草稿失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function handleTaskApproveReview(req: Request, res: Response): Promise<void> {
  try {
    const { taskId } = req.params;
    const userId = req.headers['x-user-id'] as string | undefined;
    const isAdmin = await isAdminUser(req);

    const taskManager = taskExecutor.getTaskManager();
    const taskResponse = await taskManager.getTask(taskId);
    const task = taskResponse.task;

    if (!isAdmin && userId && task.metadata.userId !== userId) {
      res.status(403).json({
        success: false,
        error: 'Forbidden: You can only approve your own tasks',
      });
      return;
    }

    if (task.status !== 'awaiting_review' && !hasPendingManualReviewGate(task)) {
      res.status(400).json({
        success: false,
        error: `Cannot approve task in status: ${task.status}. Only awaiting_review tasks can be approved.`,
      });
      return;
    }

    const approved = req.body?.approved !== false;
    if (!approved) {
      res.status(400).json({ success: false, error: 'approved must be true' });
      return;
    }

    const reviewText =
      typeof req.body?.reviewText === 'string'
        ? req.body.reviewText
        : typeof req.body?.text === 'string'
          ? req.body.text
          : '';
    const reviewJson = req.body?.reviewJson;

    const {
      applyApprovedManualReview,
      resolveGateIdFromTaskMetadata,
      resolveManualReviewStepFromTemplate,
    } = await import('./manual-review');
    const { getManualReviewDraft, deleteManualReviewDraft } = await import('./manual-review-store');
    const { loadTaskDefinition } = await import('./task-definition');

    const gateIdBody = typeof req.body?.gateId === 'string' ? req.body.gateId.trim() : '';
    const gateId =
      gateIdBody || resolveGateIdFromTaskMetadata(task.metadata as Record<string, unknown>);
    if (!gateId) {
      res.status(400).json({
        success: false,
        error: 'gateId is required (body.gateId or metadata.manualReviewGate.gateId)',
      });
      return;
    }

    const storedDraft = await getManualReviewDraft(taskId, gateId);
    const gateMeta = task.metadata.manualReviewGate as
      | import('./manual-review-types').ManualReviewGateInfo
      | undefined;

    const reviewPayload: import('./manual-review-types').ReviewDraftPayload = storedDraft ?? {
      version: 1,
      gateId,
      phase: gateMeta?.phase ?? 'pre',
      kind: 'text',
      text: reviewText.trim(),
      editable: true,
    };

    if (reviewText.trim()) {
      reviewPayload.text = reviewText.trim();
    }
    if (reviewJson !== undefined) {
      reviewPayload.json = reviewJson;
      const gateKind = gateMeta?.kind;
      const draftKind = storedDraft?.kind;
      if (gateKind === 'video-timeline' || draftKind === 'video-timeline') {
        reviewPayload.kind = 'video-timeline';
      } else if (reviewPayload.kind === 'text') {
        reviewPayload.kind = 'json';
      }
    }

    if (reviewPayload.kind === 'video-timeline' && reviewPayload.json == null) {
      res.status(400).json({ success: false, error: 'video-timeline reviewJson 不能为空' });
      return;
    }

    if (reviewPayload.kind === 'text' && !(reviewPayload.text ?? '').trim()) {
      res.status(400).json({ success: false, error: 'reviewText is required' });
      return;
    }

    let reviewStep: import('./types').PipelineStep | null = null;
    const taskParamsForReview = task.requestParams as Record<string, any>;
    const taskV2ForReview = (taskParamsForReview.taskV2 ?? task.metadata.taskV2) as
      | { scope?: string; taskKey?: string; subtype?: string | null }
      | undefined;

    if (taskV2ForReview?.scope && taskV2ForReview.taskKey && gateMeta) {
      const { row, template } = await loadTaskDefinition({
        scope: taskV2ForReview.scope as import('./types').TaskScope,
        taskKey: taskV2ForReview.taskKey,
        subtype: taskV2ForReview.subtype ?? null,
      });
      reviewStep = resolveManualReviewStepFromTemplate(
        template,
        taskV2ForReview.scope,
        gateMeta,
        (row.extra ?? null) as Record<string, unknown> | null
      );
    }

    if (reviewPayload.kind === 'video-timeline' && reviewPayload.json != null) {
      const { validateRenderedReviewApproval } = await import(
        '../core/video-edit/clip-render-readiness'
      );
      try {
        validateRenderedReviewApproval(reviewPayload.json, reviewStep);
      } catch (validationErr) {
        res.status(400).json({
          success: false,
          error: validationErr instanceof Error ? validationErr.message : String(validationErr),
        });
        return;
      }
    }

    const draftFromStore = reviewPayload.text ?? '';
    if (
      draftFromStore.length > (reviewPayload.text ?? '').trim().length + 32 &&
      reviewPayload.kind === 'text'
    ) {
      reviewPayload.text = draftFromStore;
    }

    const taskParams = taskParamsForReview;

    const nextParams = applyApprovedManualReview(
      taskParams,
      reviewPayload,
      reviewStep,
      task.type
    );

    // 审核后预估后续调用费用并校验余额（图集 albumImageBatch / 自动剪辑 AI 段等）
    if (taskV2ForReview?.scope && taskV2ForReview.taskKey && userId) {
      try {
        const { estimateTaskV2 } = await import('./estimate-task-v2');
        const formParams = {
          ...((nextParams.params && typeof nextParams.params === 'object'
            ? nextParams.params
            : {}) as Record<string, unknown>),
          ...(reviewPayload.json != null
            ? {
                album_spec: reviewPayload.json,
                reviewJson: reviewPayload.json,
              }
            : {}),
        };
        const est = await estimateTaskV2({
          scope: taskV2ForReview.scope as import('./types').TaskScope,
          taskKey: taskV2ForReview.taskKey,
          subtype: taskV2ForReview.subtype ?? null,
          params: formParams,
          userId,
          estimatePhase: 'after_review',
        });
        if (est.code === 'BILLING_MISCONFIGURED' || est.hasPricing === false) {
          res.status(503).json({
            success: false,
            code: 'BILLING_MISCONFIGURED',
            error: est.message || '该业务由于计费模块错误，暂不可用',
            estimatedTokens: est.estimatedTokens,
            currentBalance: est.currentBalance,
          });
          return;
        }
        if (!est.allowed && !est.isAdmin) {
          res.status(402).json({
            success: false,
            code: 'INSUFFICIENT_BALANCE',
            error:
              est.message ||
              `余额不足，审核后续预计消耗约 ${est.estimatedTokens} MXM-TOKEN，当前余额 ${est.currentBalance}`,
            estimatedTokens: est.estimatedTokens,
            currentBalance: est.currentBalance,
          });
          return;
        }
      } catch (estErr) {
        console.warn('[TaskHttpHandlers] 审核后估价失败，放行由执行期计费:', estErr);
      }
    }

    await taskManager.updateTaskRequestParams(taskId, nextParams);
    await deleteManualReviewDraft(taskId, gateId);

    const storage = (taskManager as any).storage;
    if (storage) {
      await storage.update(taskId, {
        metadata: {
          ...task.metadata,
          manualReviewGate: undefined,
        },
      });
    }

    const phase = gateMeta?.phase ?? reviewPayload.phase;
    await taskManager.updateTaskStatus(taskId, 'pending', {
      progress: phase === 'post' ? 88 : 0,
      logs: [
        phase === 'post' ? '用户已确认产出，继续后置步骤' : '用户已确认审核内容，继续生成',
      ],
      error: undefined,
    });

    const { enqueueTaskWake } = await import('../task/task-queue');
    await enqueueTaskWake(taskId);

    res.json({
      success: true,
      message: 'Review approved; task queued to continue',
      data: { taskId, status: 'pending', gateId, phase },
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({
        success: false,
        error: error.message,
      });
      return;
    }
    console.error('[TaskHttpHandlers] 审核通过失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** POST /api/v2/tasks/:taskId/retry-album-item — 图集失败单项重试 */
export async function handleTaskRetryAlbumItem(req: Request, res: Response): Promise<void> {
  try {
    const { taskId } = req.params;
    const userId = req.headers['x-user-id'] as string | undefined;
    const isAdmin = await isAdminUser(req);

    const itemId =
      typeof req.body?.itemId === 'string' ? req.body.itemId.trim() : '';
    if (!itemId) {
      res.status(400).json({ success: false, error: 'itemId is required' });
      return;
    }

    const taskManager = taskExecutor.getTaskManager();
    const taskResponse = await taskManager.getTask(taskId);
    const task = taskResponse.task;

    if (!isAdmin && userId && task.metadata.userId !== userId) {
      res.status(403).json({ success: false, error: 'Forbidden' });
      return;
    }

    const ownerId =
      (typeof task.metadata?.userId === 'string' && task.metadata.userId) ||
      userId;
    if (!ownerId) {
      res.status(400).json({ success: false, error: '缺少用户身份，无法重试' });
      return;
    }

    const { retryAlbumItem } = await import('../core/graph/album/retry-album-item');
    const result = await retryAlbumItem({
      task,
      itemId,
      userId: ownerId,
    });

    res.json({
      success: true,
      message:
        result.status === 'ready'
          ? 'Album item regenerated'
          : 'Album item retry failed',
      data: {
        taskId,
        itemId: result.itemId,
        status: result.status,
        error: result.error,
        albumResult: result.albumResult,
        mediaUrls: result.mediaUrls,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({ success: false, error: error.message });
      return;
    }
    const msg = error instanceof Error ? error.message : String(error);
    const isClientError =
      /缺少|找不到|无需重试|不是图集|itemId|Forbidden/.test(msg);
    console.error('[TaskHttpHandlers] 图集单项重试失败:', error);
    res.status(isClientError ? 400 : 500).json({
      success: false,
      error: msg,
    });
  }
}

/** POST /api/v2/tasks/:taskId/remove-album-item — 图集单项删除 */
export async function handleTaskRemoveAlbumItem(req: Request, res: Response): Promise<void> {
  try {
    const { taskId } = req.params;
    const userId = req.headers['x-user-id'] as string | undefined;
    const isAdmin = await isAdminUser(req);

    const itemId =
      typeof req.body?.itemId === 'string' ? req.body.itemId.trim() : '';
    if (!itemId) {
      res.status(400).json({ success: false, error: 'itemId is required' });
      return;
    }

    const taskManager = taskExecutor.getTaskManager();
    const taskResponse = await taskManager.getTask(taskId);
    const task = taskResponse.task;

    if (!isAdmin && userId && task.metadata.userId !== userId) {
      res.status(403).json({ success: false, error: 'Forbidden' });
      return;
    }

    const { removeAlbumItem } = await import('../core/graph/album/remove-album-item');
    const result = await removeAlbumItem({ task, itemId });

    res.json({
      success: true,
      message: 'Album item removed',
      data: {
        taskId,
        itemId: result.itemId,
        albumResult: result.albumResult,
        mediaUrls: result.mediaUrls,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({ success: false, error: error.message });
      return;
    }
    const msg = error instanceof Error ? error.message : String(error);
    const isClientError = /缺少|找不到|不是图集|itemId|Forbidden/.test(msg);
    console.error('[TaskHttpHandlers] 图集单项删除失败:', error);
    res.status(isClientError ? 400 : 500).json({
      success: false,
      error: msg,
    });
  }
}

/** POST /api/v2/tasks/:taskId/remove-collection-item — 写作文集单项删除 */
export async function handleTaskRemoveCollectionItem(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { taskId } = req.params;
    const userId = req.headers['x-user-id'] as string | undefined;
    const isAdmin = await isAdminUser(req);

    const itemId =
      typeof req.body?.itemId === 'string' ? req.body.itemId.trim() : '';
    if (!itemId) {
      res.status(400).json({ success: false, error: 'itemId is required' });
      return;
    }

    const taskManager = taskExecutor.getTaskManager();
    const taskResponse = await taskManager.getTask(taskId);
    const task = taskResponse.task;

    if (!isAdmin && userId && task.metadata.userId !== userId) {
      res.status(403).json({ success: false, error: 'Forbidden' });
      return;
    }

    const { removeCollectionItem } = await import('./remove-collection-item');
    const result = await removeCollectionItem({ task, itemId });

    res.json({
      success: true,
      message: 'Collection item removed',
      data: {
        taskId,
        itemId: result.itemId,
        collectionResult: result.collectionResult,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({ success: false, error: error.message });
      return;
    }
    const msg = error instanceof Error ? error.message : String(error);
    const isClientError = /缺少|找不到|不是文集|itemId|Forbidden/.test(msg);
    console.error('[TaskHttpHandlers] 文集单项删除失败:', error);
    res.status(isClientError ? 400 : 500).json({
      success: false,
      error: msg,
    });
  }
}

/** POST /api/v2/tasks/:taskId/retry-rendered-review-clips — 成片审核阶段重试失败片段 */
export async function handleTaskRetryRenderedReviewClips(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { taskId } = req.params;
    const userId = req.headers['x-user-id'] as string | undefined;
    const isAdmin = await isAdminUser(req);

    const taskManager = taskExecutor.getTaskManager();
    const taskResponse = await taskManager.getTask(taskId);
    const task = taskResponse.task;

    if (!isAdmin && userId && task.metadata.userId !== userId) {
      res.status(403).json({ success: false, error: 'Forbidden' });
      return;
    }

    if (task.status !== 'awaiting_review' && !hasPendingManualReviewGate(task)) {
      res.status(400).json({
        success: false,
        error: `Task is not awaiting review (status=${task.status})`,
      });
      return;
    }

    const reviewJson = req.body?.reviewJson;
    if (reviewJson == null) {
      res.status(400).json({ success: false, error: 'reviewJson is required' });
      return;
    }

    const gateIdBody = typeof req.body?.gateId === 'string' ? req.body.gateId.trim() : '';
    const { resolveGateIdFromTaskMetadata } = await import('./manual-review');
    const gateId =
      gateIdBody || resolveGateIdFromTaskMetadata(task.metadata as Record<string, unknown>);
    if (!gateId) {
      res.status(400).json({ success: false, error: 'gateId is required' });
      return;
    }

    const clipIdsRaw = req.body?.clipIds;
    const clipIds = Array.isArray(clipIdsRaw)
      ? clipIdsRaw.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      : undefined;

    const { retryRenderedReviewClips } = await import(
      '../core/video-edit/retry-rendered-review-clips'
    );
    const result = await retryRenderedReviewClips({
      task,
      reviewJson,
      gateId,
      clipIds,
    });

    res.json({
      success: true,
      message: 'Clip rerender queued; parent task resumed',
      data: {
        taskId,
        status: 'processing',
        renderTaskId: result.renderTaskId,
        retriedClipIds: result.retriedClipIds,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({ success: false, error: error.message });
      return;
    }
    const msg = error instanceof Error ? error.message : String(error);
    const isClientError =
      /reviewJson|gateId|成片审核|没有需要重新生成|无法识别/.test(msg);
    console.error('[TaskHttpHandlers] 重试成片审核片段失败:', error);
    res.status(isClientError ? 400 : 500).json({
      success: false,
      error: msg,
    });
  }
}

export async function handleTaskDelete(req: Request, res: Response): Promise<void> {
  try {
    const { taskId } = req.params;
    const userId = req.headers['x-user-id'] as string | undefined;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Missing x-user-id header',
      });
      return;
    }

    const isAdmin = await isAdminUser(req);

    const taskManager = taskExecutor.getTaskManager();
    const taskResponse = await taskManager.getTask(taskId, isAdmin);

    if (!taskResponse || !taskResponse.task) {
      res.status(410).json({
        success: false,
        error: 'Task not found or already deleted',
        code: 'TASK_NOT_FOUND_OR_DELETED',
      });
      return;
    }

    if (taskResponse.task.metadata.userId !== userId) {
      res.status(403).json({
        success: false,
        error: 'Forbidden: You can only delete your own tasks',
      });
      return;
    }

    if (isAdmin) {
      await taskManager.hardDeleteTask(taskId);
      res.json({
        success: true,
        message: 'Task deleted permanently (admin)',
      });
    } else {
      await taskManager.softDeleteTask(taskId);
      res.json({
        success: true,
        message: 'Task deleted successfully',
      });
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(410).json({
        success: false,
        error: error.message,
        code: 'TASK_NOT_FOUND_OR_DELETED',
      });
      return;
    }
    console.error('[TaskHttpHandlers] 删除任务失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
