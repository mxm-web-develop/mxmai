/**
 * 注册 maxplan（国内 MiniMax Token Plan / api.minimaxi.com）到 DB 表：
 * - provider_models（物理模型目录，Admin 可改）
 * - audio_scope_config / music_scope_config（业务路由，Admin 可改）
 *
 * 用法：
 *   # 生产库（从主服务器 .env 注入 Supabase，勿用本地 localhost）
 *   bash scripts/seed-maxplan-production.sh
 *
 *   # 或手动指定 Supabase 后：
 *   SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=... \
 *     pnpm --filter @mxmai/mxmcgi run seed:provider-maxplan-models
 *
 * 前置：Admin「API Key 管理」或 MAXPLAN_API_KEY 已配置 maxplan Key
 */

import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { RepositoryFactory } from '@mxmai/mxmdata';
import { HK_MAXPLAN_MODALITIES, withCapabilities } from './data/hk-provider-modalities';
import type { HkModelCapabilities } from './data/hk-provider-modalities';

function maxplanCap(modelKey: string, fallback: HkModelCapabilities): HkModelCapabilities {
  return HK_MAXPLAN_MODALITIES[modelKey] ?? fallback;
}

async function patchLegacyScopeRoutes() {
  const textRepo = RepositoryFactory.createTextScopeConfigRepository();
  const writingRepo = RepositoryFactory.createWritingScopeConfigRepository();
  const FROM = 'MiniMax-M3-highspeed';
  const TO = 'MiniMax-M3';

  for (const repo of [textRepo, writingRepo]) {
    const { items } = await repo.listConfigs({ limit: 500 });
    for (const row of items) {
      if (row.provider !== 'maxplan' || row.model !== FROM) continue;
      await repo.upsertConfig({
        scope: row.scope,
        task_key: row.task_key,
        sub_type: row.sub_type,
        model: TO,
        provider: 'maxplan',
        enabled: row.enabled ?? true,
        logical_model: row.logical_model ?? undefined,
      });
      console.log('🔧 scope route', row.task_key, row.sub_type, `${FROM} → ${TO}`);
    }
  }
}

function loadEnvOnce() {
  process.env.DOTENV_CONFIG_DEBUG = 'false';

  const presetUrl = process.env.SUPABASE_URL?.trim();
  if (presetUrl && !presetUrl.includes('localhost') && !presetUrl.includes('127.0.0.1')) {
    return;
  }

  if (process.env.MXM_SEED_PRODUCTION === '1') {
    throw new Error(
      'MXM_SEED_PRODUCTION=1 但未注入生产 SUPABASE_URL（请用 scripts/seed-maxplan-production.sh）',
    );
  }

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
    dotenv.config({ path: p, override: false });
  }

  const url = process.env.SUPABASE_URL ?? '';
  if (url.includes('localhost') || url.includes('127.0.0.1')) {
    console.warn(
      '⚠️  当前 SUPABASE_URL 指向本地 PostgREST，Admin 生产环境看不到变更。\n' +
        '    请执行: bash scripts/seed-maxplan-production.sh',
    );
  }
}

type SeedRow = Parameters<
  ReturnType<typeof RepositoryFactory.createProviderModelRepository>['upsert']
>[0];

