/**
 * 提示词工程配置路由（Admin 专用）
 * GET /system/prompt-config、GET /system/prompt-config/by-key、PUT /system/prompt-config、DELETE /system/prompt-config/:id
 */

import { Router, Request, Response } from 'express';
import { RepositoryFactory } from '@mxmai/mxmdata';

const router = Router();

async function isAdminUser(req: Request): Promise<boolean> {
  try {
    const userRole = req.headers['x-user-role'] as string | undefined;
    if (userRole === 'admin') return true;
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) return false;
    try {
      const userRepo = RepositoryFactory.createUserRepository();
      const user = await userRepo.findById(userId);
      return !!(user && user.role === 'admin');
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}

/** GET /system/prompt-config — 列表，query: scope, type, subtype, limit, offset */
router.get('/', async (req: Request, res: Response) => {
  if (!(await isAdminUser(req))) {
    return res.status(403).json({ success: false, error: 'Admin only' });
  }
  try {
    const repo = RepositoryFactory.createPromptEngineeringConfigRepository();
    const scope = req.query.scope as string | undefined;
    const type = req.query.type as string | undefined;
    const subtype = req.query.subtype as string | undefined;
    const limit = req.query.limit != null ? Math.min(Number(req.query.limit), 500) : undefined;
    const offset = req.query.offset != null ? Number(req.query.offset) : undefined;
    const options: { scope?: string; type?: string; subtype?: string | null; limit?: number; offset?: number } = { limit, offset };
    if (scope) options.scope = scope;
    if (type) options.type = type;
    if (subtype !== undefined) options.subtype = subtype === '' ? null : subtype;
    const result = await repo.list(options);
    return res.json({ success: true, data: { items: result.items, total: result.total } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ success: false, error: msg });
  }
});

/** GET /system/prompt-config/by-key — 按 key 查询，query: scope, type, subtype?, lang? */
router.get('/by-key', async (req: Request, res: Response) => {
  if (!(await isAdminUser(req))) {
    return res.status(403).json({ success: false, error: 'Admin only' });
  }
  try {
    const scope = req.query.scope as string;
    const type = req.query.type as string;
    const subtype = (req.query.subtype as string) || null;
    const lang = req.query.lang as string | undefined;
    if (!scope || !type) {
      return res.status(400).json({ success: false, error: 'scope and type are required' });
    }
    const repo = RepositoryFactory.createPromptEngineeringConfigRepository();
    const row = await repo.findByKey(scope, type, subtype === '' ? null : subtype);
    if (!row) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }
    if (lang) {
      const rules = row.rules_i18n && typeof row.rules_i18n[lang] !== 'undefined' ? row.rules_i18n[lang] : (row.rules_i18n as Record<string, string>)?.['zh'] ?? (row.rules_i18n as Record<string, string>)?.['en'] ?? '';
      const output_format = row.output_format_i18n && typeof (row.output_format_i18n as Record<string, string>)[lang] !== 'undefined' ? (row.output_format_i18n as Record<string, string>)[lang] : (row.output_format_i18n as Record<string, string>)?.['zh'] ?? (row.output_format_i18n as Record<string, string>)?.['en'] ?? '';
      return res.json({
        success: true,
        data: {
          id: row.id,
          scope: row.scope,
          type: row.type,
          subtype: row.subtype,
          rules: rules,
          output_format: output_format,
          form_options_i18n: row.form_options_i18n,
          extra: row.extra,
          is_active: row.is_active,
          updated_by: row.updated_by,
          created_at: row.created_at,
          updated_at: row.updated_at,
        },
      });
    }
    return res.json({ success: true, data: row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ success: false, error: msg });
  }
});

/** PUT /system/prompt-config — upsert，body: scope, type, subtype?, rules_i18n?, output_format_i18n?, form_options_i18n?, extra?, is_active? */
router.put('/', async (req: Request, res: Response) => {
  if (!(await isAdminUser(req))) {
    return res.status(403).json({ success: false, error: 'Admin only' });
  }
  try {
    const body = req.body as {
      scope?: string;
      type?: string;
      subtype?: string | null;
      rules_i18n?: Record<string, string>;
      output_format_i18n?: Record<string, string>;
      form_options_i18n?: Record<string, unknown>;
      extra?: Record<string, unknown>;
      is_active?: boolean;
    };
    const scope = body.scope;
    const type = body.type;
    if (!scope || !type) {
      return res.status(400).json({ success: false, error: 'scope and type are required' });
    }
    const userId = req.headers['x-user-id'] as string | undefined;
    const repo = RepositoryFactory.createPromptEngineeringConfigRepository();
    const row = await repo.upsert({
      scope,
      type,
      subtype: body.subtype ?? null,
      rules_i18n: body.rules_i18n,
      output_format_i18n: body.output_format_i18n,
      form_options_i18n: body.form_options_i18n ?? null,
      extra: body.extra ?? null,
      is_active: body.is_active,
      updated_by: userId ?? null,
    });
    return res.json({ success: true, data: row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ success: false, error: msg });
  }
});

/** DELETE /system/prompt-config/:id */
router.delete('/:id', async (req: Request, res: Response) => {
  if (!(await isAdminUser(req))) {
    return res.status(403).json({ success: false, error: 'Admin only' });
  }
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ success: false, error: 'id required' });
    const repo = RepositoryFactory.createPromptEngineeringConfigRepository();
    await repo.delete(id);
    return res.status(204).send();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ success: false, error: msg });
  }
});

export default router;
