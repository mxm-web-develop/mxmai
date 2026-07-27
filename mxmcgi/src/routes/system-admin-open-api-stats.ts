/**
 * Admin：全站开放 API 调用统计
 * GET /system/admin/open-api-stats?days=30
 */

import { Router, Request, Response } from 'express';
import { RepositoryFactory } from '@mxmai/mxmdata';
import { isAdminUser } from '../open-api/authz';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    if (!(await isAdminUser(req))) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    const days = Number(req.query.days) || 30;
    const repo = RepositoryFactory.createPublishedApiUsageRepository();
    const stats = await repo.getStats({
      admin: true,
      days,
      recentLimit: Number(req.query.recentLimit) || 40,
    });
    res.json({ success: true, data: stats });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message ?? '统计失败' });
  }
});

export default router;