/** 全部写入 provider_models 表；运行时仅读 DB，不在代码里写死 model 列表 */
const MAXPLAN_PROVIDER_MODELS: SeedRow[] = [
  withCapabilities(
    {
      provider: 'maxplan',
      scope: 'graph',
      model_key: 'image-01',
      upstream_model: 'image-01',
      protocol: 'image_generation',
      modality: 'image',
      display_name: 'MiniMax image-01（Token Plan 生图）',
      description: '国内 api.minimaxi.com 文生图 / 图生图（人物主体参考）',
      default_parameters: { response_format: 'url', n: 1, aspect_ratio: '1:1' },
      is_enabled: true,
    },
    maxplanCap('image-01', {
      supported_inputs: ['text', 'image'],
      supported_outputs: ['image'],
      modes: ['text-to-image', 'image-to-image', 'subject-reference'],
    }),
  ),
  withCapabilities(
    {
      provider: 'maxplan',
      scope: 'graph',
      model_key: 'image-01-live',
      upstream_model: 'image-01-live',
      protocol: 'image_generation',
      modality: 'image',
      display_name: 'MiniMax image-01-live（多画风）',
      description: 'image-01 增强版，支持多种画风设置',
      default_parameters: { response_format: 'url', n: 1, aspect_ratio: '1:1' },
      is_enabled: true,
    },
    maxplanCap('image-01-live', {
      supported_inputs: ['text', 'image'],
      supported_outputs: ['image'],
      modes: ['text-to-image', 'image-to-image', 'style-transfer'],
    }),
  ),
  withCapabilities(
    {
      provider: 'maxplan',
      scope: 'text',
      model_key: 'MiniMax-M3',
      upstream_model: 'MiniMax-M3',
      protocol: 'chatcompletion_v2',
      modality: 'text',
      display_name: 'MiniMax M3（Token Plan）',
      description:
        '国内 Token Plan 唯一 M3 文本模型（api.minimaxi.com chatcompletion_v2）；1M 上下文，推荐 max_completion_tokens=131072。text/writing 业务共用此物理模型。',
      default_parameters: {
        temperature: 0.7,
        max_tokens: 131072,
        max_completion_tokens: 131072,
      },
      is_enabled: true,
    },
    maxplanCap('MiniMax-M3', {
      supported_inputs: ['text'],
      supported_outputs: ['text'],
      modes: ['chat', 'completion', 'long-context'],
      context_window: 1_000_000,
      max_output_tokens: 131_072,
    }),
  ),
  withCapabilities(
    {
      provider: 'maxplan',
      scope: 'music',
      model_key: 'music-2.5',
      upstream_model: 'music-2.5',
      protocol: 'music_generation',
      modality: 'music',
      display_name: 'MiniMax Music 2.5（Token Plan 音乐）',
      description: '国内 Token Plan 文生音乐（2.5 档）',
      default_parameters: {
        output_format: 'url',
        is_instrumental: false,
        audio_setting: { sample_rate: 44100, bitrate: 256000, format: 'mp3' },
      },
      is_enabled: true,
    },
    maxplanCap('music-2.5', {
      supported_inputs: ['text'],
      supported_outputs: ['audio'],
      modes: ['text-to-music'],
    }),
  ),
  withCapabilities(
    {
      provider: 'maxplan',
      scope: 'music',
      model_key: 'music-2.6',
      upstream_model: 'music-2.6',
      protocol: 'music_generation',
      modality: 'music',
      display_name: 'MiniMax Music 2.6（Token Plan 音乐）',
      description: '国内 Token Plan 文生音乐（2.6 推荐档）',
      default_parameters: {
        output_format: 'url',
        is_instrumental: false,
        audio_setting: { sample_rate: 44100, bitrate: 256000, format: 'mp3' },
      },
      is_enabled: true,
    },
    maxplanCap('music-2.6', {
      supported_inputs: ['text'],
      supported_outputs: ['audio'],
      modes: ['text-to-music'],
    }),
  ),
  withCapabilities(
    {
      provider: 'maxplan',
      scope: 'audio',
      model_key: 'speech-2.8-hd',
      upstream_model: 'speech-2.8-hd',
      protocol: 't2a_v2',
      modality: 'audio',
      display_name: 'MiniMax Speech 2.8 HD（Token Plan TTS）',
      description: '国内 Token Plan 高保真 TTS，支持情感/语气词标签',
      default_parameters: {
        voice_setting: { voice_id: 'female-shaonv', speed: 1, vol: 1, pitch: 0 },
        audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3' },
        subtitle_enable: true,
        subtitle_type: 'sentence',
        language_boost: 'Chinese',
      },
      is_enabled: true,
    },
    maxplanCap('speech-2.8-hd', {
      supported_inputs: ['text'],
      supported_outputs: ['audio'],
      modes: ['text-to-speech', 'voice-clone'],
    }),
  ),
  withCapabilities(
    {
      provider: 'maxplan',
      scope: 'audio',
      model_key: 'speech-2.8-turbo',
      upstream_model: 'speech-2.8-turbo',
      protocol: 't2a_v2',
      modality: 'audio',
      display_name: 'MiniMax Speech 2.8 Turbo（Token Plan TTS）',
      description: '国内 Token Plan 低延迟 TTS，适合对话/Agent',
      default_parameters: {
        voice_setting: { voice_id: 'female-shaonv', speed: 1, vol: 1, pitch: 0 },
        audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3' },
        subtitle_enable: true,
        subtitle_type: 'sentence',
        language_boost: 'Chinese',
      },
      is_enabled: true,
    },
    maxplanCap('speech-2.8-turbo', {
      supported_inputs: ['text'],
      supported_outputs: ['audio'],
      modes: ['text-to-speech'],
    }),
  ),
  withCapabilities(
    {
      provider: 'maxplan',
      scope: 'audio',
      model_key: 'speech-2.6-hd',
      upstream_model: 'speech-2.6-hd',
      protocol: 't2a_v2',
      modality: 'audio',
      display_name: 'MiniMax Speech 2.6 HD（Token Plan TTS）',
      description: '国内 Token Plan 2.6 高保真 TTS',
      default_parameters: {
        voice_setting: { voice_id: 'female-shaonv', speed: 1, vol: 1, pitch: 0 },
        audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3' },
        subtitle_enable: true,
        subtitle_type: 'sentence',
        language_boost: 'Chinese',
      },
      is_enabled: true,
    },
    maxplanCap('speech-2.6-hd', {
      supported_inputs: ['text'],
      supported_outputs: ['audio'],
      modes: ['text-to-speech'],
    }),
  ),
  withCapabilities(
    {
      provider: 'maxplan',
      scope: 'audio',
      model_key: 'speech-2.6-turbo',
      upstream_model: 'speech-2.6-turbo',
      protocol: 't2a_v2',
      modality: 'audio',
      display_name: 'MiniMax Speech 2.6 Turbo（Token Plan TTS）',
      description: '国内 Token Plan 2.6 极速 TTS',
      default_parameters: {
        voice_setting: { voice_id: 'female-shaonv', speed: 1, vol: 1, pitch: 0 },
        audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3' },
        subtitle_enable: true,
        subtitle_type: 'sentence',
        language_boost: 'Chinese',
      },
      is_enabled: true,
    },
    maxplanCap('speech-2.6-turbo', {
      supported_inputs: ['text'],
      supported_outputs: ['audio'],
      modes: ['text-to-speech'],
    }),
  ),
];

