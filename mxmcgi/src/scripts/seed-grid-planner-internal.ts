/**
 * Seed 平台内部 text/grid-planner/internal（不对用户开放，供宫格 Planner 可选档使用）
 *
 * 用法：cd mxmcgi && npx tsx src/scripts/seed-grid-planner-internal.ts
 */
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { RepositoryFactory } from '@mxmai/mxmdata';

function loadEnvOnce() {
  const projectRoot = path.resolve(__dirname, '../../..');
  for (const p of [
    path.join(projectRoot, '.env'),
    path.join(projectRoot, 'mxmcgi', '.env'),
  ]) {
    if (fs.existsSync(p)) {
      dotenv.config({ path: p, override: false });
      return;
    }
  }
  dotenv.config({ override: false });
}

async function main() {
  loadEnvOnce();
  const promptRepo = RepositoryFactory.createPromptEngineeringConfigRepository() as {
    upsert: (row: Record<string, unknown>) => Promise<void>;
  };
  const textRepo = RepositoryFactory.createTextScopeConfigRepository() as {
    upsertConfig: (row: Record<string, unknown>) => Promise<void>;
  };

  const model = process.env.GRID_PLANNER_MODEL || 'gpt-4o-mini';
  const provider = process.env.GRID_PLANNER_PROVIDER || 'qhai';

  await promptRepo.upsert({
    scope: 'text',
    type: 'grid-planner',
    subtype: 'internal',
    rules_i18n: { zh: '', en: '' },
    output_format_i18n: { zh: '', en: '' },
    extra: {
      taskTemplate: {
        formSchema: { type: 'object', properties: {} },
        prompt: {
          unifiedTemplate:
            'You are a grid cell planner. Output JSON only with cells[].directiveEn in English. Never change frozen scene, wardrobe, or grid size.',
        },
      },
    },
    is_active: true,
  });

  await textRepo.upsertConfig({
    scope: 'text',
    task_key: 'grid-planner',
    sub_type: 'internal',
    provider,
    model,
    enabled: true,
  });

  console.log(`[seed] text/grid-planner/internal -> ${provider}/${model}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
