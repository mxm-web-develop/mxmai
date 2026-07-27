/**
 * 已发布开放 API（第三方凭 API Key 调用）
 * GET  /api/v1/open/:slug
 * POST /api/v1/open/:slug/run
 * GET  /api/v1/open/:slug/jobs/:jobId
 * GET  /api/v1/open/:slug/jobs/:jobId/events   (SSE 实时推送任务快照)
 */

import { Router, Request, Response } from 'express';
import { buildPublishedApiManifest } from '../open-api/manifest';
import { isAdminUser, requireUserId, getPartnerContext } from '../open-api/authz';
import { getPublishedJobStatus, loadEnabledPublishedBySlug, runPublishedApi } from '../open-api/run-handler';
import { RepositoryFactory } from '@mxmai/mxmdata';
import { ConfigurationError, ValidationError } from '../tasks/errors';
import { isTerminalTaskStatus, type TaskSnapshot } from '../task/task-snapshot';
import { subscribeTaskEvents, isRedisTaskBusConfigured } from '../task/task-event-bus';
import { taskExecutor } from '../task/task-executor';
import { OPEN_API_ROOT_PROJECT_SLUGS } from '../open-api/root-project-slugs';

const router = Router();

function publicBaseUrl(req: Request): string {
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
  const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || 'localhost:3000';
  return `${proto}://${host}`;
}

function sendError(res: Response, err: unknown): void {
  if (err instanceof ValidationError) {
    res.status(400).json({
      success: false,
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }
  if (err instanceof ConfigurationError) {
    const msg = err.message;
    const status = msg.includes('未找到') || msg.includes('不存在') ? 404 : 400;
    res.status(status).json({
      success: false,
      error: { code: err.code, message: msg },
    });
    return;
  }
  const message = err instanceof Error ? err.message : String(err);
  if (/not found|不存在/i.test(message)) {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message },
    });
    return;
  }
  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message },
  });
}

function writeSse(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function setupSseHeaders(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
}

/** GET /api/v1/open/jobs — Partner session 按 end_user 分页列任务（须在 /:slug 之前注册） */
router.get('/jobs', async (req: Request, res: Response) => {
  try {
    const partner = getPartnerContext(req);
    if (!partner) {
      return res.status(403).json({
        success: false,
        error: { code: 'PARTNER_SESSION_REQUIRED', message: '需要 Partner session 身份' },
      });
    }
    const slug = typeof req.query.slug === 'string' ? req.query.slug : undefined;
    const rootOnly =
      req.query.rootOnly === 'true' || req.query.rootOnly === '1';
    const limit = Number(req.query.limit ?? 20);
    const offset = Number(req.query.cursor ?? req.query.offset ?? 0);
    const repo = RepositoryFactory.createPublishedApiUsageRepository();
    const jobs = await repo.listJobsByEndUser({
      partnerAppId: partner.partnerAppId,
      endUserId: partner.endUserId,
      slug,
      slugIn: rootOnly ? [...OPEN_API_ROOT_PROJECT_SLUGS] : undefined,
      limit,
      offset,
    });
    res.json({
      success: true,
      data: {
        jobs,
        nextCursor: jobs.length >= limit ? offset + jobs.length : null,
      },
    });
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/:slug', async (req: Request, res: Response) => {
  try {
    if (!requireUserId(req)) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: '需要登录或 API Key' } });
    }
    const record = await loadEnabledPublishedBySlug(req.params.slug);
    const manifest = buildPublishedApiManifest(record, { baseUrl: publicBaseUrl(req) });
    res.json({ success: true, data: manifest });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/:slug/run', async (req: Request, res: Response) => {
  try {
    const callerId = requireUserId(req);
    if (!callerId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: '需要登录或 API Key' } });
    }
    const partner = getPartnerContext(req);
    const record = await loadEnabledPublishedBySlug(req.params.slug);
    const data = await runPublishedApi(record, callerId, req.body ?? {}, partner ?? undefined);
    res.status(202).json({ success: true, data });
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/:slug/jobs/:jobId/events', async (req: Request, res: Response) => {
  const callerId = requireUserId(req);
  if (!callerId) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: '需要登录或 API Key' } });
  }

  setupSseHeaders(res);
  res.write(`: connected\n\n`);
  writeSse(res, 'connected', { ok: true });

  let closed = false;
  req.on('close', () => {
    closed = true;
    try {
      if (!res.writableEnded) res.end();
    } catch {
      // ignore
    }
  });

  try {
    const record = await loadEnabledPublishedBySlug(req.params.slug);
    const admin = await isAdminUser(req);
    const partner = getPartnerContext(req);

    const initial = await getPublishedJobStatus(
      record,
      req.params.jobId,
      callerId,
      admin,
      partner?.endUserId
    );
    writeSse(res, 'initial', initial);

    // task_v2：Redis 可用时走订阅；否则服务端轮询 taskManager.getTask
    if (record.kind === 'task_v2' && isRedisTaskBusConfigured()) {
      for await (const snap of subscribeTaskEvents(req.params.jobId, { timeoutMs: 30 * 60 * 1000 })) {
        if (closed) return;
        writeSse(res, 'task_snapshot', snap);
        if (isTerminalTaskStatus(snap.status)) {
          writeSse(res, 'terminal', { ok: true });
          return;
        }
      }
      // 订阅超时：通知客户端自行降级轮询
      if (!closed) writeSse(res, 'timeout', { ok: false, message: 'subscribe timeout' });
      return;
    }

    // fallback：服务端轮询（仍是单连接，避免客户端列表刷屏）
    const taskManager = taskExecutor.getTaskManager();
    let lastSnap: TaskSnapshot | null = null;
    while (!closed) {
      await new Promise((r) => setTimeout(r, 1500));
      const resp = await taskManager.getTask(req.params.jobId, admin).catch(() => null);
      const task = resp?.task as any;
      if (!task) continue;
      const snap: TaskSnapshot = {
        id: String(task.id ?? req.params.jobId),
        type: task.type,
        status: task.status,
        progress: {
          status: task.progress?.status,
          progress: task.progress?.progress,
          error: task.progress?.error,
        },
        metadata: task.metadata,
        createdAt: String(task.createdAt ?? ''),
        updatedAt: String(task.updatedAt ?? ''),
        hasResult: !!(task.result?.mediaUrls?.length),
        mediaCount: Array.isArray(task.result?.mediaUrls) ? task.result.mediaUrls.length : undefined,
      };
      if (!lastSnap || lastSnap.status !== snap.status || lastSnap.progress.progress !== snap.progress.progress) {
        lastSnap = snap;
        writeSse(res, 'task_snapshot', snap);
      }
      if (isTerminalTaskStatus(snap.status)) {
        writeSse(res, 'terminal', { ok: true });
        return;
      }
    }
  } catch (err) {
    if (!closed) writeSse(res, 'error', { message: err instanceof Error ? err.message : String(err) });
  } finally {
    try {
      if (!res.writableEnded) res.end();
    } catch {
      // ignore
    }
  }
});

router.get('/:slug/jobs/:jobId', async (req: Request, res: Response) => {
  try {
    const callerId = requireUserId(req);
    if (!callerId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: '需要登录或 API Key' } });
    }
    const record = await loadEnabledPublishedBySlug(req.params.slug);
    const admin = await isAdminUser(req);
    const partner = getPartnerContext(req);
    const data = await getPublishedJobStatus(
      record,
      req.params.jobId,
      callerId,
      admin,
      partner?.endUserId
    );
    res.json({ success: true, data });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
