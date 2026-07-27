/**
 * 清空本地 scope=text 全部业务（prompt_engineering_config + text_scope_config）。
 * 对齐 Q9=C：本分支不迁移旧 text，按四档从零重建。
 *
 * 用法（mxmcgi 目录，指向本地 Supabase）:
 *   pnpm exec tsx src/scripts/wipe-local-text-businesses.ts
 *   pnpm exec tsx src/scripts/wipe-local-text-businesses.ts --dry-run
 */
import dotenv from 'dotenv';
import { join } from 'path';
import { getSupabaseClient, RepositoryFactory } from '@mxmai/mxmdata';

const MXMCGI_ROOT = process.cwd();
const PROJECT_ROOT = join(MXMCGI_ROOT, '..');

function loadEnvOnce() {
  process.env.DOTENV_CONFIG_DEBUG = 'false';
  const url = process.env.SUPABASE_URL?.trim() ?? '';
  if (url && !url.includes('localhost') && !url.includes('127.0.0.1') && process.env.MXM_ALLOW_REMOTE_WIPE !== '1') {
    throw new Error(
      `拒绝在非本地 Supabase 上清空 text 业务（SUPABASE_URL=${url}）。` +
        `若确需远端，请显式设置 MXM_ALLOW_REMOTE_WIPE=1`
    );
  }
  dotenv.config({ path: join(MXMCGI_ROOT, '.env'), override: false });
  dotenv.config({ path: join(PROJECT_ROOT, '.env'), override: false });
}

loadEnvOnce();

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  RepositoryFactory.init();
  const client = getSupabaseClient();

  const { data: promptRows, error: listErr } = await client
    .from('prompt_engineering_config')
    .select('id, scope, type, subtype')
    .eq('scope', 'text');
  if (listErr) throw listErr;

  const { data: routeRows, error: routeListErr } = await client
    .from('text_scope_config')
    .select('id, task_key, sub_type, logical_model');
  if (routeListErr) throw routeListErr;

  console.log(
    JSON.stringify(
      {
        dryRun,
        prompt_engineering_config: (promptRows ?? []).length,
        text_scope_config: (routeRows ?? []).length,
        samples: {
          prompts: (promptRows ?? []).slice(0, 8),
          routes: (routeRows ?? []).slice(0, 8),
        },
      },
      null,
      2
    )
  );

  if (dryRun) {
    console.log('\n[dry-run] 未删除。去掉 --dry-run 执行清空。');
    return;
  }

  const { error: delPromptErr, count: promptCount } = await client
    .from('prompt_engineering_config')
    .delete({ count: 'exact' })
    .eq('scope', 'text');
  if (delPromptErr) throw delPromptErr;

  const { error: delRouteErr, count: routeCount } = await client
    .from('text_scope_config')
    .delete({ count: 'exact' })
    .neq('id', '00000000-0000-0000-0000-000000000000');
  if (delRouteErr) throw delRouteErr;

  console.log(`\n✅ 已删除 prompt_engineering_config(scope=text)=${promptCount ?? 'n/a'}，text_scope_config=${routeCount ?? 'n/a'}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
