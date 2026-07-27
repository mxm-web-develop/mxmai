/**
 * 将电商批量 Smartflow bundle JSON 写入 DB
 *
 * 默认 v2（类型化 input[]）：
 *   pnpm run seed:eshop-smartflow-batch
 * v1：
 *   pnpm run seed:eshop-smartflow-batch -- src/smartflow/examples/eshop-clothes-batch-v1.smartflow.json
 */
import dotenv from 'dotenv';
import { join } from 'path';
import * as fs from 'fs';
import { RepositoryFactory } from '@mxmai/mxmdata';
import type { SmartflowBundle } from '../smartflow/core/smartflow-bundle-types';
import { applyMxmSmartflowBundleImport } from '../smartflow/core/smartflow-bundle-import-apply';

const MXMCGI_ROOT = process.cwd();
const DEFAULT_BUNDLE = 'src/smartflow/examples/eshop-clothes-batch-v2.smartflow.json';

dotenv.config({ path: join(MXMCGI_ROOT, '.env') });
dotenv.config({ path: join(MXMCGI_ROOT, '..', '.env') });

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const positional = process.argv.slice(2).filter((a) => a !== '--dry-run' && a !== '--');
  const rel = positional[0] || DEFAULT_BUNDLE;
  const path = join(MXMCGI_ROOT, rel);
  if (!fs.existsSync(path)) {
    console.error(`bundle 不存在: ${path}`);
    process.exit(1);
  }

  const bundle = JSON.parse(fs.readFileSync(path, 'utf8')) as SmartflowBundle;

  RepositoryFactory.init();
  const { smartflowRepository } = await import('../smartflow/core/engine/repository');

  const data = await applyMxmSmartflowBundleImport({
    bundle,
    conflictPolicy: dryRun ? 'dry-run' : 'upsert',
    repository: smartflowRepository,
  });
  console.log(JSON.stringify({ path: rel, dryRun, ...data }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
