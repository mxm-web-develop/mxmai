/**
 * 注册 AtlasCloud 主力物理模型（LLM / 图 / 视频 / Suno）到 provider_models。
 *
 * 用法：
 *   pnpm --filter @mxmai/mxmcgi run seed:provider-atlascloud-models
 *
 * 定价请另跑：
 *   pnpm --filter @mxmai/mxmcgi run upsert:provider-pricing -- \
 *     --file src/scripts/data/atlascloud-pricing.json
 *
 * 输入/输出模态能力（capabilities.input/output、supported_inputs/outputs、modes）
 * 集中维护在 src/scripts/data/hk-provider-modalities.ts，本文件只关心业务字段。
 */

import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { RepositoryFactory } from '@mxmai/mxmdata';
import { HK_ATLASCLOUD_MODALITIES, withCapabilities } from './data/hk-provider-modalities';
import type { HkModelCapabilities } from './data/hk-provider-modalities';

function loadEnvOnce() {
  process.env.DOTENV_CONFIG_DEBUG = 'false';
  const projectRoot = path.resolve(__dirname, '../../..');
  for (const p of [
    path.join(projectRoot, '.env'),
    path.join(process.cwd(), '.env'),
    path.join(projectRoot, 'mxmcgi', '.env'),
  ]) {
    if (fs.existsSync(p)) {
      dotenv.config({ path: p, override: false });
      return;
    }
  }
  dotenv.config({ override: false });
}

type SeedRow = Parameters<
  ReturnType<typeof RepositoryFactory.createProviderModelRepository>['upsert']
>[0];

/** 兜底：万一 HK 集中表没列也保证 seed 不会因为缺少 capabilities 挂掉 */
const FALLBACK_TEXT: HkModelCapabilities = {
  supported_inputs: ['text'],
  supported_outputs: ['text'],
  modes: ['chat', 'completion'],
};
const FALLBACK_GRAPH: HkModelCapabilities = {
  supported_inputs: ['text', 'image'],
  supported_outputs: ['image'],
  modes: ['text-to-image', 'image-edit'],
};
const FALLBACK_VIDEO: HkModelCapabilities = {
  supported_inputs: ['text', 'image', 'video', 'audio'],
  supported_outputs: ['video', 'audio'],
  modes: ['text-to-video', 'image-to-video', 'reference-to-video'],
};
const FALLBACK_VIDEO_T2V: HkModelCapabilities = {
  supported_inputs: ['text'],
  supported_outputs: ['video'],
  modes: ['text-to-video'],
};
const FALLBACK_MUSIC: HkModelCapabilities = {
  supported_inputs: ['text'],
  supported_outputs: ['audio'],
  modes: ['text-to-music'],
};

function cap(modelKey: string, fallback: HkModelCapabilities): HkModelCapabilities {
  return HK_ATLASCLOUD_MODALITIES[modelKey] ?? fallback;
}

