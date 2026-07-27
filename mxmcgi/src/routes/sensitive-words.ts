/**
 * 敏感词管理路由（Admin 专用）
 * - 敏感词表 CRUD：GET/POST/PUT/DELETE /system/admin/sensitive-words/lists
 * - 敏感词条 CRUD：GET/POST/DELETE /system/admin/sensitive-words/lists/:listId/words，POST batch
 * - 绑定 CRUD：GET /system/admin/sensitive-words/bindings，PUT /system/admin/sensitive-words/bindings/slot
 */

import { Router, Request, Response } from 'express';
import { RepositoryFactory, createSensitiveWordRepository, getSupabaseClient } from '@mxmai/mxmdata';

const router = Router();

async function isAdminUser(req: Request): Promise<boolean> {
  try {
    const userRole = req.headers['x-user-role'] as string | undefined;
    if (userRole === 'admin') return true;
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) return false;
    const userRepo = RepositoryFactory.createUserRepository();
    const user = await userRepo.findById(userId);
    return !!(user && user.role === 'admin');
  } catch {
    return false;
  }
}

/** 是否为“表未初始化”类错误（表不存在 / schema cache 未找到表），避免误报 500 */
function isUninitializedError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  const str = typeof e === 'object' && e !== null && 'message' in e ? String((e as any).message) : msg;
  const full = str + (e instanceof Error && e.cause ? String(e.cause) : '');
  return (
    /relation\s+["']?sensitive_word|does not exist|表.*不存在/i.test(msg) ||
    /Could not find the table|schema cache|schema_cache/i.test(full) ||
    /undefined_table|42P01|PGRST.*sensitive_word/i.test(full) ||
    (typeof msg === 'string' && msg.includes('sensitive_word'))
  );
}

/** 表未初始化时返回空数据的 meta 提示（前端可用来展示“请先执行迁移”） */
const UNINITIALIZED_META = {
  uninitialized: true,
  hint: '请执行数据迁移: pnpm --filter @mxmai/mxmdata run migrate:sensitive-words',
} as const;

/** 若为“表不存在”或 RLS/权限”类错误，返回 503 与提示；否则返回 500 与原始信息 */
function sendSensitiveWordError(res: Response, e: unknown): void {
  console.error('[sensitive-words]', e instanceof Error ? e.stack : e);
  const msg = e instanceof Error ? e.message : String(e);
  if (isUninitializedError(e)) {
    res.status(503).json({
      success: false,
      error: '敏感词表未初始化',
      hint: UNINITIALIZED_META.hint,
      detail: msg,
    });
    return;
  }
  const isRlsOrPolicy =
    /row-level security|policy|permission denied|new row violates|RLS/i.test(msg);
  if (isRlsOrPolicy) {
    res.status(503).json({
      success: false,
      error: '敏感词表访问被 RLS 或权限拒绝',
      hint: '请配置 SUPABASE_SERVICE_KEY，或在 Supabase SQL 中执行 add_sensitive_word_disable_rls.sql 关闭三张表的 RLS',
      detail: msg,
    });
    return;
  }
  res.status(500).json({ success: false, error: msg });
}

/** GET /system/admin/sensitive-words/lists — 敏感词表列表（表未初始化时返回空数组，便于系统初始化） */
router.get('/lists', async (req: Request, res: Response) => {
  if (!(await isAdminUser(req))) {
    return res.status(403).json({ success: false, error: 'Admin only' });
  }
  try {
    const repo = createSensitiveWordRepository();
    const items = await repo.listLists();
    return res.json({ success: true, data: { items } });
  } catch (e) {
    if (isUninitializedError(e)) {
      return res.json({ success: true, data: { items: [] }, meta: UNINITIALIZED_META });
    }
    return sendSensitiveWordError(res, e);
  }
});

/** GET /system/admin/sensitive-words/lists/:listId — 敏感词表详情 */
router.get('/lists/:listId', async (req: Request, res: Response) => {
  if (!(await isAdminUser(req))) {
    return res.status(403).json({ success: false, error: 'Admin only' });
  }
  try {
    const listId = req.params.listId;
    if (!listId) return res.status(400).json({ success: false, error: 'listId required' });
    const repo = createSensitiveWordRepository();
    const list = await repo.findListById(listId);
    if (!list) return res.status(404).json({ success: false, error: 'Not found' });
    return res.json({ success: true, data: list });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ success: false, error: msg });
  }
});

