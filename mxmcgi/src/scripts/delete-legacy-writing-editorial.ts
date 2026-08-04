/**
 * 硬删除废弃 writing/editorial/*（规范仅允许 generator|group|series）。
 * 行业日报现行：writing/generator/industry-daily。
 *
 *   pnpm exec tsx src/scripts/delete-legacy-writing-editorial.ts
 *   pnpm exec tsx src/scripts/delete-legacy-writing-editorial.ts --dry-run
 *   MXM_ALLOW_REMOTE_WIPE=1 pnpm exec tsx src/scripts/delete-legacy-writing-editorial.ts
 *
 * 兼容旧入口：deactivate:legacy-writing-editorial → 本脚本（硬删，非仅 is_active=false）
 */
import dotenv from 'dotenv';
import { join } from 'path';
import { getSupabaseClient, RepositoryFactory } from '@mxmai/mxmdata';

const MXMCGI_ROOT = process.cwd();
const PROJECT_ROOT = join(MXMCGI_ROOT, '..');

function loadEnvOnce() {
  process.env.DOTENV_CONFIG_DEBUG = 'false';
  const presetUrl = process.env.SUPABASE_URL?.trim();
  if (presetUrl && !presetUrl.includes('localhost') && !presetUrl.includes('127.0.0.1')) {
    if (process.env.MXM_ALLOW_REMOTE_WIPE !== '1') {
      throw new Error(
        `拒绝在非本地 Supabase 上删除（SUPABASE_URL=${presetUrl}）。确需远端请设 MXM_ALLOW_REMOTE_WIPE=1`
      );
    }
    return;
  }
  if (process.env.MXM_SEED_PRODUCTION === '1' && !presetUrl) {
    throw new Error('MXM_SEED_PRODUCTION=1 但未注入生产 SUPABASE_URL');
  }
  dotenv.config({ path: join(MXMCGI_ROOT, '.env'), override: false });
  dotenv.config({ path: join(PROJECT_ROOT, '.env'), override: false });
  const url = process.env.SUPABASE_URL?.trim() ?? '';
  if (url && !url.includes('localhost') && !url.includes('127.0.0.1') && process.env.MXM_ALLOW_REMOTE_WIPE !== '1') {
    throw new Error(
      `拒绝在非本地 Supabase 上删除（SUPABASE_URL=${url}）。确需远端请设 MXM_ALLOW_REMOTE_WIPE=1`
    );
  }
}

async function main() {
  loadEnvOnce();
  RepositoryFactory.init();
  const client = getSupabaseClient();
  const dryRun = process.argv.includes('--dry-run');

  const { data: prompts, error: listErr } = await client
    .from('prompt_engineering_config')
    .select('id, scope, type, subtype, is_active')
    .eq('scope', 'writing')
    .eq('type', 'editorial');
  if (listErr) throw listErr;

  const { data: routes, error: routeErr } = await client
    .from('writing_scope_config')
    .select('id, task_key, sub_type, model, enabled')
    .eq('task_key', 'editorial');
  if (routeErr) throw routeErr;

  // 历史 pricing 键：writing-editorial-*
  const { data: pricing, error: priceErr } = await client
    .from('business_pricing')
    .select('id, business_type')
    .like('business_type', 'writing-editorial-%');
  if (priceErr) {
    console.warn('business_pricing 查询跳过:', priceErr.message);
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        note: 'writing type=editorial 已废弃；行业日报现行 writing/generator/industry-daily',
        prompts: prompts ?? [],
        routes: routes ?? [],
        pricing: pricing ?? [],
      },
      null,
      2
    )
  );

  if (dryRun) {
    console.log('\n[dry-run] 未删除');
    return;
  }

  const { error: e1, count: c1 } = await client
    .from('prompt_engineering_config')
    .delete({ count: 'exact' })
    .eq('scope', 'writing')
    .eq('type', 'editorial');
  if (e1) throw e1;

  const { error: e2, count: c2 } = await client
    .from('writing_scope_config')
    .delete({ count: 'exact' })
    .eq('task_key', 'editorial');
  if (e2) throw e2;

  let c3: number | null = null;
  const { error: e3, count } = await client
    .from('business_pricing')
    .delete({ count: 'exact' })
    .like('business_type', 'writing-editorial-%');
  if (e3) {
    console.warn('business_pricing 删除跳过:', e3.message);
  } else {
    c3 = count;
  }

  console.log(
    `\n✅ 已删除 writing/editorial/*：prompt=${c1 ?? 'n/a'} route=${c2 ?? 'n/a'} pricing=${c3 ?? 'n/a'}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
