/**
 * Partner App / end_user 限流（内存滑动窗口；生产可换 Redis）
 */
import { Response, NextFunction } from 'express';
import type { AuthRequest } from './auth';

interface WindowEntry {
  count: number;
  windowStart: number;
}

const appWindows = new Map<string, WindowEntry>();
const userWindows = new Map<string, WindowEntry>();

function checkLimit(
  store: Map<string, WindowEntry>,
  key: string,
  limit: number,
  windowMs: number
): boolean {
  const now = Date.now();
  const cur = store.get(key);
  if (!cur || now - cur.windowStart >= windowMs) {
    store.set(key, { count: 1, windowStart: now });
    return true;
  }
  if (cur.count >= limit) return false;
  cur.count += 1;
  return true;
}

export async function partnerRateLimitMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.partner) return next();

  try {
    const { RepositoryFactory } = require('@mxmai/mxmdata');
    const partnerRepo = RepositoryFactory.createPartnerRepository();
    const app = await partnerRepo.findAppById(req.partner.partnerAppId);
    if (!app) return next();

    const qps = app.qps_limit ?? Number(process.env.PARTNER_DEFAULT_QPS_LIMIT || 0);
    if (qps > 0) {
      const ok = checkLimit(appWindows, app.id, qps, 1000);
      if (!ok) {
        res.status(429).json({
          success: false,
          error: { code: 'PARTNER_QPS_EXCEEDED', message: 'Partner 应用 QPS 超限' },
        });
        return;
      }
    }

    const dailyQuota = app.daily_end_user_quota ?? Number(process.env.PARTNER_DEFAULT_DAILY_QUOTA || 0);
    if (dailyQuota > 0 && req.path.includes('/run')) {
      const usageRepo = RepositoryFactory.createPublishedApiUsageRepository();
      const count = await usageRepo.countCallsByEndUserToday(app.id, req.partner.endUserId);
      if (count >= dailyQuota) {
        res.status(429).json({
          success: false,
          error: {
            code: 'PARTNER_DAILY_QUOTA_EXCEEDED',
            message: '终端用户日调用配额已用尽',
          },
        });
        return;
      }
    }

    next();
  } catch {
    next();
  }
}