/** POST /system/admin/sensitive-words/lists — 创建敏感词表 */
router.post('/lists', async (req: Request, res: Response) => {
  if (!(await isAdminUser(req))) {
    return res.status(403).json({ success: false, error: 'Admin only' });
  }
  try {
    const body = req.body as { name: string; description?: string | null; is_active?: boolean };
    if (!body.name || typeof body.name !== 'string') {
      return res.status(400).json({ success: false, error: 'name is required' });
    }
    const repo = createSensitiveWordRepository();
    const list = await repo.createList({
      name: body.name,
      description: body.description ?? null,
      is_active: body.is_active !== false,
    });
    return res.status(201).json({ success: true, data: list });
  } catch (e) {
    return sendSensitiveWordError(res, e);
  }
});

/** PUT /system/admin/sensitive-words/lists/:listId — 更新敏感词表 */
router.put('/lists/:listId', async (req: Request, res: Response) => {
  if (!(await isAdminUser(req))) {
    return res.status(403).json({ success: false, error: 'Admin only' });
  }
  try {
    const listId = req.params.listId;
    const body = req.body as { name?: string; description?: string | null; is_active?: boolean };
    if (!listId) return res.status(400).json({ success: false, error: 'listId required' });
    const repo = createSensitiveWordRepository();
    const list = await repo.updateList(listId, {
      name: body.name,
      description: body.description,
      is_active: body.is_active,
    });
    return res.json({ success: true, data: list });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ success: false, error: msg });
  }
});

/** DELETE /system/admin/sensitive-words/lists/:listId — 删除敏感词表 */
router.delete('/lists/:listId', async (req: Request, res: Response) => {
  if (!(await isAdminUser(req))) {
    return res.status(403).json({ success: false, error: 'Admin only' });
  }
  try {
    const listId = req.params.listId;
    if (!listId) return res.status(400).json({ success: false, error: 'listId required' });
    const repo = createSensitiveWordRepository();
    await repo.deleteList(listId);
    return res.status(204).send();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ success: false, error: msg });
  }
});

/** GET /system/admin/sensitive-words/lists/:listId/words — 某表下的敏感词列表 */
router.get('/lists/:listId/words', async (req: Request, res: Response) => {
  if (!(await isAdminUser(req))) {
    return res.status(403).json({ success: false, error: 'Admin only' });
  }
  try {
    const listId = req.params.listId;
    if (!listId) return res.status(400).json({ success: false, error: 'listId required' });
    const repo = createSensitiveWordRepository();
    const words = await repo.listWordsByListId(listId);
    return res.json({ success: true, data: { items: words } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ success: false, error: msg });
  }
});

/** POST /system/admin/sensitive-words/lists/:listId/words — 添加一条敏感词 */
router.post('/lists/:listId/words', async (req: Request, res: Response) => {
  if (!(await isAdminUser(req))) {
    return res.status(403).json({ success: false, error: 'Admin only' });
  }
  try {
    const listId = req.params.listId;
    const body = req.body as { word: string };
    if (!listId) return res.status(400).json({ success: false, error: 'listId required' });
    if (!body.word || typeof body.word !== 'string') {
      return res.status(400).json({ success: false, error: 'word is required' });
    }
    const repo = createSensitiveWordRepository();
    const word = await repo.addWord({ list_id: listId, word: body.word.trim() });
    return res.status(201).json({ success: true, data: word });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ success: false, error: msg });
  }
});

/** POST /system/admin/sensitive-words/lists/:listId/words/batch — 批量添加敏感词 */
router.post('/lists/:listId/words/batch', async (req: Request, res: Response) => {
  if (!(await isAdminUser(req))) {
    return res.status(403).json({ success: false, error: 'Admin only' });
  }
  try {
    const listId = req.params.listId;
    const body = req.body as { words: string[] };
    if (!listId) return res.status(400).json({ success: false, error: 'listId required' });
    const words = Array.isArray(body.words) ? body.words.map((w: unknown) => String(w).trim()).filter(Boolean) : [];
    if (words.length === 0) {
      return res.status(400).json({ success: false, error: 'words array is required and non-empty' });
    }
    const repo = createSensitiveWordRepository();
    const count = await repo.addWordsBatch(listId, words);
    return res.status(201).json({ success: true, data: { added: count } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ success: false, error: msg });
  }
});

