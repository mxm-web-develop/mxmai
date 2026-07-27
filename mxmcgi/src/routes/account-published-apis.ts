/**
 * 用户发布 API 管理
 */

import { Router, Request, Response } from 'express';
import { RepositoryFactory, type PublishedApiKind } from '@mxmai/mxmdata';
import {
  assertCanManagePublishedApi,
  assertCanPublishSmartflow,
  buildSnapshotForSmartflow,
  buildSnapshotForTaskV2,
  isAdminUser,
  refreshPublishedSnapshots,
  requireUserId,
} from '../open-api/authz';
import { normalizePublishedApiSlug, validatePublishedApiSlug } from '../open-api/slug';
import { loadTaskDefinition } from '../tasks/task-definition';
import type { TaskScope } from '../tasks/types';

const router = Router();

function sendErr(res: Response, status: number, message: string, code = 'ERROR'): void {
  res.status(status).json({ success: false, error: { code, message } });
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req);
    if (!userId) return sendErr(res, 401, '未认证', 'UNAUTHORIZED');
    const admin = await isAdminUser(req);
    const repo = RepositoryFactory.createPublishedApiRepository();
    const list = await repo.list({
      ownerUserId: admin && req.query.all === 'true' ? undefined : userId,
      limit: Number(req.query.limit) || 50,
      offset: Number(req.query.offset) || 0,
    });
    res.json({ success: true, data: list });
  } catch (e: any) {
    sendErr(res, 500, e?.message ?? '列表失败');
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req);
    if (!userId) return sendErr(res, 401, '未认证', 'UNAUTHORIZED');
    const admin = await isAdminUser(req);

    const {
      slug: rawSlug,
      kind,
      title,
      description,
      taskV2Scope,
      taskV2TaskKey,
      taskV2Subtype,
      smartflowId,
    } = req.body ?? {};

    const slug = normalizePublishedApiSlug(rawSlug);
    const slugErr = validatePublishedApiSlug(slug);
    if (slugErr) return sendErr(res, 400, slugErr, 'VALIDATION_ERROR');
    if (!kind || (kind !== 'task_v2' && kind !== 'smartflow')) {
      return sendErr(res, 400, 'kind 须为 task_v2 或 smartflow', 'VALIDATION_ERROR');
    }
    if (!title || !String(title).trim()) return sendErr(res, 400, 'title 必填', 'VALIDATION_ERROR');

    const repo = RepositoryFactory.createPublishedApiRepository();
    const existing = await repo.findBySlug(slug);
    if (existing) return sendErr(res, 409, `slug 已占用：${slug}`, 'CONFLICT');

    let snapshot: Awaited<ReturnType<typeof buildSnapshotForTaskV2>>;

    if (kind === 'task_v2') {
      const scope = String(taskV2Scope || '').trim();
      const taskKey = String(taskV2TaskKey || '').trim();
      if (!scope || !taskKey) return sendErr(res, 400, 'task_v2 须提供 taskV2Scope、taskV2TaskKey', 'VALIDATION_ERROR');
      await loadTaskDefinition({
        scope: scope as TaskScope,
        taskKey,
        subtype: taskV2Subtype ?? null,
      });
      snapshot = await buildSnapshotForTaskV2({
        scope,
        taskKey,
        subtype: taskV2Subtype ?? null,
      });
      const created = await repo.create({
        slug,
        kind: kind as PublishedApiKind,
        ownerUserId: userId,
        title: String(title).trim(),
        description: description ?? null,
        taskV2Scope: scope,
        taskV2TaskKey: taskKey,
        taskV2Subtype: taskV2Subtype ?? null,
        inputSchemaSnapshot: snapshot.schema as Record<string, unknown>,
        inputDoc: snapshot.inputDoc,
      });
      return res.status(201).json({ success: true, data: created });
    }

    const sfId = String(smartflowId || '').trim();
    if (!sfId) return sendErr(res, 400, 'smartflow 须提供 smartflowId', 'VALIDATION_ERROR');
    await assertCanPublishSmartflow(sfId, userId, admin);
    snapshot = await buildSnapshotForSmartflow(sfId);
    const created = await repo.create({
      slug,
      kind: 'smartflow',
      ownerUserId: userId,
      title: String(title).trim(),
      description: description ?? null,
      smartflowId: sfId,
      inputSchemaSnapshot: snapshot.schema as Record<string, unknown>,
      inputDoc: snapshot.inputDoc,
    });
    res.status(201).json({ success: true, data: created });
  } catch (e: any) {
    sendErr(res, 400, e?.message ?? '创建失败', 'VALIDATION_ERROR');
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req);
    if (!userId) return sendErr(res, 401, '未认证', 'UNAUTHORIZED');
    const admin = await isAdminUser(req);
    const repo = RepositoryFactory.createPublishedApiRepository();
    const row = await repo.findById(req.params.id);
    if (!row) return sendErr(res, 404, '记录不存在', 'NOT_FOUND');
    await assertCanManagePublishedApi(row, userId, admin);

    const { title, description, isEnabled, republish } = req.body ?? {};
    const patch: Parameters<typeof repo.update>[1] = {};
    if (title !== undefined) patch.title = String(title).trim();
    if (description !== undefined) patch.description = description;
    if (isEnabled !== undefined) patch.isEnabled = !!isEnabled;

    if (republish) {
      const snap = await refreshPublishedSnapshots(row);
      patch.inputSchemaSnapshot = snap.schema as Record<string, unknown>;
      patch.inputDoc = snap.inputDoc;
      patch.schemaVersion = row.schema_version + 1;
      patch.publishedAt = new Date().toISOString();
    }

    const updated = await repo.update(req.params.id, patch);
    res.json({ success: true, data: updated });
  } catch (e: any) {
    sendErr(res, 400, e?.message ?? '更新失败');
  }
});

