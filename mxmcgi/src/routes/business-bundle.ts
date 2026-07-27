/**
 * Admin：业务配置打包导出 / 导入（JSON）
 * - GET  /system/admin/business/bundle
 * - POST /system/admin/business/bundle/export
 * - POST /system/admin/business/bundle/import
 */

import { Router, Request, Response } from 'express';
import {
  RepositoryFactory,
  getSupabaseClient,
  type PromptEngineeringConfig,
} from '@mxmai/mxmdata';
import type { BusinessBundle, BusinessBundleItem, BusinessBundleItemRouting } from './business-bundle-types';
import { applyMxmBusinessBundleImport, buildSensitiveNameIndex, getScopeRepo } from './business-bundle-import-apply';

export type { BusinessBundle, BusinessBundleItem, BusinessBundleItemRouting } from './business-bundle-types';

/** scope_config 行（与 mxmdata ScopeConfig 对齐，避免从包根类型导出差异） */
type ScopeConfigRow = {
  provider: string;
  model: string;
  enabled: boolean;
  margin?: number;
  charge_metric?: string;
  price_in_tokens?: number;
  min_charge_tokens?: number;
  sensitive_word_list_ids?: string[];
};

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

/** 与 web AdminBusiness.utils getBusinessTypeForPromptRow 对齐 */
export function buildLogicalModel(scope: string, type: string, subtype: string | null | undefined): string {
  const base = (() => {
    if (scope === 'writing') {
      const map: Record<string, string> = {
        outlines: 'writing-outlines',
        articles: 'writing-articles',
        lyrics: 'writing-lyrics',
        'suno-lyrics': 'writing-lyrics',
        'voice-scripts': 'writing-voice-scripts',
        'storyboard-scripts': 'writing-storyboard-scripts',
        'media-post': 'writing-media-post',
        reviews: 'writing-reviews',
        resumes: 'writing-resumes',
      };
      return map[type] ?? `writing-${type}`;
    }
    return `${scope}-${type}`;
  })();
  if (subtype && subtype !== 'default' && String(subtype).trim() !== '') {
    return `${base}-${subtype}`;
  }
  return base;
}

function parsePromptTextTaskKey(key: string): { scope: string; type: string; subtype: string | null } | null {
  const t = String(key || '').trim();
  if (!t) return null;
  const parts = t.split('/').filter((p) => p.length > 0);
  if (parts.length === 2) return { scope: parts[0], type: parts[1], subtype: null };
  if (parts.length >= 3) return { scope: parts[0], type: parts[1], subtype: parts.slice(2).join('/') };
  return null;
}

function promptRowToBundleCore(row: PromptEngineeringConfig): Omit<BusinessBundleItem, 'routing' | 'businessPricing' | 'linkedTextFormat'> {
  return {
    scope: row.scope,
    type: row.type,
    subtype: row.subtype,
    is_active: row.is_active,
    rules_i18n: row.rules_i18n ?? {},
    output_format_i18n: row.output_format_i18n ?? {},
    form_options_i18n: row.form_options_i18n ?? null,
    extra: row.extra ?? null,
  };
}

function scopeConfigToRouting(cfg: ScopeConfigRow, logicalModel: string, idToName: Map<string, string>): BusinessBundleItemRouting {
  const ids = cfg.sensitive_word_list_ids ?? [];
  const names = ids.map((id) => idToName.get(id) ?? id).filter(Boolean);
  return {
    logical_model: logicalModel,
    provider: cfg.provider,
    model: cfg.model,
    enabled: cfg.enabled,
    sensitive_word_lists: names,
  };
}

