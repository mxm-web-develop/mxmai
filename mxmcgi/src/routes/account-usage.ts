/**
 * 用户全平台用量统计
 * GET /api/v1/account/usage/summary?days=30&source=all|web|open_api
 * GET /api/v1/account/usage/events?days=30&source=&scope=&slug=&taskId=&page=&limit=
 */

import { Router, Request, Response } from 'express';
import { requireUserId } from '../open-api/authz';
import {
  UsageAnalyticsService,
  type AccountUsageSourceFilter,
} from '../statistics/usage-analytics-service';
import { normalizeScopeForDisplay, type DisplayScope } from '../statistics/usage-context';

const router = Router();

const DISPLAY_SCOPES = new Set<DisplayScope>(['text', 'writing', 'graph', 'video', 'audio', 'music']);

function sendErr(res: Response, status: number, message: string, code = 'ERROR'): void {
  res.status(status).json({ success: false, error: { code, message } });
}

function parseSource(raw: unknown): AccountUsageSourceFilter {
  const s = String(raw ?? 'all');
  return s === 'web' || s === 'open_api' ? s : 'all';
}

function parseScope(raw: unknown): DisplayScope | undefined {
  if (raw == null || raw === '') return undefined;
  const s = normalizeScopeForDisplay(String(raw));
  return DISPLAY_SCOPES.has(s) ? s : undefined;
}

router.get('/summary', async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req);
    if (!userId) return sendErr(res, 401, '未认证', 'UNAUTHORIZED');

    const days = Number(req.query.days) || 30;
    const source = parseSource(req.query.source);

    const stats = await UsageAnalyticsService.getSummary({
      userId,
      days,
      source,
    });

    res.json({ success: true, data: stats });
  } catch (e: unknown) {
    sendErr(res, 500, e instanceof Error ? e.message : '统计失败');
  }
});

router.get('/events', async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req);
    if (!userId) return sendErr(res, 401, '未认证', 'UNAUTHORIZED');

    const days = Number(req.query.days) || 30;
    const source = parseSource(req.query.source);
    const scope = parseScope(req.query.scope);
    const slug = req.query.slug != null ? String(req.query.slug) : undefined;
    const taskId = req.query.taskId != null ? String(req.query.taskId) : undefined;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;

    const result = await UsageAnalyticsService.listEvents({
      userId,
      days,
      source,
      scope,
      slug,
      taskId,
      page,
      limit,
    });

    res.json({ success: true, data: result });
  } catch (e: unknown) {
    sendErr(res, 500, e instanceof Error ? e.message : '明细查询失败');
  }
});

export default router;
