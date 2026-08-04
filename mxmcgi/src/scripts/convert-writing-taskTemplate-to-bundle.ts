/**
 * 将 tasks/examples 下的 writing taskTemplate JSON 转为 mxm-business-bundle（单条）。
 * 不连库；生成后请补全 businessPricing / display / routing 细项。
 *
 *   pnpm exec tsx src/scripts/convert-writing-taskTemplate-to-bundle.ts \
 *     src/tasks/examples/writing-outlines-tech-article.taskTemplate.json \
 *     generator tech-outline maxplan MiniMax-M3
 */

import * as fs from 'fs';

function buildLogicalModel(scope: string, type: string, subtype: string | null): string {
  const map: Record<string, string> = {
    outlines: 'writing-outlines',
    articles: 'writing-articles',
    lyrics: 'writing-lyrics',
    'suno-lyrics': 'writing-lyrics',
    'voice-scripts': 'writing-voice-scripts',
    'storyboard-scripts': 'writing-storyboard-scripts',
    'media-post': 'writing-media-post',
    reviews: 'writing-reviews',
    resumes: 'writing-resumes',
  };
  const base = map[type] ?? `writing-${type}`;
  if (subtype && subtype !== 'default' && String(subtype).trim() !== '') {
    return `${base}-${subtype}`;
  }
  return base;
}

function main() {
  const [path, type, subtype, provider, model] = process.argv.slice(2);
  if (!path || !type || !subtype || !provider || !model) {
    console.error(
      'Usage: tsx src/scripts/convert-writing-taskTemplate-to-bundle.ts <taskTemplate.json> <type> <subtype> <provider> <model>'
    );
    process.exit(1);
  }
  const raw = fs.readFileSync(path, 'utf8');
  const parsed = JSON.parse(raw) as { taskTemplate?: Record<string, unknown> };
  const taskTemplate = parsed.taskTemplate ?? parsed;
  const scope = 'writing';
  const logical = buildLogicalModel(scope, type, subtype);

  const bundle = {
    schemaVersion: 1,
    kind: 'mxm-business-bundle',
    exportedAt: new Date().toISOString(),
    items: [
      {
        scope,
        type,
        subtype,
        is_active: true,
        rules_i18n: { zh: '', en: '' },
        output_format_i18n: { zh: '', en: '' },
        form_options_i18n: null,
        extra: {
          display: {
            taskLabel: `写作 · ${type}/${subtype}`,
            subtypeLabel: `${subtype}`,
          },
          taskTemplate,
        },
        routing: {
          logical_model: logical,
          provider,
          model,
          enabled: true,
          sensitive_word_lists: [] as string[],
        },
        businessPricing: [] as unknown[],
        linkedTextFormat: null,
      },
    ],
  };

  console.log(JSON.stringify(bundle, null, 2));
}

main();