async function exportOneItem(
  scope: string,
  type: string,
  subtype: string | null | undefined,
  opts: { includeRouting: boolean; includePricing: boolean; includeLinkedTextFormat: boolean },
  idToName: Map<string, string>
): Promise<{ item: BusinessBundleItem | null; warnings: string[] }> {
  const warnings: string[] = [];
  const promptRepo = RepositoryFactory.createPromptEngineeringConfigRepository();
  const row = await promptRepo.findByKey(scope, type, subtype ?? null);
  if (!row) return { item: null, warnings: [`未找到 prompt 配置: ${scope}/${type}/${subtype ?? ''}`] };

  const logical = buildLogicalModel(scope, type, row.subtype);
  const item: BusinessBundleItem = {
    ...promptRowToBundleCore(row),
    routing: null,
    businessPricing: undefined,
    linkedTextFormat: null,
  };

  if (opts.includeRouting) {
    const scopeRepo = getScopeRepo(scope);
    if (scopeRepo) {
      const st = row.subtype && row.subtype !== '' ? row.subtype : 'default';
      const cfg = await scopeRepo.findConfig(scope, type, st);
      if (cfg) {
        item.routing = scopeConfigToRouting(cfg, logical, idToName);
      } else {
        warnings.push(`未找到路由配置（*_scope_config）: ${scope}/${type}/${st}`);
      }
    } else {
      warnings.push(`scope=${scope} 无对应 scope_config 表，跳过 routing`);
    }
  }

  if (opts.includePricing) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.from('business_pricing').select('*').eq('business_type', logical);
    if (error) {
      warnings.push(`读取 business_pricing 失败: ${error.message}`);
    } else if (data && data.length > 0) {
      item.businessPricing = data.map((r: Record<string, unknown>) => ({
        business_type: String(r.business_type),
        charge_metric: String(r.charge_metric),
        price_in_tokens: Number(r.price_in_tokens) || 0,
        min_charge_tokens: r.min_charge_tokens != null ? Number(r.min_charge_tokens) : 0,
        provider: (r.provider as string) ?? null,
        model_key: (r.model_key as string) ?? null,
        subtype: (r.subtype as string) ?? null,
        metadata: (r.metadata as Record<string, unknown>) ?? null,
      }));
    }
  }

  if (opts.includeLinkedTextFormat && row.extra && typeof row.extra === 'object') {
    const ptk = (row.extra as Record<string, unknown>).promptTextTaskKey;
    if (typeof ptk === 'string' && ptk.trim()) {
      const parsed = parsePromptTextTaskKey(ptk);
      if (parsed) {
        const linked = await promptRepo.findByKey(parsed.scope, parsed.type, parsed.subtype);
        if (linked) {
          item.linkedTextFormat = {
            scope: linked.scope,
            type: linked.type,
            subtype: linked.subtype,
            is_active: linked.is_active,
            rules_i18n: linked.rules_i18n ?? {},
            output_format_i18n: linked.output_format_i18n ?? {},
            form_options_i18n: linked.form_options_i18n ?? null,
            extra: linked.extra ?? null,
          };
        } else {
          warnings.push(`promptTextTaskKey=${ptk} 指向的配置不存在`);
        }
      }
    }
  }

  return { item, warnings };
}

/** GET /system/admin/business/bundle */
router.get('/bundle', async (req: Request, res: Response) => {
  if (!(await isAdminUser(req))) {
    return res.status(403).json({ success: false, error: 'Admin only' });
  }
  const scope = String(req.query.scope || '');
  const type = String(req.query.type || '');
  const subtypeRaw = req.query.subtype as string | undefined;
  const subtype = subtypeRaw === undefined || subtypeRaw === '' ? null : subtypeRaw;
  if (!scope || !type) {
    return res.status(400).json({ success: false, error: 'scope and type are required' });
  }
  const includeRouting = req.query.includeRouting !== '0' && req.query.includeRouting !== 'false';
  /** 默认不含 businessPricing；跨环境「只拷 formSchema」时避免写入 0 价占位行。显式 includePricing=1 / true 导出完整定价。 */
  const includePricing = req.query.includePricing === '1' || req.query.includePricing === 'true';
  const includeLinked = req.query.includeLinkedTextFormat !== '0' && req.query.includeLinkedTextFormat !== 'false';
  const { idToName } = await buildSensitiveNameIndex();
  const { item, warnings } = await exportOneItem(scope, type, subtype, { includeRouting, includePricing, includeLinkedTextFormat: includeLinked }, idToName);
  if (!item) {
    return res.status(404).json({ success: false, error: 'Not found', warnings });
  }
  const bundle: BusinessBundle = {
    schemaVersion: 1,
    kind: 'mxm-business-bundle',
    exportedAt: new Date().toISOString(),
    items: [item],
  };
  return res.json({ success: true, data: bundle, warnings });
});

