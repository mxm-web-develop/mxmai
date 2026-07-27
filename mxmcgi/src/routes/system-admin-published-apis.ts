/**
 * Admin：已发布 API 全局列表 / 强制下架
 * GET /system/admin/published-apis
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
    const repo = RepositoryFactory.createPublishedApiRepository();
    const kind = req.query.kind as 'task_v2' | 'smartflow' | undefined;
    const isEnabled =
      req.query.isEnabled === 'true' ? true : req.query.isEnabled === 'false' ? false : undefined;
    const list = await repo.list({
      kind,
      isEnabled,
      limit: Number(req.query.limit) || 100,
      offset: Number(req.query.offset) || 0,
    });
    res.json({ success: true, data: list, count: list.length });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message ?? '查询失败' });
  }
});

router.post('/:id/disable', async (req: Request, res: Response) => {
  try {
    if (!(await isAdminUser(req))) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    const repo = RepositoryFactory.createPublishedApiRepository();
    const row = await repo.findById(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, error: '记录不存在' });
    }
    const updated = await repo.update(req.params.id, { isEnabled: false });
    res.json({ success: true, data: updated });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message ?? '操作失败' });
  }
});

router.post('/:id/enable', async (req: Request, res: Response) => {
  try {
    if (!(await isAdminUser(req))) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    const repo = RepositoryFactory.createPublishedApiRepository();
    const row = await repo.findById(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, error: '记录不存在' });
    }
    const updated = await repo.update(req.params.id, { isEnabled: true });
    res.json({ success: true, data: updated });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message ?? '操作失败' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    if (!(await isAdminUser(req))) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    const repo = RepositoryFactory.createPublishedApiRepository();
    const row = await repo.findById(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, error: '记录不存在' });
    }
    if (row.is_enabled) {
      return res.status(400).json({ success: false, error: '请先下架后再永久删除' });
    }
    await repo.delete(req.params.id);
    res.json({ success: true, message: '已永久删除' });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message ?? '删除失败' });
  }
});

export default router;
