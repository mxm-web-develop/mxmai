/**
 * 删除已弃用的 writing/generator/seek-piece（探索单稿）。
 * 角度探索已改 groupItemBatch 同任务成稿，勿再通过 bundle upsert 复活此业务。
 *
 *   pnpm exec tsx src/scripts/delete-writing-seek-piece.ts
 *   MXM_ALLOW_REMOTE_WIPE=1 pnpm exec tsx src/scripts/delete-writing-seek-piece.ts
 */
import dotenv from 'dotenv';
import { join } from 'path';
import { getSupabaseClient, RepositoryFactory } from '@mxmai/mxmdata';

const MXMCGI_ROOT = process.cwd();
const PROJECT_ROOT = join(MXMCGI_ROOT, '..');

function loadEnvOnce() {
  process.env.DOTENV_CONFIG_DEBUG = 'false';
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

  const { data: rows, error: listErr } = await client
    .from('prompt_engineering_config')
    .select('id, scope, type, subtype, is_active')
    .eq('scope', 'writing')
    .eq('type', 'generator')
    .eq('subtype', 'seek-piece');
  if (listErr) throw listErr;

  const { data: routes, error: routeErr } = await client
    .from('writing_scope_config')
    .select('id, task_key, sub_type, logical_model')
    .or('sub_type.eq.seek-piece,logical_model.eq.writing-generator-seek-piece');
  if (routeErr) throw routeErr;

  console.log(JSON.stringify({ dryRun, prompts: rows, routes }, null, 2));
  if (dryRun) {
    console.log('\n[dry-run] 未删除');
    return;
  }

  const { error: e1, count: c1 } = await client
    .from('prompt_engineering_config')
    .delete({ count: 'exact' })
    .eq('scope', 'writing')
    .eq('type', 'generator')
    .eq('subtype', 'seek-piece');
  if (e1) throw e1;

  const { error: e2, count: c2 } = await client
    .from('writing_scope_config')
    .delete({ count: 'exact' })
    .eq('sub_type', 'seek-piece');
  if (e2) throw e2;

  const { error: e3, count: c3 } = await client
    .from('business_pricing')
    .delete({ count: 'exact' })
    .eq('business_type', 'writing-generator-seek-piece');
  if (e3) {
    console.warn('business_pricing 删除跳过:', e3.message);
  }

  console.log(
    `\n✅ 已删除 seek-piece：prompt=${c1 ?? 'n/a'} route=${c2 ?? 'n/a'} pricing=${c3 ?? 'n/a'}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
