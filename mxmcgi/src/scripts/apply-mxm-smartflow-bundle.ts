/**
 * 将 mxm-smartflow-bundle JSON 写入 DB（与 Smartflow 页「导入 bundle」等价，无需 HTTP）。
 *
 * 用法（在 mxmcgi 目录）：
 *   pnpm run apply:smartflow-bundle -- src/smartflow/examples/eshop-clothes-batch-v1.smartflow.json
 *   pnpm run apply:smartflow-bundle -- path/to/x.smartflow.json --dry-run
 */

import dotenv from 'dotenv';
import { join } from 'path';
import * as fs from 'fs';
import { RepositoryFactory } from '@mxmai/mxmdata';
import type { SmartflowBundle } from '../smartflow/core/smartflow-bundle-types';
import { applyMxmSmartflowBundleImport } from '../smartflow/core/smartflow-bundle-import-apply';

const MXMCGI_ROOT = process.cwd();
const PROJECT_ROOT = join(MXMCGI_ROOT, '..');

dotenv.config({ path: join(MXMCGI_ROOT, '.env') });
dotenv.config({ path: join(PROJECT_ROOT, '.env') });

function usage(): void {
  console.error(
    '用法: pnpm run apply:smartflow-bundle -- <path/to/bundle.smartflow.json> [--dry-run]\n' +
      '示例: pnpm run apply:smartflow-bundle -- src/smartflow/examples/eshop-clothes-batch-v1.smartflow.json'
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

  const raw = fs.readFileSync(path, 'utf8');
  const bundle = JSON.parse(raw) as SmartflowBundle;
  if (bundle.kind !== 'mxm-smartflow-bundle' || !Array.isArray(bundle.items)) {
    console.error('无效的 bundle：需要 kind=mxm-smartflow-bundle 且 items 为数组');
    process.exit(1);
  }

  // 初始化 Supabase（必须在加载 smartflowRepository 之前）
  RepositoryFactory.init();
  const { smartflowRepository } = await import('../smartflow/core/engine/repository');

  const data = await applyMxmSmartflowBundleImport({
    bundle,
    conflictPolicy: dryRun ? 'dry-run' : 'upsert',
    repository: smartflowRepository,
    authorId: null,
  });

  console.log(JSON.stringify({ path, dryRun, ...data }, null, 2));
  if (!dryRun) {
    console.log('\n✅ 已写入 DB。请在 Smartflow 页刷新工作流列表。');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
