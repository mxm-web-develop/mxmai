/**
 * 停用废弃 writing/editorial/*（规范仅允许 generator|group|series）。
 * 行业日报已迁至 writing/generator/industry-daily。
 *
 * 用法:
 *   pnpm run deactivate:legacy-writing-editorial
 */
import dotenv from 'dotenv';
import { join } from 'path';
import { RepositoryFactory } from '@mxmai/mxmdata';

const MXMCGI_ROOT = process.cwd();
const PROJECT_ROOT = join(MXMCGI_ROOT, '..');

function loadEnvOnce() {
  process.env.DOTENV_CONFIG_DEBUG = 'false';
  const presetUrl = process.env.SUPABASE_URL?.trim();
  if (presetUrl && !presetUrl.includes('localhost') && !presetUrl.includes('127.0.0.1')) {
    return;
  }
  if (process.env.MXM_SEED_PRODUCTION === '1') {
    throw new Error('MXM_SEED_PRODUCTION=1 但未注入生产 SUPABASE_URL');
  }
  dotenv.config({ path: join(MXMCGI_ROOT, '.env'), override: false });
  dotenv.config({ path: join(PROJECT_ROOT, '.env'), override: false });
}

async function main() {
  loadEnvOnce();
  RepositoryFactory.init();
  const repo = RepositoryFactory.createPromptEngineeringConfigRepository();
  const results: Array<Record<string, unknown>> = [];

  const listed = await repo.list({ scope: 'writing', type: 'editorial', limit: 200 });
  const rows = listed.items ?? [];
  const targets =
    rows.length > 0
      ? rows
      : [
          await repo.findByKey('writing', 'editorial', 'industry-daily'),
          await repo.findByKey('writing', 'editorial', 'warp-demo-daily'),
        ].filter(Boolean);

  for (const row of targets) {
    if (!row) continue;
    const key = `writing/${row.type}/${row.subtype ?? '-'}`;
    if (!row.is_active) {
      results.push({ key, status: 'already_inactive', id: row.id });
      continue;
    }
    await repo.upsert({
      scope: row.scope,
      type: row.type,
      subtype: row.subtype,
      extra: row.extra ?? undefined,
      is_active: false,
      updated_by: null,
    });
    results.push({ key, status: 'deactivated', id: row.id });
  }

  // 若 list 未返回，强制扫 industry-daily
  if (!results.some((r) => String(r.key).includes('industry-daily'))) {
    const row = await repo.findByKey('writing', 'editorial', 'industry-daily');
    if (row?.is_active) {
      await repo.upsert({
        scope: row.scope,
        type: row.type,
        subtype: row.subtype,
        extra: row.extra ?? undefined,
        is_active: false,
        updated_by: null,
      });
      results.push({ key: 'writing/editorial/industry-daily', status: 'deactivated', id: row.id });
    } else if (!row) {
      results.push({ key: 'writing/editorial/industry-daily', status: 'not_found' });
    } else {
      results.push({ key: 'writing/editorial/industry-daily', status: 'already_inactive', id: row.id });
    }
  }

  // 禁用 writing_scope_config 中 task_key=editorial
  const writingRepo = RepositoryFactory.createWritingScopeConfigRepository();
  const routes = await writingRepo.listConfigs({ scope: 'writing', task_key: 'editorial', limit: 100 });
  if (!routes.items?.length) {
    results.push({ key: 'route:writing/editorial/*', status: 'not_found' });
  }
  for (const cfg of routes.items ?? []) {
    const key = `route:writing/${cfg.task_key}/${cfg.sub_type}`;
    if (!cfg.task_key) {
      results.push({ key, status: 'skip_invalid', id: cfg.id });
      continue;
    }
    if (!cfg.enabled) {
      results.push({ key, status: 'already_disabled', id: cfg.id });
      continue;
    }
    await writingRepo.upsertConfig({
      scope: cfg.scope,
      task_key: cfg.task_key,
      sub_type: cfg.sub_type,
      provider: cfg.provider,
      model: cfg.model,
      enabled: false,
    });
    results.push({ key, status: 'route_disabled', id: cfg.id });
  }

  console.log(
    JSON.stringify(
      {
        note: 'writing type=editorial 已废弃；行业日报现行 writing/generator/industry-daily',
        results,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
