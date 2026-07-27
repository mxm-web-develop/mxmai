/**
 * 在 provider_models 中注册 AtlasCloud · Seedance 2.0 Mini（video 经济版）
 *
 * 用法（mxmcgi 目录，需 Supabase / .env）：
 *   pnpm run seed:provider-atlascloud-seedance-mini
 *
 * 前置：Admin 或环境变量中已配置 provider=atlascloud 的 API Key（ATLASCLOUD_API_KEY）
 */

import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { getSupabaseClient, RepositoryFactory } from '@mxmai/mxmdata';

const MODEL_KEY = 'bytedance/seedance-2.0-mini';
const UPSTREAM_BASE = 'bytedance/seedance-2.0-mini';

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

/** Atlas 官方约 $0.045/s（Mini 折扣价）；平台售价可按 Admin 调整 */
const MINI_VIDEO_PRICING = {
  charge_mode: 'per_second_video' as const,
  unit_price: 0.045,
  currency: 'USD',
  platform_unit_price: 8,
  platform_min_charge: 8,
};

async function seedPricing(): Promise<void> {
  const sb = getSupabaseClient();
  for (const scope of ['video', 'default'] as const) {
    const { error } = await sb.from('provider_pricing').upsert(
      {
        provider: 'atlascloud',
        scope,
        model_key: MODEL_KEY,
        ...MINI_VIDEO_PRICING,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'provider,scope,model_key' },
    );
    if (error) {
      throw new Error(`provider_pricing atlascloud/${scope}/${MODEL_KEY}: ${error.message}`);
    }
    console.log(`✅ provider_pricing [${scope}] ${MODEL_KEY}`);
  }
}

async function main() {
  loadEnvOnce();
  RepositoryFactory.init();

  const repo = RepositoryFactory.createProviderModelRepository();

  const row = await repo.upsert({
    provider: 'atlascloud',
    scope: 'video',
    model_key: MODEL_KEY,
    upstream_model: UPSTREAM_BASE,
    protocol: 'prediction_video',
    modality: 'video',
    display_name: 'Seedance 2.0 Mini',
    description:
      'AtlasCloud Seedance 2.0 Mini：文生/图生/多参考视频合一入口，运行时自动切换 text/image/reference-to-video 子接口。经济版，约标准版半价。',
    capabilities: {
      input: { text: true, image: true, video: true, audio: true },
      output: { video: true, audio: true },
      modes: ['text-to-video', 'image-to-video', 'reference-to-video'],
    },
    default_parameters: {
      duration: 5,
      resolution: '720p',
      generate_audio: false,
    },
    is_enabled: true,
  } as Parameters<typeof repo.upsert>[0]);

  await seedPricing();

  console.log('✅ provider_models 已写入 Seedance 2.0 Mini:', {
    id: row.id,
    provider: row.provider,
    scope: row.scope,
    model_key: row.model_key,
    upstream_model: row.upstream_model,
    protocol: row.protocol,
    is_enabled: row.is_enabled,
  });
  console.log(
    '\n下一步：\n' +
      '  1. pnpm run apply:bundle -- src/tasks/examples/video-generator-fragment-mini.business.json\n' +
      '  2. 重启 mxmcgi api + worker，使 provider_models 缓存刷新\n' +
      '  3. 自动剪辑 AI 块可改 aiVideoSubtype=fragment-mini 以降本',
  );
}

main().catch((e) => {
  console.error('seed failed:', e);
  process.exit(1);
});