/** 官方页：https://www.atlascloud.ai/models/... */
const ATLAS_MODELS: SeedRow[] = [
  // —— 图 ——
  withCapabilities(
    {
      provider: 'atlascloud',
      scope: 'graph',
      model_key: 'gpt-image-2',
      upstream_model: 'openai/gpt-image-2/text-to-image',
      protocol: 'generate_image',
      modality: 'image',
      display_name: 'GPT Image 2',
      description: 'AtlasCloud OpenAI GPT Image 2 文生图 / 编辑',
      default_parameters: { n: 1 },
      is_enabled: true,
    },
    cap('gpt-image-2', FALLBACK_GRAPH),
  ),
  withCapabilities(
    {
      provider: 'atlascloud',
      scope: 'graph',
      model_key: 'nano-banana-2',
      upstream_model: 'google/nano-banana-2/text-to-image',
      protocol: 'generate_image',
      modality: 'image',
      display_name: 'Nano Banana 2',
      description: 'AtlasCloud Google Nano Banana 2 文生图 / 编辑（约 $0.08/张 1k）',
      default_parameters: { n: 1 },
      is_enabled: true,
    },
    cap('nano-banana-2', FALLBACK_GRAPH),
  ),
  // —— 视频 ——
  withCapabilities(
    {
      provider: 'atlascloud',
      scope: 'video',
      model_key: 'bytedance/seedance-2.0',
      upstream_model: 'bytedance/seedance-2.0',
      protocol: 'prediction_video',
      modality: 'video',
      display_name: 'Seedance 2.0',
      description: 'ByteDance Seedance 2.0 旗舰（文/图/多参考→视频）',
      default_parameters: { duration: 5, resolution: '720p', generate_audio: false },
      is_enabled: true,
    },
    cap('bytedance/seedance-2.0', FALLBACK_VIDEO),
  ),
  withCapabilities(
    {
      provider: 'atlascloud',
      scope: 'video',
      model_key: 'bytedance/seedance-2.0-mini',
      upstream_model: 'bytedance/seedance-2.0-mini',
      protocol: 'prediction_video',
      modality: 'video',
      display_name: 'Seedance 2.0 Mini',
      description: 'Seedance 2.0 经济版，约 $0.045/s',
      default_parameters: { duration: 5, resolution: '720p', generate_audio: false },
      is_enabled: true,
    },
    cap('bytedance/seedance-2.0-mini', FALLBACK_VIDEO),
  ),
  withCapabilities(
    {
      provider: 'atlascloud',
      scope: 'video',
      model_key: 'bytedance/seedance-2.0-fast/text-to-video',
      upstream_model: 'bytedance/seedance-2.0-fast/text-to-video',
      protocol: 'prediction_video',
      modality: 'video',
      display_name: 'Seedance 2.0 Fast T2V',
      description: 'Seedance 2.0 Fast 文生视频',
      default_parameters: { duration: 5 },
      is_enabled: true,
    },
    cap('bytedance/seedance-2.0-fast/text-to-video', FALLBACK_VIDEO_T2V),
  ),
  withCapabilities(
    {
      provider: 'atlascloud',
      scope: 'video',
      model_key: 'bytedance/seedance-v1.5-pro/text-to-video-fast',
      upstream_model: 'bytedance/seedance-v1.5-pro/text-to-video-fast',
      protocol: 'prediction_video',
      modality: 'video',
      display_name: 'Seedance 1.5 Pro Fast',
      description: 'Seedance 1.5 Pro 快速文生视频',
      default_parameters: { duration: 5 },
      is_enabled: true,
    },
    cap('bytedance/seedance-v1.5-pro/text-to-video-fast', FALLBACK_VIDEO_T2V),
  ),
  // —— LLM（text + writing 双 scope） ——
  ...(['text', 'writing'] as const).flatMap(
    (scope): SeedRow[] =>
      (
        [
          {
            model_key: 'anthropic/claude-opus-4.8',
            upstream_model: 'anthropic/claude-opus-4.8',
            display_name: 'Claude Opus 4.8',
            description: 'Anthropic Claude Opus 4.8（Atlas Chat Completions）',
          },
          {
            model_key: 'google/gemini-3.5-flash',
            upstream_model: 'google/gemini-3.5-flash',
            display_name: 'Gemini 3.5 Flash',
            description: 'Google Gemini 3.5 Flash（Atlas Chat Completions）',
          },
          {
            model_key: 'openai/gpt-oss-120b',
            upstream_model: 'openai/gpt-oss-120b',
            display_name: 'GPT-OSS 120B',
            description: 'OpenAI gpt-oss-120b（Atlas Chat Completions）',
          },
        ] as const
      ).map((m) =>
        withCapabilities<SeedRow>(
          {
            provider: 'atlascloud',
            scope,
            model_key: m.model_key,
            upstream_model: m.upstream_model,
            protocol: 'openai_chat',
            modality: 'text',
            display_name: m.display_name,
            description: m.description,
            default_parameters: { max_tokens: 4096, temperature: 0.7 },
            is_enabled: true,
          },
          cap(m.model_key, FALLBACK_TEXT),
        ),
      ),
  ),
  // —— 音乐 Suno Chirp ——
  withCapabilities(
    {
      provider: 'atlascloud',
      scope: 'music',
      model_key: 'suno/chirp-v4',
      upstream_model: 'suno/chirp-v4',
      protocol: 'generate_audio',
      modality: 'music',
      display_name: 'Suno Chirp v4',
      description: 'Suno text-to-music（async generateAudio，约 $0.132/次，返回多轨）',
      default_parameters: { make_instrumental: false },
      is_enabled: true,
    },
    cap('suno/chirp-v4', FALLBACK_MUSIC),
  ),
  withCapabilities(
    {
      provider: 'atlascloud',
      scope: 'music',
      model_key: 'suno/chirp-v5',
      upstream_model: 'suno/chirp-v5',
      protocol: 'generate_audio',
      modality: 'music',
      display_name: 'Suno Chirp v5',
      description: 'Suno Chirp v5 text-to-music（约 $0.132/次）',
      default_parameters: { make_instrumental: false },
      is_enabled: true,
    },
    cap('suno/chirp-v5', FALLBACK_MUSIC),
  ),
];

async function main() {
  loadEnvOnce();
  RepositoryFactory.init();
  const repo = RepositoryFactory.createProviderModelRepository();

  for (const row of ATLAS_MODELS) {
    const saved = await repo.upsert(row);
    console.log(
      `✅ ${saved.provider}/${saved.scope}/${saved.model_key} → ${saved.upstream_model} (${saved.protocol})`,
    );
  }

  console.log(`\n完成 ${ATLAS_MODELS.length} 条。下一步写入定价：`);
  console.log(
    '  pnpm --filter @mxmai/mxmcgi run upsert:provider-pricing -- --file mxmcgi/src/scripts/data/atlascloud-pricing.json',
  );
}

main().catch((e) => {
  console.error('seed-provider-models-atlascloud failed:', e);
  process.exit(1);
});