router.post('/:id/republish', async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req);
    if (!userId) return sendErr(res, 401, '未认证', 'UNAUTHORIZED');
    const admin = await isAdminUser(req);
    const repo = RepositoryFactory.createPublishedApiRepository();
    const row = await repo.findById(req.params.id);
    if (!row) return sendErr(res, 404, '记录不存在', 'NOT_FOUND');
    await assertCanManagePublishedApi(row, userId, admin);

    const snap = await refreshPublishedSnapshots(row);
    const updated = await repo.update(req.params.id, {
      inputSchemaSnapshot: snap.schema as Record<string, unknown>,
      inputDoc: snap.inputDoc,
      schemaVersion: row.schema_version + 1,
      publishedAt: new Date().toISOString(),
    });
    res.json({ success: true, data: updated });
  } catch (e: any) {
    sendErr(res, 400, e?.message ?? '重新发布失败');
  }
});

router.get('/stats', async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req);
    if (!userId) return sendErr(res, 401, '未认证', 'UNAUTHORIZED');
    const repo = RepositoryFactory.createPublishedApiUsageRepository();
    const days = Number(req.query.days) || 30;
    const publishedApiId = typeof req.query.publishedApiId === 'string' ? req.query.publishedApiId : undefined;
    const slug = typeof req.query.slug === 'string' ? req.query.slug : undefined;
    const stats = await repo.getStats({
      ownerUserId: userId,
      days,
      publishedApiId,
      slug,
      recentLimit: 40,
    });
    res.json({ success: true, data: stats });
  } catch (e: any) {
    sendErr(res, 500, e?.message ?? '统计失败');
  }
});

router.get('/:id/stats', async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req);
    if (!userId) return sendErr(res, 401, '未认证', 'UNAUTHORIZED');
    const admin = await isAdminUser(req);
    const apiRepo = RepositoryFactory.createPublishedApiRepository();
    const row = await apiRepo.findById(req.params.id);
    if (!row) return sendErr(res, 404, '记录不存在', 'NOT_FOUND');
    await assertCanManagePublishedApi(row, userId, admin);
    const usageRepo = RepositoryFactory.createPublishedApiUsageRepository();
    const stats = await usageRepo.getStats({
      ownerUserId: row.owner_user_id,
      publishedApiId: row.id,
      slug: row.slug,
      days: Number(req.query.days) || 30,
      recentLimit: 40,
    });
    res.json({ success: true, data: { api: row, stats } });
  } catch (e: any) {
    sendErr(res, 500, e?.message ?? '统计失败');
  }
});

router.post('/:id/disable', async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req);
    if (!userId) return sendErr(res, 401, '未认证', 'UNAUTHORIZED');
    const admin = await isAdminUser(req);
    const repo = RepositoryFactory.createPublishedApiRepository();
    const row = await repo.findById(req.params.id);
    if (!row) return sendErr(res, 404, '记录不存在', 'NOT_FOUND');
    await assertCanManagePublishedApi(row, userId, admin);

    const updated = await repo.update(req.params.id, { isEnabled: false });
    res.json({ success: true, data: updated });
  } catch (e: any) {
    sendErr(res, 500, e?.message ?? '下架失败');
  }
});

router.post('/:id/enable', async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req);
    if (!userId) return sendErr(res, 401, '未认证', 'UNAUTHORIZED');
    const admin = await isAdminUser(req);
    const repo = RepositoryFactory.createPublishedApiRepository();
    const row = await repo.findById(req.params.id);
    if (!row) return sendErr(res, 404, '记录不存在', 'NOT_FOUND');
    await assertCanManagePublishedApi(row, userId, admin);

    const updated = await repo.update(req.params.id, { isEnabled: true });
    res.json({ success: true, data: updated });
  } catch (e: any) {
    sendErr(res, 500, e?.message ?? '上架失败');
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req);
    if (!userId) return sendErr(res, 401, '未认证', 'UNAUTHORIZED');
    const admin = await isAdminUser(req);
    const repo = RepositoryFactory.createPublishedApiRepository();
    const row = await repo.findById(req.params.id);
    if (!row) return sendErr(res, 404, '记录不存在', 'NOT_FOUND');
    await assertCanManagePublishedApi(row, userId, admin);

    if (row.is_enabled) {
      return sendErr(res, 400, '请先下架后再永久删除', 'VALIDATION_ERROR');
    }
    await repo.delete(req.params.id);
    res.json({ success: true, message: '已永久删除' });
  } catch (e: any) {
    sendErr(res, 500, e?.message ?? '删除失败');
  }
});

export default router;
