/**
 * 写入 graph / photograph / taobaonvzhuang-2：
 * - prompt_engineering_config（含 extra.taskTemplate、extra.promptTextTaskKey）
 * - graph_scope_config（gpt-image-2-all）
 *
 * 用法（在 mxmcgi 目录）：
 *   pnpm run seed:graph-taobaonvzhuang-2
 *
 * 若你的 text-format 路径不是 text/format/gpt-image-2，请编辑
 * src/tasks/examples/graph-photograph-taobaonvzhuang-2.config.json 中的 promptTextTaskKey。
 */

import dotenv from 'dotenv';
import { join } from 'path';
import * as fs from 'fs';
import { RepositoryFactory } from '@mxmai/mxmdata';

const MXMCGI_ROOT = process.cwd();
const PROJECT_ROOT = join(MXMCGI_ROOT, '..');

dotenv.config({ path: join(MXMCGI_ROOT, '.env') });
dotenv.config({ path: join(PROJECT_ROOT, '.env') });

const CONFIG_PATH = join(MXMCGI_ROOT, 'src', 'tasks', 'examples', 'graph-photograph-taobaonvzhuang-2.config.json');

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

  // 兜底：确保 clothing_images 默认 type=outfits（历史 DB/旧 UI 可能写成 main-subject）
  try {
    const clothingDefault =
      (cfg.taskTemplate as any)?.formSchema?.properties?.clothing_images?.items?.properties?.type?.default;
    if (!clothingDefault || clothingDefault === 'main-subject') {
      (cfg.taskTemplate as any).formSchema.properties.clothing_images.items.properties.type.default = 'outfits';
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
    type: 'photograph',
    subtype: 'taobaonvzhuang-2',
    rules_i18n: cfg.rules_i18n,
    output_format_i18n: cfg.output_format_i18n,
    extra,
    is_active: true,
  });
  console.log('[seed] prompt_engineering_config: graph / photograph / taobaonvzhuang-2');

  const r = cfg.graphRouting;
  await graphScopeRepo.upsertConfig({
    scope: 'graph',
    task_key: 'photograph',
    sub_type: 'taobaonvzhuang-2',
    model: r.model,
    provider: r.provider ?? 'qhai',
    enabled: true,
    margin: r.margin,
    charge_metric: r.charge_metric,
  });
  console.log(`[seed] graph_scope_config: photograph / taobaonvzhuang-2 → model=${r.model} provider=${r.provider ?? 'qhai'}`);

  console.log('');
  console.log('✅ 完成。请在 Admin 刷新业务列表；若 text 业务路径不同，请改 config 中 promptTextTaskKey 后重新执行本脚本。');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
