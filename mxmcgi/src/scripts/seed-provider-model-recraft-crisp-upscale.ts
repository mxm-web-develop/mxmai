/**
 * 在 provider_models 中注册 Replicate · recraft-crisp-upscale（graph 高清放大 tools/hd 依赖）
 *
 * 用法（mxmcgi 目录，需 Supabase / .env）：
 *   pnpm run seed:provider-recraft-crisp-upscale
 *
 * 前置：Admin 或环境变量中已配置 provider=replicate 的 API Key（REPLICATE_API_TOKEN）
 */

import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { RepositoryFactory } from '@mxmai/mxmdata';

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

async function main() {
  loadEnvOnce();
  RepositoryFactory.init();

  const repo = RepositoryFactory.createProviderModelRepository();

  const row = await repo.upsert({
    provider: 'replicate',
    scope: 'graph',
    model_key: 'recraft-crisp-upscale',
    upstream_model: 'recraft-ai/recraft-crisp-upscale',
    protocol: 'replicate-prediction',
    modality: 'image',
    display_name: 'Recraft Crisp Upscale',
    description:
      'Recraft 高质量图片放大（纯 input_image，无 prompt）。用于 graph tools/hd 高清放大业务。',
    capabilities: {
      input: { image: true },
      output: { image: true },
    },
    default_parameters: {
      num_images: 1,
    },
    is_enabled: true,
  } as Parameters<typeof repo.upsert>[0]);

  console.log('✅ provider_models 已写入 recraft-crisp-upscale:', {
    id: row.id,
    provider: row.provider,
    scope: row.scope,
    model_key: row.model_key,
    upstream_model: row.upstream_model,
    is_enabled: row.is_enabled,
  });
  console.log(
    '\n下一步：\n' +
      '  1. 确认 Replicate API Key 已在 Admin「Provider 密钥」或环境变量 REPLICATE_API_TOKEN 中配置\n' +
      '  2. pnpm run seed:graph-tools-hd（若尚未导入 tools/hd 业务 bundle）\n' +
      '  3. 重启 mxmcgi api + worker，使 provider_models 缓存刷新'
  );
}

main().catch((e) => {
  console.error('seed failed:', e);
  process.exit(1);
});
