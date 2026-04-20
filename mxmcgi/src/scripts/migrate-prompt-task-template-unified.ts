/**
 * 将 prompt_engineering_config.extra.taskTemplate.prompt 从旧版 system/user/output 合并为仅 unifiedTemplate，
 * 与运行时 loadTaskDefinition 行为一致。执行后请用 Admin 再保存一次以刷新 Markup（可选）。
 *
 *   pnpm --filter @mxmai/mxmcgi run migrate:prompt-unified
 */

import dotenv from 'dotenv';
import { join } from 'path';
import { RepositoryFactory } from '@mxmai/mxmdata';
import { composeLegacyPromptToUnified } from '../tasks/prompt-template';

const MXMCGI_ROOT = process.cwd();
const PROJECT_ROOT = join(MXMCGI_ROOT, '..');
dotenv.config({ path: join(MXMCGI_ROOT, '.env') });
dotenv.config({ path: join(PROJECT_ROOT, '.env') });

async function main() {
  RepositoryFactory.init();
  const repo = RepositoryFactory.createPromptEngineeringConfigRepository();
  const { items } = await repo.list({ limit: 5000, offset: 0 });
  let n = 0;
  for (const row of items) {
    const extra = (row.extra ?? {}) as Record<string, unknown>;
    const tt = extra.taskTemplate as Record<string, unknown> | undefined;
    if (!tt || typeof tt !== 'object') continue;
    const prompt = (tt.prompt as Record<string, unknown>) ?? {};
    const rulesZh = row.rules_i18n?.zh ?? '';
    const outZh = row.output_format_i18n?.zh ?? '';

    let unified = typeof prompt.unifiedTemplate === 'string' ? String(prompt.unifiedTemplate).trim() : '';
    if (!unified) {
      unified = composeLegacyPromptToUnified({
        systemTemplate: typeof prompt.systemTemplate === 'string' ? prompt.systemTemplate : undefined,
        userTemplate: typeof prompt.userTemplate === 'string' ? prompt.userTemplate : undefined,
        outputFormatTemplate: typeof prompt.outputFormatTemplate === 'string' ? prompt.outputFormatTemplate : undefined,
        rulesFallback: rulesZh,
        outputFormatFallback: outZh,
      });
    }
    if (!unified) continue;

    const markup =
      typeof prompt.unifiedTemplateMarkup === 'string' && String(prompt.unifiedTemplateMarkup).trim()
        ? String(prompt.unifiedTemplateMarkup)
        : unified;

    const nextTT = {
      ...tt,
      prompt: {
        unifiedTemplate: unified,
        unifiedTemplateMarkup: markup,
      },
    };
    const nextExtra = { ...extra, taskTemplate: nextTT };

    await repo.upsert({
      scope: row.scope,
      type: row.type,
      subtype: row.subtype ?? null,
      rules_i18n: row.rules_i18n,
      output_format_i18n: row.output_format_i18n,
      form_options_i18n: row.form_options_i18n,
      extra: nextExtra,
      is_active: row.is_active,
    });
    n += 1;
    console.log(`OK ${row.scope}/${row.type}/${row.subtype ?? '-'}`);
  }
  console.log(`Done. Migrated ${n} / ${items.length} rows.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