/** POST /system/admin/business/bundle/export */
router.post('/bundle/export', async (req: Request, res: Response) => {
  if (!(await isAdminUser(req))) {
    return res.status(403).json({ success: false, error: 'Admin only' });
  }
  const body = (req.body || {}) as {
    keys?: Array<{ scope: string; type: string; subtype?: string | null }>;
    filter?: { scope?: string };
    includeRouting?: boolean;
    includePricing?: boolean;
    includeLinkedTextFormat?: boolean;
  };
  const includeRouting = body.includeRouting !== false;
  const includePricing = body.includePricing === true;
  const includeLinked = body.includeLinkedTextFormat !== false;
  const { idToName } = await buildSensitiveNameIndex();
  const promptRepo = RepositoryFactory.createPromptEngineeringConfigRepository();
  const allWarnings: string[] = [];
  const keysToExport: Array<{ scope: string; type: string; subtype: string | null }> = [];

  if (Array.isArray(body.keys) && body.keys.length > 0) {
    for (const k of body.keys) {
      if (!k?.scope || !k?.type) continue;
      keysToExport.push({
        scope: k.scope,
        type: k.type,
        subtype: k.subtype === undefined || k.subtype === '' ? null : k.subtype,
      });
    }
  } else if (body.filter?.scope) {
    const { items } = await promptRepo.list({ scope: body.filter.scope, limit: 500, offset: 0 });
    for (const it of items) {
      keysToExport.push({ scope: it.scope, type: it.type, subtype: it.subtype });
    }
  } else {
    return res.status(400).json({ success: false, error: 'Provide keys[] or filter.scope' });
  }

  const items: BusinessBundleItem[] = [];
  for (const k of keysToExport) {
    const { item, warnings } = await exportOneItem(k.scope, k.type, k.subtype, { includeRouting, includePricing, includeLinkedTextFormat: includeLinked }, idToName);
    allWarnings.push(...warnings.map((w) => `${k.scope}/${k.type}/${k.subtype ?? '-'}: ${w}`));
    if (item) items.push(item);
  }

  const bundle: BusinessBundle = {
    schemaVersion: 1,
    kind: 'mxm-business-bundle',
    exportedAt: new Date().toISOString(),
    items,
  };
  return res.json({ success: true, data: bundle, warnings: allWarnings });
});

/** POST /system/admin/business/bundle/import */
router.post('/bundle/import', async (req: Request, res: Response) => {
  if (!(await isAdminUser(req))) {
    return res.status(403).json({ success: false, error: 'Admin only' });
  }
  const body = req.body as {
    bundle?: BusinessBundle;
    conflictPolicy?: 'upsert' | 'skip' | 'dry-run';
  };
  const policy = body.conflictPolicy ?? 'upsert';
  const bundle = body.bundle;
  if (!bundle || bundle.kind !== 'mxm-business-bundle' || !Array.isArray(bundle.items)) {
    return res.status(400).json({ success: false, error: 'Invalid bundle' });
  }
  const userId = (req.headers['x-user-id'] as string | undefined) ?? null;
  const data = await applyMxmBusinessBundleImport({ bundle, conflictPolicy: policy, userId });
  return res.json({
    success: true,
    data,
  });
});

export default router;
