/**
 * 将 prompt_engineering_config 中的写作大纲配置迁移到新的大纲 scope。
 *
 * 迁移逻辑（最小可用）：
 * - source：scope=writing, type=outlines, subtype=null
 * - target：scope=outline, type=default, subtype=null
 *
 * 用法：
 *   pnpm tsx src/scripts/migrate-writing-outlines-to-outline-scope.ts
 */

import dotenv from 'dotenv';
import { join } from 'path';
import { RepositoryFactory } from '@mxmai/mxmdata';

const MXMCGI_ROOT = process.cwd();
const PROJECT_ROOT = join(MXMCGI_ROOT, '..');

dotenv.config({ path: join(MXMCGI_ROOT, '.env') });
dotenv.config({ path: join(PROJECT_ROOT, '.env') });

async function main() {
  RepositoryFactory.init();
  const repo = RepositoryFactory.createPromptEngineeringConfigRepository();

  const source = await repo.findByKey('writing', 'outlines', null);
  if (!source) {
    console.error('❌ 未找到源配置：scope=writing, type=outlines, subtype=null');
    process.exit(1);
  }

  const targetType = 'default';
  const targetScope = 'outline';

  await repo.upsert({
    scope: targetScope,
    type: targetType,
    subtype: null,
    rules_i18n: source.rules_i18n ?? undefined,
    output_format_i18n: source.output_format_i18n ?? undefined,
    extra: source.extra ?? undefined,
    is_active: true,
  });

  console.log(`✅ 已迁移配置：writing/outlines -> outline/${targetType}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

