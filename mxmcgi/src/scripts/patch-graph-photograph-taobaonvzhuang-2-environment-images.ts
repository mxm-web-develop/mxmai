/**
 * 将 graph/photograph/taobaonvzhuang-2 的 rules_i18n 与 taskTemplate（含 environment_images 与 unifiedTemplate）
 * 与仓库内 `src/tasks/examples/graph-photograph-taobaonvzhuang-2.config.json` 对齐。
 *
 * 用法（在 mxmcgi 目录）： pnpm exec tsx src/scripts/patch-graph-photograph-taobaonvzhuang-2-environment-images.ts
 * 等价于执行 seed:graph-taobaonvzhuang-2 中对该行的 prompt 部分更新；若你希望连 graph_scope 一起刷，请用 seed 脚本。
 */
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { RepositoryFactory } from '@mxmai/mxmdata';

function loadEnvOnce() {
  const projectRoot = path.resolve(__dirname, '../../..');
  const mxmcgiDir = path.resolve(projectRoot, 'mxmcgi');
  for (const p of [
    path.resolve(projectRoot, '.env'),
    path.resolve(mxmcgiDir, '.env'),
    path.resolve(process.cwd(), '.env'),
  ]) {
    if (!fs.existsSync(p)) continue;
    dotenv.config({ path: p, override: false });
    return;
  }
  dotenv.config({ override: false });
}

async function main() {
  loadEnvOnce();
  RepositoryFactory.init();

  const cfgPath = path.resolve(__dirname, '../tasks/examples/graph-photograph-taobaonvzhuang-2.config.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) as {
    promptTextTaskKey: string;
    display?: Record<string, unknown>;
    rules_i18n: Record<string, string>;
    output_format_i18n: Record<string, string>;
    taskTemplate: Record<string, unknown>;
  };

  const repo = RepositoryFactory.createPromptEngineeringConfigRepository();
  const row = await repo.findByKey('graph', 'photograph', 'taobaonvzhuang-2');
  if (!row) throw new Error('prompt_engineering_config not found: graph/photograph/taobaonvzhuang-2');

  const extra = {
    ...(row.extra as Record<string, unknown>),
    promptTextTaskKey: cfg.promptTextTaskKey,
    ...(cfg.display ? { display: cfg.display } : {}),
    taskTemplate: cfg.taskTemplate,
  };

  row.rules_i18n = cfg.rules_i18n;
  row.output_format_i18n = cfg.output_format_i18n;
  row.extra = extra;

  await repo.upsert(row as any);
  console.log('patched graph/photograph/taobaonvzhuang-2: rules_i18n + taskTemplate (environment_images + unifiedTemplate)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
