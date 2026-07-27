/**
 * OpenRouter 图生通道：逻辑名保持 gpt-image-2*，上游为 openai/gpt-5-image
 *
 * 用法：pnpm --filter mxmcgi run seed:provider-openrouter-gpt-image
 *
 * @see https://openrouter.ai/openai/gpt-5-image
 */
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { RepositoryFactory } from '@mxmai/mxmdata';

/** 默认上游；若连通性 403 region，可改为 google/gemini-2.5-flash-image 等 */
const UPSTREAM = process.env.OPENROUTER_IMAGE_UPSTREAM || 'openai/gpt-5-image';

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
  const repo = RepositoryFactory.createProviderModelRepository();

  const rows = [
    {
      model_key: 'gpt-image-2',
      display_name: 'GPT Image 2 (OpenRouter → gpt-5-image)',
      description: 'Deer 下架后的图生/编辑替代：OpenRouter chat/completions + modalities',
    },
    {
      model_key: 'gpt-image-2-all',
      display_name: 'GPT Image 2 All (OpenRouter → gpt-5-image)',
      description: '电商商拍逻辑名；上游 openai/gpt-5-image',
    },
  ];

  for (const row of rows) {
    const saved = await repo.upsert({
      provider: 'openrouter',
      scope: 'graph',
      model_key: row.model_key,
      upstream_model: UPSTREAM,
      protocol: 'openrouter-image-chat',
      modality: 'image',
      display_name: row.display_name,
      description: row.description,
      capabilities: {
        input: { text: true, image: true },
        output: { image: true },
      },
      default_parameters: {},
      is_enabled: true,
    } as Parameters<typeof repo.upsert>[0]);
    console.log('✅', saved.provider, saved.model_key, '→', saved.upstream_model);
  }

  console.log('\n下一步：');
  console.log('  1. Admin 配置 OPENROUTER_API_KEY');
  console.log('  2. graph 路由 provider 改为 openrouter / model gpt-image-2-all');
  console.log('  3. 若 openai/gpt-5-image 报 403 region，设置 OPENROUTER_IMAGE_UPSTREAM=google/gemini-2.5-flash-image 后重跑本脚本');
  console.log('  4. 或图生继续用 qhai + gpt-image-2（国内通常更稳）');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
