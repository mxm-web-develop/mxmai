/**
 * 将 mxm-business-bundle JSON 写入 DB（与 Admin「业务 bundle 导入」等价，无需 HTTP）。
 *
 * 用法（在 mxmcgi 目录，需可用 Supabase / mxmdata 环境变量）：
 *   pnpm run apply:bundle -- src/tasks/examples/graph-design-characterInfocard.business.json
 *   pnpm run apply:bundle -- path/to/x.business.json --dry-run
 */

import dotenv from 'dotenv';
import { join } from 'path';
import * as fs from 'fs';
import { RepositoryFactory } from '@mxmai/mxmdata';
import type { BusinessBundle } from '../routes/business-bundle-types';
import { applyMxmBusinessBundleImport } from '../routes/business-bundle-import-apply';

const MXMCGI_ROOT = process.cwd();
const PROJECT_ROOT = join(MXMCGI_ROOT, '..');

function loadEnvOnce() {
  process.env.DOTENV_CONFIG_DEBUG = 'false';
  const presetUrl = process.env.SUPABASE_URL?.trim();
  if (presetUrl && !presetUrl.includes('localhost') && !presetUrl.includes('127.0.0.1')) {
    return;
  }
  if (process.env.MXM_SEED_PRODUCTION === '1') {
    throw new Error(
      'MXM_SEED_PRODUCTION=1 但未注入生产 SUPABASE_URL（请用 scripts/seed-maxplan-production.sh 同类方式 source 服务器 .env）',
    );
  }
  dotenv.config({ path: join(MXMCGI_ROOT, '.env'), override: false });
  dotenv.config({ path: join(PROJECT_ROOT, '.env'), override: false });
}

loadEnvOnce();

function usage(): void {
  console.error(
    '用法: pnpm run apply:bundle -- <path/to/bundle.business.json> [--dry-run]\n' +
      '示例: pnpm run apply:bundle -- src/tasks/examples/graph-design-characterInfocard.business.json\n' +
      '或: pnpm run seed:graph-design-characterInfocard'
  );
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const positional = args.filter((a) => a !== '--dry-run' && a !== '--');
  const fileArg = positional[0];
  if (!fileArg) {
    usage();
    process.exit(1);
  }
  const abs = join(MXMCGI_ROOT, fileArg);
  const path = fs.existsSync(fileArg) ? fileArg : fs.existsSync(abs) ? abs : fileArg;
  if (!fs.existsSync(path)) {
    console.error(`文件不存在: ${path}`);
    process.exit(1);
  }

  RepositoryFactory.init();
  const raw = fs.readFileSync(path, 'utf8');
  const bundle = JSON.parse(raw) as BusinessBundle;
  if (bundle.kind !== 'mxm-business-bundle' || !Array.isArray(bundle.items)) {
    console.error('无效的 bundle：需要 kind=mxm-business-bundle 且 items 为数组');
    process.exit(1);
  }

  const data = await applyMxmBusinessBundleImport({
    bundle,
    conflictPolicy: dryRun ? 'dry-run' : 'upsert',
    userId: null,
  });

  console.log(JSON.stringify({ path, dryRun, ...data }, null, 2));
  if (!dryRun) {
    console.log('\n✅ 已写入 DB。请在 Admin 刷新业务列表。');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
