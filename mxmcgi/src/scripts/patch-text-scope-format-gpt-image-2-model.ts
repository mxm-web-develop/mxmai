/**
 * text/format/gpt-image-2 路由 → gemini-3.5-flash（默认 openrouter）
 *
 * 用法：pnpm run patch:text-scope-format-gpt-image-2
 */
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { RepositoryFactory } from '@mxmai/mxmdata';

const MODEL = 'gemini-3.5-flash';
const PROVIDER = 'openrouter';

function loadEnvOnce() {
  const projectRoot = path.resolve(__dirname, '../../..');
  for (const p of [path.join(projectRoot, '.env'), path.join(process.cwd(), '.env')]) {
    if (fs.existsSync(p)) {
      dotenv.config({ path: p, override: false });
      return;
    }
  }
  dotenv.config({ override: false });
}

async function main() {
  loadEnvOnce();
  RepositoryFactory.init();

  const repo = RepositoryFactory.createTextScopeConfigRepository();
  await repo.upsertConfig({
    scope: 'text',
    task_key: 'format',
    sub_type: 'gpt-image-2',
    logical_model: 'text-format-gpt-image-2',
    model: MODEL,
    provider: PROVIDER,
    enabled: true,
  });

  console.log(`✅ text_scope_config: text / format / gpt-image-2 → ${PROVIDER} / ${MODEL}`);
  console.log('   请确认 provider_models 中已有 scope=text 的 gemini-3.5-flash 通道');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
