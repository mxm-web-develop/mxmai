/**
 * 从当前 SUPABASE_URL 导出业务 bundle（可用于香港生产 → 本地恢复）。
 *
 * 用法:
 *   # 先注入港机 SUPABASE_*，再：
 *   cd mxmcgi && pnpm exec tsx src/scripts/export-remote-businesses-bundle.ts \
 *     --scope writing --out ../tmp/hk-writing.bundle.json
 *
 *   # 多 scope：--scope writing,text
 */
import * as fs from 'fs';
import { join } from 'path';
import { RepositoryFactory, getSupabaseClient } from '@mxmai/mxmdata';
import type { BusinessBundle, BusinessBundleItem } from '../routes/business-bundle-types';
import { buildSensitiveNameIndex, getScopeRepo } from '../routes/business-bundle-import-apply';
import { buildLogicalModel } from '../routes/business-bundle';

const MXMCGI_ROOT = process.cwd();
const PROJECT_ROOT = join(MXMCGI_ROOT, '..');

function parseArgs(argv: string[]) {
  let scopes: string[] | null = null;
  let outPath = join(PROJECT_ROOT, 'tmp', `remote-businesses-${Date.now()}.bundle.json`);
  let activeOnly = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--scope' && argv[i + 1]) {
      scopes = String(argv[++i])
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (a === '--out' && argv[i + 1]) {
      const p = argv[++i]!;
      outPath = p.startsWith('/') ? p : join(MXMCGI_ROOT, p);
    } else if (a === '--active-only') {
      activeOnly = true;
    }
  }
  return { scopes, outPath, activeOnly };
}

async function main() {
  const { scopes, outPath, activeOnly } = parseArgs(process.argv.slice(2));
  const url = process.env.SUPABASE_URL?.trim() ?? '';
  if (!url) throw new Error('缺少 SUPABASE_URL');
  if (process.env.SUPABASE_SERVICE_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_KEY;
  }
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  }

  RepositoryFactory.init();
  const client = getSupabaseClient();
  let q = client.from('prompt_engineering_config').select('*').order('scope').order('type').order('subtype');
  if (scopes?.length) q = q.in('scope', scopes);
  if (activeOnly) q = q.eq('is_active', true);
  const { data: rows, error } = await q;
  if (error) throw error;

  const { idToName } = await buildSensitiveNameIndex();
  const items: BusinessBundleItem[] = [];
  const warnings: string[] = [];

  for (const row of rows ?? []) {
    const scope = String(row.scope);
    const type = String(row.type);
    const subtype = row.subtype == null || row.subtype === '' ? null : String(row.subtype);
    const logical = buildLogicalModel(scope, type, subtype);
    const item: BusinessBundleItem = {
      scope,
      type,
      subtype,
      is_active: row.is_active !== false,
      rules_i18n: (row.rules_i18n as Record<string, string>) ?? {},
      output_format_i18n: (row.output_format_i18n as Record<string, string>) ?? {},
      form_options_i18n: (row.form_options_i18n as Record<string, unknown> | null) ?? null,
      extra: (row.extra as Record<string, unknown> | null) ?? null,
      routing: null,
      businessPricing: null,
      linkedTextFormat: null,
    };

    const scopeRepo = getScopeRepo(scope);
    if (scopeRepo) {
      try {
        const st = subtype && subtype !== '' ? subtype : 'default';
        const cfg = await scopeRepo.findConfig(scope, type, st);
        if (cfg) {
          const ids = (cfg.sensitive_word_list_ids ?? []) as string[];
          item.routing = {
            logical_model: logical,
            provider: cfg.provider,
            model: cfg.model,
            enabled: cfg.enabled !== false,
            sensitive_word_lists: ids.map((id) => idToName.get(id) ?? id).filter(Boolean),
          };
        } else {
          warnings.push(`${scope}/${type}/${subtype ?? '-'}: 无 routing`);
        }
      } catch (e) {
        warnings.push(
          `${scope}/${type}/${subtype ?? '-'}: routing ${e instanceof Error ? e.message : e}`
        );
      }
    }

    try {
      const { data: pricingRows, error: pErr } = await client
        .from('business_pricing')
        .select('*')
        .eq('business_type', logical);
      if (pErr) throw pErr;
      if (pricingRows && pricingRows.length > 0) {
        item.businessPricing = pricingRows.map((r: Record<string, unknown>) => ({
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
    } catch (e) {
      warnings.push(`${scope}/${type}/${subtype ?? '-'}: pricing ${e instanceof Error ? e.message : e}`);
    }

    items.push(item);
  }

  const bundle: BusinessBundle = {
    schemaVersion: 1,
    kind: 'mxm-business-bundle',
    exportedAt: new Date().toISOString(),
    items,
  };

  fs.mkdirSync(join(outPath, '..'), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(bundle, null, 2), 'utf8');
  console.log(
    JSON.stringify(
      {
        source: url.replace(/\/\/.*@/, '//***@').slice(0, 80),
        outPath,
        scopes: scopes ?? 'all',
        items: items.length,
        warnings: warnings.length,
      },
      null,
      2
    )
  );
  if (warnings.length) console.warn(warnings.slice(0, 40).join('\n'));
  console.log(outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