/** 旧版/误配模型：停用但保留行（避免硬编码在 runtime） */
const MAXPLAN_LEGACY_DISABLE: Array<{ scope: string; model_key: string }> = [
  { scope: 'text', model_key: 'MiniMax-M2.7' },
  { scope: 'text', model_key: 'MiniMax-M2.7-highspeed' },
  { scope: 'writing', model_key: 'MiniMax-M2.7-highspeed' },
  { scope: 'text', model_key: 'MiniMax-M3-highspeed' },
  { scope: 'writing', model_key: 'MiniMax-M3-highspeed' },
];

/** 业务路由写入 scope_config 表（Admin 业务管理可读可改） */
const MAXPLAN_SCOPE_ROUTES = [
  {
    table: 'audio' as const,
    scope: 'audio',
    task_key: 'speak',
    sub_type: 'voice-over-test',
    model: 'speech-2.8-hd',
    provider: 'maxplan',
  },
  {
    table: 'audio' as const,
    scope: 'audio',
    task_key: 'speak',
    sub_type: 'default',
    model: 'speech-2.8-hd',
    provider: 'maxplan',
  },
  {
    table: 'music' as const,
    scope: 'music',
    task_key: 'default',
    sub_type: 'default',
    model: 'music-2.6',
    provider: 'maxplan',
  },
  {
    table: 'music' as const,
    scope: 'music',
    task_key: 'compose',
    sub_type: 'maxplan-direct',
    model: 'music-2.6',
    provider: 'maxplan',
  },
  {
    table: 'music' as const,
    scope: 'music',
    task_key: 'compose',
    sub_type: 'maxplan-test',
    model: 'music-2.6',
    provider: 'maxplan',
  },
];

async function disableLegacyModels(
  repo: ReturnType<typeof RepositoryFactory.createProviderModelRepository>,
) {
  for (const leg of MAXPLAN_LEGACY_DISABLE) {
    const hit = await repo.findByKey({
      provider: 'maxplan',
      scope: leg.scope,
      model_key: leg.model_key,
    });
    if (!hit) continue;
    await repo.setEnabled(hit.id, false);
    console.log('🛑 已停用旧模型', leg.scope, leg.model_key);
  }
}

async function seedScopeRoutes() {
  for (const r of MAXPLAN_SCOPE_ROUTES) {
    const repo =
      r.table === 'audio'
        ? RepositoryFactory.createAudioScopeConfigRepository()
        : RepositoryFactory.createMusicScopeConfigRepository();
    const saved = await repo.upsertConfig({
      scope: r.scope,
      task_key: r.task_key,
      sub_type: r.sub_type,
      model: r.model,
      provider: r.provider,
      enabled: true,
    });
    console.log(
      '✅ scope route',
      r.table,
      `${saved.task_key}/${saved.sub_type}`,
      '→',
      `${saved.provider}/${saved.model}`,
    );
  }
}

async function main() {
  loadEnvOnce();
  RepositoryFactory.init();

  const url = process.env.SUPABASE_URL ?? '';
  console.log('目标 Supabase:', url.includes('supabase.co') ? url : url || '(未设置)');

  const repo = RepositoryFactory.createProviderModelRepository();

  for (const row of MAXPLAN_PROVIDER_MODELS) {
    const saved = await repo.upsert(row);
    console.log('✅ provider_models', saved.scope, saved.model_key, '→', saved.upstream_model);
  }

  await disableLegacyModels(repo);
  await patchLegacyScopeRoutes();
  await seedScopeRoutes();

  const all = await repo.list({ provider: 'maxplan', onlyEnabled: true });
  console.log('\n生产库 maxplan 已启用物理模型:', all.length, '条');
  console.log(
    '\n请在 Admin → Provider 管理 → 物理模型目录 刷新查看。\n' +
      '业务路由已写入 audio_scope_config / music_scope_config，可在业务管理中调整。',
  );
}

main().catch((e) => {
  console.error('seed failed:', e);
  process.exit(1);
});
