/**
 * 将 text/format/gpt-image-2 的 unifiedTemplate 与 generateParams 同步为 bundle 源文件。
 * 推荐：pnpm run seed:text-format-gpt-image-2（整包 import，含 routing）
 *
 * 用法：pnpm run patch:text-format-gpt-image-2
 */
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { RepositoryFactory } from '@mxmai/mxmdata';

const BUNDLE_REL = 'src/tasks/examples/text-format-gpt-image-2.business.json';

function loadEnvOnce() {
  process.env.DOTENV_CONFIG_DEBUG = 'false';
  const projectRoot = path.resolve(__dirname, '../../..');
  const mxmcgiDir = path.resolve(projectRoot, 'mxmcgi');
  const envPaths = [
    path.resolve(projectRoot, '.env'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(mxmcgiDir, '.env'),
    path.resolve(process.cwd(), 'mxmcgi', '.env'),
    path.resolve(projectRoot, 'mxmdata', '.env'),
  ];
  for (const p of envPaths) {
    if (!fs.existsSync(p)) continue;
    const r = dotenv.config({ path: p, override: false });
    if (!r.error) return;
  }
  dotenv.config({ override: false });
}

function loadBundleTemplate(): {
  unifiedTemplate: string;
  generateParams: Record<string, unknown>;
} {
  const bundlePath = path.resolve(__dirname, '..', 'tasks/examples/text-format-gpt-image-2.business.json');
  if (!fs.existsSync(bundlePath)) {
    throw new Error(`缺少 bundle 源文件: ${BUNDLE_REL}`);
  }
  const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8')) as {
    items: Array<{ extra?: { taskTemplate?: { prompt?: { unifiedTemplate?: string }; extra?: { generateParams?: Record<string, unknown> } } } }>;
  };
  const item = bundle.items?.[0];
  const unifiedTemplate = item?.extra?.taskTemplate?.prompt?.unifiedTemplate;
  if (!unifiedTemplate?.trim()) {
    throw new Error(`${BUNDLE_REL} 缺少 taskTemplate.prompt.unifiedTemplate`);
  }
  const generateParams = item?.extra?.taskTemplate?.extra?.generateParams ?? {
    temperature: 0.2,
    topP: 0.9,
    maxTokens: 4096,
  };
  return { unifiedTemplate, generateParams };
}

async function main() {
  loadEnvOnce();
  RepositoryFactory.init();

  const { unifiedTemplate, generateParams } = loadBundleTemplate();

  const repo = RepositoryFactory.createPromptEngineeringConfigRepository();
  const existing = await repo.findByKey('text', 'format', 'gpt-image-2');
  if (!existing) {
    throw new Error('prompt_engineering_config missing for text/format/gpt-image-2');
  }

  const nextExtra = {
    ...(existing.extra ?? {}),
    taskTemplate: {
      ...((existing.extra as any)?.taskTemplate ?? {}),
      prompt: {
        ...(((existing.extra as any)?.taskTemplate as any)?.prompt ?? {}),
        unifiedTemplate,
        unifiedTemplateMarkup: '\n' + unifiedTemplate,
      },
      extra: {
        ...(((existing.extra as any)?.taskTemplate as any)?.extra ?? {}),
        generateParams,
      },
    },
  };

  await repo.upsert({
    id: existing.id,
    scope: 'text',
    type: 'format',
    subtype: 'gpt-image-2',
    rules_i18n: existing.rules_i18n ?? {},
    output_format_i18n: existing.output_format_i18n ?? {},
    form_options_i18n: existing.form_options_i18n ?? null,
    extra: nextExtra,
    is_active: true,
    updated_by: existing.updated_by ?? null,
  });

  console.log(`patched text/format/gpt-image-2 from ${BUNDLE_REL}`);
}

main().catch((e) => {
  console.error('patch failed:', e);
  process.exit(1);
});
