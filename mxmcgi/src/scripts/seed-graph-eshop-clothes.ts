/**
 * 写入 graph / eshop / clothes：
 * - prompt_engineering_config（含 extra.taskTemplate、extra.promptTextTaskKey）
 * - graph_scope_config（gpt-image-2-all）
 *
 * 用法（在 mxmcgi 目录）：
 *   pnpm run seed:graph-eshop-clothes
 *
 * 或 bundle 导入（与 Admin import 等价）：
 *   pnpm run apply:bundle -- src/tasks/examples/graph-eshop-clothes.business.json
 */

import dotenv from 'dotenv';
import { join } from 'path';
import * as fs from 'fs';
import { RepositoryFactory } from '@mxmai/mxmdata';

const MXMCGI_ROOT = process.cwd();
const PROJECT_ROOT = join(MXMCGI_ROOT, '..');

dotenv.config({ path: join(MXMCGI_ROOT, '.env') });
dotenv.config({ path: join(PROJECT_ROOT, '.env') });

const CONFIG_PATH = join(MXMCGI_ROOT, 'src', 'tasks', 'examples', 'graph-eshop-clothes.config.json');

type ConfigFile = {
  promptTextTaskKey: string;
  display?: Record<string, unknown>;
  graphRouting: { model: string; provider?: string; margin?: number; charge_metric?: string };
  rules_i18n: Record<string, string>;
  output_format_i18n: Record<string, string>;
  taskTemplate: Record<string, unknown>;
};

async function main() {
  RepositoryFactory.init();
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
  const cfg = JSON.parse(raw) as ConfigFile;

  const promptRepo = RepositoryFactory.createPromptEngineeringConfigRepository();
  const graphScopeRepo = RepositoryFactory.createGraphScopeConfigRepository();

  try {
    const garmentDefault =
      (cfg.taskTemplate as any)?.formSchema?.properties?.garment_images?.items?.properties?.type?.default;
    if (!garmentDefault || garmentDefault === 'main-subject') {
      (cfg.taskTemplate as any).formSchema.properties.garment_images.items.properties.type.default = 'outfits';
    }
  } catch {
    // ignore
  }

  const extra: Record<string, unknown> = {
    promptTextTaskKey: cfg.promptTextTaskKey,
    ...(cfg.display ? { display: cfg.display } : {}),
    taskTemplate: cfg.taskTemplate,
  };

  await promptRepo.upsert({
    scope: 'graph',
    type: 'eshop',
    subtype: 'clothes',
    rules_i18n: cfg.rules_i18n,
    output_format_i18n: cfg.output_format_i18n,
    extra,
    is_active: true,
  });
  console.log('[seed] prompt_engineering_config: graph / eshop / clothes');

  const r = cfg.graphRouting;
  await graphScopeRepo.upsertConfig({
    scope: 'graph',
    task_key: 'eshop',
    sub_type: 'clothes',
    model: r.model,
    provider: r.provider ?? 'qhai',
    enabled: true,
    margin: r.margin,
    charge_metric: r.charge_metric,
  });
  console.log(`[seed] graph_scope_config: eshop / clothes → model=${r.model} provider=${r.provider ?? 'qhai'}`);

  console.log('');
  console.log('✅ 完成。Task V2: scope=graph, taskKey=eshop, subtype=clothes');
  console.log('   前端路由建议: /graph/eshop/clothes');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
