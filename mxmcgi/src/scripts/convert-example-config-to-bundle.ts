/**
 * 将 tasks/examples 下的简化 graph config JSON 转为可 POST import 的 business bundle（单条）。
 * 不连库；用于生成模板文件或手工补全后导入。
 *
 *   pnpm exec tsx src/scripts/convert-example-config-to-bundle.ts \
 *     src/tasks/examples/graph-photograph-taobaonvzhuang-2.config.json
 */

import * as fs from 'fs';

function buildLogicalModel(scope: string, type: string, subtype: string | null): string {
  const base = scope === 'graph' ? `graph-${type}` : `${scope}-${type}`;
  if (subtype && subtype !== 'default') return `${base}-${subtype}`;
  return base;
}

function main() {
  const path = process.argv[2];
  if (!path) {
    console.error('Usage: tsx src/scripts/convert-example-config-to-bundle.ts <path-to-example.config.json>');
    process.exit(1);
  }
  const raw = fs.readFileSync(path, 'utf8');
  const cfg = JSON.parse(raw) as {
    promptTextTaskKey?: string;
    display?: Record<string, unknown>;
    graphRouting?: { model: string; provider?: string; margin?: number; charge_metric?: string };
    rules_i18n?: Record<string, string>;
    output_format_i18n?: Record<string, string>;
    taskTemplate?: Record<string, unknown>;
  };

  const scope = 'graph';
  const type = 'photograph';
  const subtype = 'taobaonvzhuang-2';
  const logical = buildLogicalModel(scope, type, subtype);
  const gr = cfg.graphRouting;

  const item: Record<string, unknown> = {
    scope,
    type,
    subtype,
    is_active: true,
    rules_i18n: cfg.rules_i18n ?? { zh: '', en: '' },
    output_format_i18n: cfg.output_format_i18n ?? { zh: '', en: '' },
    form_options_i18n: null,
    extra: {
      promptTextTaskKey: cfg.promptTextTaskKey,
      ...(cfg.display ? { display: cfg.display } : {}),
      taskTemplate: cfg.taskTemplate ?? {},
    },
    routing: gr
      ? {
          logical_model: logical,
          provider: gr.provider ?? 'qhai',
          model: gr.model,
          enabled: true,
          margin: gr.margin,
          charge_metric: gr.charge_metric,
          sensitive_word_lists: [],
        }
      : null,
    businessPricing: [],
    linkedTextFormat: null,
  };

  const bundle = {
    schemaVersion: 1,
    kind: 'mxm-business-bundle',
    exportedAt: new Date().toISOString(),
    items: [item],
  };

  console.log(JSON.stringify(bundle, null, 2));
}

main();
