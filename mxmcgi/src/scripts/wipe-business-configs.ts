/**
 * 清空业务配置（prompt + 各 scope 路由 + business_pricing）。
 * 默认只允许本地 Supabase；生产需 MXM_ALLOW_REMOTE_WIPE=1。
 *
 * 不删：provider_models / provider keys / 用户任务 cgi_tasks。
 *
 * 用法（mxmcgi）:
 *   pnpm exec tsx src/scripts/wipe-business-configs.ts --dry-run
 *   pnpm exec tsx src/scripts/wipe-business-configs.ts
 *   MXM_ALLOW_REMOTE_WIPE=1 pnpm exec tsx src/scripts/wipe-business-configs.ts
 */
import dotenv from 'dotenv';
import { join } from 'path';
import { getSupabaseClient, RepositoryFactory } from '@mxmai/mxmdata';

const MXMCGI_ROOT = process.cwd();
const PROJECT_ROOT = join(MXMCGI_ROOT, '..');

const SCOPE_TABLES = [
  'writing_scope_config',
  'graph_scope_config',
  'video_scope_config',
  'audio_scope_config',
  'music_scope_config',
  'text_scope_config',
  'outline_scope_config',
] as const;

function loadEnvOnce() {
  process.env.DOTENV_CONFIG_DEBUG = 'false';
  dotenv.config({ path: join(MXMCGI_ROOT, '.env'), override: false });
  dotenv.config({ path: join(PROJECT_ROOT, '.env'), override: false });
  const url = process.env.SUPABASE_URL?.trim() ?? '';
  if (url && !url.includes('localhost') && !url.includes('127.0.0.1') && process.env.MXM_ALLOW_REMOTE_WIPE !== '1') {
    throw new Error(
      `拒绝在非本地 Supabase 上清空业务配置（SUPABASE_URL=${url}）。` +
        `若确需远端，请显式设置 MXM_ALLOW_REMOTE_WIPE=1`
    );
  }
}

loadEnvOnce();

async function countTable(client: ReturnType<typeof getSupabaseClient>, table: string): Promise<number> {
  const { count, error } = await client.from(table).select('*', { count: 'exact', head: true });
  if (error) throw new Error(`${table} count: ${error.message}`);
  return count ?? 0;
}

async function wipeTable(client: ReturnType<typeof getSupabaseClient>, table: string): Promise<number> {
  const { error, count } = await client.from(table).delete({ count: 'exact' }).not('id', 'is', null);
  if (error) throw new Error(`${table} delete: ${error.message || JSON.stringify(error)}`);
  return count ?? 0;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  RepositoryFactory.init();
  const client = getSupabaseClient();

  const promptCount = await countTable(client, 'prompt_engineering_config');
  const pricingCount = await countTable(client, 'business_pricing');
  const scopeCounts: Record<string, number> = {};
  for (const t of SCOPE_TABLES) {
    try {
      scopeCounts[t] = await countTable(client, t);
    } catch (e) {
      scopeCounts[t] = -1;
      console.warn(`[skip] ${t}: ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        supabase: process.env.SUPABASE_URL,
        prompt_engineering_config: promptCount,
        business_pricing: pricingCount,
        scopes: scopeCounts,
      },
      null,
      2
    )
  );

  if (dryRun) {
    console.log('\n[dry-run] 未删除。去掉 --dry-run 执行清空。');
    return;
  }

  const { error: delPromptErr, count: deletedPrompts } = await client
    .from('prompt_engineering_config')
    .delete({ count: 'exact' })
    .neq('id', '00000000-0000-0000-0000-000000000000');
  if (delPromptErr) throw delPromptErr;

  const { error: delPricingErr, count: deletedPricing } = await client
    .from('business_pricing')
    .delete({ count: 'exact' })
    .neq('id', '00000000-0000-0000-0000-000000000000');
  if (delPricingErr) throw delPricingErr;

  const deletedScopes: Record<string, number> = {};
  for (const t of SCOPE_TABLES) {
    if (scopeCounts[t] < 0) continue;
    deletedScopes[t] = await wipeTable(client, t);
  }

  console.log(
    JSON.stringify(
      {
        deleted: {
          prompt_engineering_config: deletedPrompts ?? 'n/a',
          business_pricing: deletedPricing ?? 'n/a',
          scopes: deletedScopes,
        },
      },
      null,
      2
    )
  );
  console.log('\n✅ 业务配置已清空（保留 provider_models / 密钥 / 任务表）。');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
