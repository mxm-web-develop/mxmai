/**
 * 导出本地全部业务为 mxm-business-bundle JSON。
 *
 *   cd mxmcgi && pnpm exec tsx src/scripts/export-local-businesses-bundle.ts [/tmp/out.bundle.json]
 */
import dotenv from 'dotenv';
import { join } from 'path';
import * as fs from 'fs';
import { RepositoryFactory, getSupabaseClient } from '@mxmai/mxmdata';
import type { BusinessBundle, BusinessBundleItem } from '../routes/business-bundle-types';
import { buildSensitiveNameIndex, getScopeRepo } from '../routes/business-bundle-import-apply';
import { buildLogicalModel } from '../routes/business-bundle';

const MXMCGI_ROOT = process.cwd();
const PROJECT_ROOT = join(MXMCGI_ROOT, '..');

function loadLocalEnv() {
  process.env.DOTENV_CONFIG_DEBUG = 'false';
  dotenv.config({ path: join(PROJECT_ROOT, '.env'), override: true });
  dotenv.config({ path: join(MXMCGI_ROOT, '.env'), override: false });
  const url = process.env.SUPABASE_URL?.trim() ?? '';
  if (!url.includes('localhost') && !url.includes('127.0.0.1')) {
    throw new Error(`导出源必须是本地 Supabase，当前 SUPABASE_URL=${url}`);
  }
  if (process.env.SUPABASE_SERVICE_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_KEY;
  }
  // 导出优先用 service role，避免 RLS 漏数据
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  }
}

async function main() {
  loadLocalEnv();
  RepositoryFactory.init();
  const client = getSupabaseClient();
  const { data: rows, error } = await client
    .from('prompt_engineering_config')
    .select('*')
    .order('scope')
    .order('type')
    .order('subtype');
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

  const outArg = process.argv[2];
  const outPath = outArg
    ? outArg.startsWith('/')
      ? outArg
      : join(MXMCGI_ROOT, outArg)
    : join(PROJECT_ROOT, 'tmp', `local-businesses-${Date.now()}.bundle.json`);
  fs.mkdirSync(join(outPath, '..'), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(bundle, null, 2), 'utf8');

  console.log(JSON.stringify({ outPath, items: items.length, warnings: warnings.length }, null, 2));
  if (warnings.length) {
    console.warn(warnings.slice(0, 40).join('\n'));
  }
  console.log(outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
