/**
 * 清空不合规的旧 writing 业务，仅保留：
 *   - writing / generator / industry-daily（行业日报）
 *   - writing / generator / topic-article（话题写作）
 *   - writing / group / deck（演示文稿）
 *
 * 同步清理 writing_scope_config、business_pricing 中对应项。
 * 不删 text/*（管道依赖可保留）；不删 cgi_tasks。
 *
 * 用法（mxmcgi）:
 *   pnpm exec tsx src/scripts/wipe-legacy-writing-businesses.ts --dry-run
 *   pnpm exec tsx src/scripts/wipe-legacy-writing-businesses.ts
 *   MXM_ALLOW_REMOTE_WIPE=1 pnpm exec tsx src/scripts/wipe-legacy-writing-businesses.ts
 */
import dotenv from 'dotenv';
import { join } from 'path';
import { getSupabaseClient, RepositoryFactory } from '@mxmai/mxmdata';

const MXMCGI_ROOT = process.cwd();
const PROJECT_ROOT = join(MXMCGI_ROOT, '..');

const KEEP = [
  { type: 'generator', subtype: 'industry-daily' },
  { type: 'generator', subtype: 'topic-article' },
  { type: 'group', subtype: 'deck' },
] as const;

const KEEP_PRICING_PREFIXES = [
  'writing-generator-industry-daily',
  'writing-generator-topic-article',
  'writing-group-deck',
] as const;

function loadEnvOnce() {
  process.env.DOTENV_CONFIG_DEBUG = 'false';
  const presetUrl = process.env.SUPABASE_URL?.trim() ?? '';
  const remotePreset =
    !!presetUrl && !presetUrl.includes('localhost') && !presetUrl.includes('127.0.0.1');
  // 已注入生产 URL（如 seed-*-production.sh）时不要用本地 .env 覆盖 anon key
  if (!remotePreset) {
    dotenv.config({ path: join(MXMCGI_ROOT, '.env'), override: false });
    dotenv.config({ path: join(PROJECT_ROOT, '.env'), override: false });
  }
  const url = process.env.SUPABASE_URL?.trim() ?? '';
  if (
    url &&
    !url.includes('localhost') &&
    !url.includes('127.0.0.1') &&
    process.env.MXM_ALLOW_REMOTE_WIPE !== '1'
  ) {
    throw new Error(
      `拒绝在非本地 Supabase 上清空 writing（SUPABASE_URL=${url}）。` +
        `确需远端请设 MXM_ALLOW_REMOTE_WIPE=1`
    );
  }
}

function isKeep(type: string, subtype: string | null): boolean {
  return KEEP.some((k) => k.type === type && k.subtype === (subtype ?? ''));
}

function isKeepPricing(businessType: string): boolean {
  return KEEP_PRICING_PREFIXES.some(
    (p) => businessType === p || businessType.startsWith(`${p}/`) || businessType.startsWith(`${p}-`)
  );
}

async function main() {
  loadEnvOnce();
  const dryRun = process.argv.includes('--dry-run');
  RepositoryFactory.init();
  const client = getSupabaseClient();

  console.log('SUPABASE_URL=', process.env.SUPABASE_URL);

  const { data: prompts, error: pErr } = await client
    .from('prompt_engineering_config')
    .select('id, scope, type, subtype, is_active, extra')
    .eq('scope', 'writing');
  if (pErr) throw pErr;

  const keepRows = (prompts ?? []).filter((r) => isKeep(String(r.type), r.subtype ?? null));
  const dropRows = (prompts ?? []).filter((r) => !isKeep(String(r.type), r.subtype ?? null));

  const { data: routes, error: rErr } = await client
    .from('writing_scope_config')
    .select('id, task_key, sub_type');
  if (rErr) throw rErr;

  const dropRoutes = (routes ?? []).filter((r) => !isKeep(String(r.task_key ?? ''), r.sub_type ?? null));

  const { data: pricing, error: prErr } = await client
    .from('business_pricing')
    .select('id, business_type, subtype')
    .like('business_type', 'writing-%');
  if (prErr) throw prErr;

  const dropPricing = (pricing ?? []).filter((r) => !isKeepPricing(String(r.business_type ?? '')));

  const labelOf = (r: { type?: string; subtype?: string | null; extra?: unknown }) => {
    const d =
      r.extra && typeof r.extra === 'object'
        ? ((r.extra as { display?: { taskLabel?: string; subtypeLabel?: string } }).display ?? {})
        : {};
    return `${r.type}/${r.subtype ?? '-'} (${d.taskLabel ?? '?'}/${d.subtypeLabel ?? '?'})`;
  };

  console.log(
    JSON.stringify(
      {
        dryRun,
        keep: keepRows.map(labelOf),
        drop_prompts: dropRows.map(labelOf),
        drop_routes: dropRoutes.map((r) => `${r.task_key}/${r.sub_type}`),
        drop_pricing: dropPricing.map((r) => `${r.business_type} subtype=${r.subtype ?? '-'}`),
        counts: {
          keep: keepRows.length,
          drop_prompts: dropRows.length,
          drop_routes: dropRoutes.length,
          drop_pricing: dropPricing.length,
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

  if (keepRows.length < KEEP.length) {
    console.warn(
      `⚠️ 保留业务不足 ${KEEP.length} 条（当前 ${keepRows.length}）。仍会删除旧业务；请随后 re-seed 行业日报/演示文稿。`
    );
  }

  let deletedPrompts = 0;
  for (const row of dropRows) {
    const { error, count } = await client
      .from('prompt_engineering_config')
      .delete({ count: 'exact' })
      .eq('id', row.id);
    if (error) throw error;
    deletedPrompts += count ?? 1;
  }

  let deletedRoutes = 0;
  for (const row of dropRoutes) {
    const { error, count } = await client
      .from('writing_scope_config')
      .delete({ count: 'exact' })
      .eq('id', row.id);
    if (error) throw error;
    deletedRoutes += count ?? 1;
  }

  let deletedPricing = 0;
  for (const row of dropPricing) {
    const { error, count } = await client
      .from('business_pricing')
      .delete({ count: 'exact' })
      .eq('id', row.id);
    if (error) {
      console.warn('pricing skip', row.business_type, error.message);
      continue;
    }
    deletedPricing += count ?? 1;
  }

  console.log(
    `\n✅ 已删除旧 writing：prompt=${deletedPrompts} route=${deletedRoutes} pricing=${deletedPricing}`
  );
  console.log('保留:', KEEP.map((k) => `writing/${k.type}/${k.subtype}`).join(', '));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