/** DELETE /system/admin/sensitive-words/words/:wordId — 删除一条敏感词 */
router.delete('/words/:wordId', async (req: Request, res: Response) => {
  if (!(await isAdminUser(req))) {
    return res.status(403).json({ success: false, error: 'Admin only' });
  }
  try {
    const wordId = req.params.wordId;
    if (!wordId) return res.status(400).json({ success: false, error: 'wordId required' });
    const repo = createSensitiveWordRepository();
    await repo.deleteWord(wordId);
    return res.status(204).send();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ success: false, error: msg });
  }
});

/** GET /system/admin/sensitive-words/bindings — 绑定列表（表未初始化时返回空数组，便于系统初始化） */
router.get('/bindings', async (req: Request, res: Response) => {
  if (!(await isAdminUser(req))) {
    return res.status(403).json({ success: false, error: 'Admin only' });
  }
  try {
    const scope = req.query.scope as string | undefined;
    const type = req.query.type as string | undefined;
    const subtype = req.query.subtype as string | undefined;
    const repo = createSensitiveWordRepository();
    const items = await repo.listBindings(
      scope,
      type,
      subtype === undefined ? undefined : subtype === '' ? null : subtype
    );
    return res.json({ success: true, data: { items } });
  } catch (e) {
    if (isUninitializedError(e)) {
      return res.json({ success: true, data: { items: [] }, meta: UNINITIALIZED_META });
    }
    return sendSensitiveWordError(res, e);
  }
});

/** PUT /system/admin/sensitive-words/bindings/slot — 为 slot 设置绑定的敏感词表，body: scope, type, subtype?, list_ids[] */
router.put('/bindings/slot', async (req: Request, res: Response) => {
  if (!(await isAdminUser(req))) {
    return res.status(403).json({ success: false, error: 'Admin only' });
  }
  try {
    const body = req.body as { scope: string; type: string; subtype?: string | null; list_ids: string[] };
    if (!body.scope || !body.type) {
      return res.status(400).json({ success: false, error: 'scope and type are required' });
    }
    const listIds = Array.isArray(body.list_ids) ? body.list_ids : [];
    const repo = createSensitiveWordRepository();
    await repo.setBindingsForSlot(body.scope, body.type, body.subtype ?? null, listIds);

    // 同步写入 *scope_config.sensitive_word_list_ids
    const supabase = getSupabaseClient();
    const tableName = `${body.scope}_scope_config`;
    const subType = body.subtype ?? 'default';
    const upsertRow: Record<string, unknown> = {
      scope: body.scope,
      task_key: body.type,
      sub_type: subType,
      sensitive_word_list_ids: listIds,
      updated_at: new Date().toISOString(),
    };
    await supabase.from(tableName).upsert(upsertRow, { onConflict: 'scope,task_key,sub_type' });

    return res.json({ success: true, data: { scope: body.scope, type: body.type, subtype: body.subtype ?? null, list_ids: listIds } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ success: false, error: msg });
  }
});

/** DELETE /system/admin/sensitive-words/bindings/:bindingId — 删除一条绑定 */
router.delete('/bindings/:bindingId', async (req: Request, res: Response) => {
  if (!(await isAdminUser(req))) {
    return res.status(403).json({ success: false, error: 'Admin only' });
  }
  try {
    const bindingId = req.params.bindingId;
    if (!bindingId) return res.status(400).json({ success: false, error: 'bindingId required' });
    const repo = createSensitiveWordRepository();

    // 先查到 binding 的 scope/type/subtype，用于后续同步 scope_config
    const supabase = getSupabaseClient();
    const { data: binding } = await supabase.from('sensitive_word_list_bindings').select('scope,type,subtype').eq('id', bindingId).maybeSingle();
    await repo.removeBinding(bindingId);

    // 同步更新 scope_config.sensitive_word_list_ids
    if (binding) {
      const tableName = `${binding.scope}_scope_config`;
      const remainingBindings = await repo.listBindings(binding.scope, binding.type, binding.subtype);
      const listIds = remainingBindings.map((b: any) => b.list_id);
      const subType = binding.subtype ?? 'default';
      await supabase.from(tableName).upsert({
        scope: binding.scope,
        task_key: binding.type,
        sub_type: subType,
        sensitive_word_list_ids: listIds,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'scope,task_key,sub_type' });
    }

    return res.status(204).send();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ success: false, error: msg });
  }
});

export default router;
