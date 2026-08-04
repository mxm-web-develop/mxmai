/**
 * 注册 jiekou（接口AI）常用模型到 provider_models。
 *
 * 模型 ID 来源：https://docs.jiekou.ai/docs/model/llm-recommended
 * 文本走 OpenAI 兼容 /openai/v1/chat/completions；图/视频走 /v3/{upstream_model}
 *
 * 用法：
 *   pnpm --filter @mxmai/mxmcgi run seed:provider-jiekou-models
 *
 * 生产：
 *   bash scripts/seed-jiekou-production.sh
 *
 * 前置：Admin「API Key 管理」或 JIEKOU_API_KEY 已配置
 */

import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { getSupabaseClient, RepositoryFactory } from '@mxmai/mxmdata';
import { refreshProviderModelCatalog } from '../models/provider-model-catalog';
import { HK_JIEKOU_MODALITIES, withCapabilities } from './data/hk-provider-modalities';
import type { HkModelCapabilities } from './data/hk-provider-modalities';

function jiekouCap(modelKey: string, fallback: HkModelCapabilities): HkModelCapabilities {
  return HK_JIEKOU_MODALITIES[modelKey] ?? fallback;
}

function loadEnvOnce() {
  process.env.DOTENV_CONFIG_DEBUG = 'false';

  const presetUrl = process.env.SUPABASE_URL?.trim();
  if (presetUrl && !presetUrl.includes('localhost') && !presetUrl.includes('127.0.0.1')) {
    return;
  }

  if (process.env.MXM_SEED_PRODUCTION === '1') {
    throw new Error(
      'MXM_SEED_PRODUCTION=1 但未注入生产 SUPABASE_URL（请用 scripts/seed-jiekou-production.sh）',
    );
  }

  const projectRoot = path.resolve(__dirname, '../../..');
  const envPaths = [
    path.resolve(projectRoot, '.env'),
    path.resolve(projectRoot, '.local.env'),
    path.resolve(projectRoot, 'mxmcgi/.env'),
  ];
  for (const p of envPaths) {
    if (fs.existsSync(p)) dotenv.config({ path: p, override: false });
  }
}

loadEnvOnce();

type SeedRow = Parameters<
  ReturnType<typeof RepositoryFactory.createProviderModelRepository>['upsert']
>[0];

const TEXT_DEFAULTS = {
  protocol: 'openai',
  modality: 'text' as const,
  default_parameters: { temperature: 0.7, max_tokens: 20_000 },
  is_enabled: true,
};

const FALLBACK_TEXT: HkModelCapabilities = {
  supported_inputs: ['text'],
  supported_outputs: ['text'],
  modes: ['chat', 'completion'],
};

/** 接口AI 推荐 LLM（chat/completions，upstream 带 vendor 前缀） */
const JIEKOU_LLM_MODELS: SeedRow[] = [
  withCapabilities(
    {
      provider: 'jiekou',
      scope: 'text',
      model_key: 'deepseek-v3',
      upstream_model: 'deepseek/deepseek-v3-0324',
      display_name: 'DeepSeek V3 0324',
      description: '通用推理与写作；接口AI 推荐大型模型',
      ...TEXT_DEFAULTS,
    },
    jiekouCap('deepseek-v3', FALLBACK_TEXT),
  ),
  withCapabilities(
    {
      provider: 'jiekou',
      scope: 'writing',
      model_key: 'deepseek-v3',
      upstream_model: 'deepseek/deepseek-v3-0324',
      display_name: 'DeepSeek V3 0324（写作）',
      description: '写作/长文生成默认推荐',
      ...TEXT_DEFAULTS,
      default_parameters: { temperature: 0.65, max_tokens: 12000 },
    },
    jiekouCap('deepseek-v3', FALLBACK_TEXT),
  ),
  withCapabilities(
    {
      provider: 'jiekou',
      scope: 'text',
      model_key: 'deepseek-r1',
      upstream_model: 'deepseek/deepseek-r1',
      display_name: 'DeepSeek R1',
      description: '推理模型；适合复杂分析与规划',
      ...TEXT_DEFAULTS,
    },
    jiekouCap('deepseek-r1', FALLBACK_TEXT),
  ),
  withCapabilities(
    {
      provider: 'jiekou',
      scope: 'writing',
      model_key: 'deepseek-r1',
      upstream_model: 'deepseek/deepseek-r1',
      display_name: 'DeepSeek R1（写作）',
      description: '深度推理型写作',
      ...TEXT_DEFAULTS,
    },
    jiekouCap('deepseek-r1', FALLBACK_TEXT),
  ),
  withCapabilities(
    {
      provider: 'jiekou',
      scope: 'text',
      model_key: 'gemini-2.5-flash',
      upstream_model: 'google/gemini-2.5-flash',
      display_name: 'Gemini 2.5 Flash',
      description: '低延迟、高性价比；适合摘要与提取',
      ...TEXT_DEFAULTS,
      default_parameters: { temperature: 0.5, max_tokens: 20_000 },
    },
    jiekouCap('gemini-2.5-flash', FALLBACK_TEXT),
  ),
  withCapabilities(
    {
      provider: 'jiekou',
      scope: 'writing',
      model_key: 'gemini-2.5-flash',
      upstream_model: 'google/gemini-2.5-flash',
      display_name: 'Gemini 2.5 Flash（写作）',
      description: '快速写作与自媒体稿',
      ...TEXT_DEFAULTS,
      default_parameters: { temperature: 0.65, max_tokens: 12000 },
    },
    jiekouCap('gemini-2.5-flash', FALLBACK_TEXT),
  ),
  withCapabilities(
    {
      provider: 'jiekou',
      scope: 'text',
      model_key: 'gemini-2.0-flash',
      upstream_model: 'google/gemini-2.0-flash',
      display_name: 'Gemini 2.0 Flash',
      description: '多模态上下文；通用对话',
      ...TEXT_DEFAULTS,
    },
    jiekouCap('gemini-2.0-flash', FALLBACK_TEXT),
  ),
  withCapabilities(
    {
      provider: 'jiekou',
      scope: 'text',
      model_key: 'qwen-2.5-72b',
      upstream_model: 'qwen/qwen-2.5-72b-instruct',
      display_name: 'Qwen 2.5 72B Instruct',
      description: '中文理解与通用推理',
      ...TEXT_DEFAULTS,
    },
    jiekouCap('qwen-2.5-72b', FALLBACK_TEXT),
  ),
  withCapabilities(
    {
      provider: 'jiekou',
      scope: 'writing',
      model_key: 'qwen-2.5-72b',
      upstream_model: 'qwen/qwen-2.5-72b-instruct',
      display_name: 'Qwen 2.5 72B（写作）',
      description: '中文长文写作',
      ...TEXT_DEFAULTS,
    },
    jiekouCap('qwen-2.5-72b', FALLBACK_TEXT),
  ),
  withCapabilities(
    {
      provider: 'jiekou',
      scope: 'text',
      model_key: 'qwen3-235b',
      upstream_model: 'qwen/qwen3-235b-a22b-instruct-2507',
      display_name: 'Qwen3 235B Instruct',
      description: '函数调用与工具使用；大型模型',
      ...TEXT_DEFAULTS,
    },
    jiekouCap('qwen3-235b', FALLBACK_TEXT),
  ),
  withCapabilities(
    {
      provider: 'jiekou',
      scope: 'text',
      model_key: 'llama-3.3-70b',
      upstream_model: 'meta-llama/llama-3.3-70b-instruct',
      display_name: 'Llama 3.3 70B Instruct',
      description: '开源通用中型模型',
      ...TEXT_DEFAULTS,
    },
    jiekouCap('llama-3.3-70b', FALLBACK_TEXT),
  ),
  withCapabilities(
    {
      provider: 'jiekou',
      scope: 'text',
      model_key: 'claude-3-5-sonnet',
      upstream_model: 'anthropic/claude-3-5-sonnet-20241022',
      display_name: 'Claude 3.5 Sonnet',
      description: '代码与推理；Claude 系列推荐',
      ...TEXT_DEFAULTS,
    },
    jiekouCap('claude-3-5-sonnet', FALLBACK_TEXT),
  ),
  withCapabilities(
    {
      provider: 'jiekou',
      scope: 'text',
      model_key: 'glm-4.5',
      upstream_model: 'zai-org/glm-4.5',
      display_name: 'GLM 4.5',
      description: '智谱 GLM；支持 thinking 模式',
      ...TEXT_DEFAULTS,
    },
    jiekouCap('glm-4.5', FALLBACK_TEXT),
  ),
];

/** v3 图/视频端点（upstream 为文档 endpoint 路径） */
const JIEKOU_MEDIA_MODELS: SeedRow[] = [
  withCapabilities(
    {
      provider: 'jiekou',
      scope: 'graph',
      model_key: 'gpt-image-2-light',
      upstream_model: 'gpt-image-2-light-text-to-image',
      protocol: 'jiekou-v3',
      modality: 'image',
      display_name: 'GPT Image 2 Light 文生图',
      description: '接口AI v3 文生图；参考图走 reference_images',
      default_parameters: { aspect_ratio: '1:1', max_wait_ms: 180_000 },
      is_enabled: true,
    },
    jiekouCap('gpt-image-2-light', {
      supported_inputs: ['text', 'image'],
      supported_outputs: ['image'],
      modes: ['text-to-image', 'image-edit'],
    }),
  ),
  withCapabilities(
    {
      provider: 'jiekou',
      scope: 'graph',
      model_key: 'gemini-2.5-flash-image',
      upstream_model: 'gemini-2.5-flash-image-text-to-image',
      protocol: 'jiekou-v3',
      modality: 'image',
      display_name: 'Gemini 2.5 Flash Image 文生图',
      description: 'Gemini 图像生成',
      default_parameters: { aspect_ratio: '3:4', max_wait_ms: 180_000 },
      is_enabled: true,
    },
    jiekouCap('gemini-2.5-flash-image', {
      supported_inputs: ['text', 'image'],
      supported_outputs: ['image'],
      modes: ['text-to-image', 'image-edit'],
    }),
  ),
  withCapabilities(
    {
      provider: 'jiekou',
      scope: 'graph',
      model_key: 'seedream-4.0',
      upstream_model: 'seedream-4.0',
      protocol: 'jiekou-v3',
      modality: 'image',
      display_name: 'Seedream 4.0 文生图',
      description: '字节 Seedream 4.0',
      default_parameters: { aspect_ratio: '1:1', max_wait_ms: 180_000 },
      is_enabled: true,
    },
    jiekouCap('seedream-4.0', {
      supported_inputs: ['text'],
      supported_outputs: ['image'],
      modes: ['text-to-image'],
    }),
  ),
  withCapabilities(
    {
      provider: 'jiekou',
      scope: 'graph',
      model_key: 'nano-banana-light',
      upstream_model: 'nano-banana-light-t2i',
      protocol: 'jiekou-v3',
      modality: 'image',
      display_name: 'Nano Banana Light 文生图',
      description: '轻量高速文生图',
      default_parameters: { aspect_ratio: '1:1', max_wait_ms: 120_000 },
      is_enabled: true,
    },
    jiekouCap('nano-banana-light', {
      supported_inputs: ['text', 'image'],
      supported_outputs: ['image'],
      modes: ['text-to-image', 'image-edit'],
    }),
  ),
  withCapabilities(
    {
      provider: 'jiekou',
      scope: 'video',
      model_key: 'kling-v3-pro-t2v',
      upstream_model: 'async/kling-v3.0-pro-t2v',
      protocol: 'jiekou-v3-async',
      modality: 'video',
      display_name: 'Kling V3.0 Pro 文生视频',
      description: '异步视频；轮询 task-result',
      default_parameters: { duration: 5, aspect_ratio: '16:9', max_wait_ms: 300_000 },
      is_enabled: true,
    },
    jiekouCap('kling-v3-pro-t2v', {
      supported_inputs: ['text', 'image'],
      supported_outputs: ['video'],
      modes: ['text-to-video', 'image-to-video'],
    }),
  ),
  // —— 知识库 embedding（jiekou 上游 qwen3-embedding-8b；pgvector 当前 1536 占位） ——
  withCapabilities(
    {
      provider: 'jiekou',
      scope: 'knowledge',
      model_key: 'qwen3-embedding-8b',
      upstream_model: 'qwen/qwen3-embedding-8b',
      protocol: 'openai-embeddings',
      modality: 'embedding',
      display_name: 'Qwen3 Embedding 8B（jiekou）',
      description: 'jiekou qwen3-embedding-8b 文本向量；与 jina-embeddings-v3 / bge-m3 互为备选',
      default_parameters: { dimensions: 1536 },
      is_enabled: true,
    },
    jiekouCap('qwen3-embedding-8b', {
      supported_inputs: ['text'],
      supported_outputs: ['embed'],
      modes: ['embedding'],
      vector_dim: 1536,
    }),
  ),
];

/** token 类 LLM 默认定价（USD 成本 + 平台 MXM-TOKEN 售价，可按 Admin 调整） */
const JIEKOU_TOKEN_PRICING = {
  charge_mode: 'token_based' as const,
  unit_price: 0,
  input_unit_price: 0.00014,
  output_unit_price: 0.00028,
  currency: 'USD',
  platform_input_unit_price: 0.3,
  platform_output_unit_price: 0.8,
  platform_min_charge: 1,
};

const JIEKOU_GRAPH_PRICING = {
  charge_mode: 'per_image' as const,
  unit_price: 0.02,
  currency: 'USD',
  platform_unit_price: 20,
  platform_min_charge: 5,
};

const JIEKOU_VIDEO_PRICING = {
  charge_mode: 'per_second_video' as const,
  unit_price: 0.01,
  currency: 'USD',
  platform_unit_price: 10,
  platform_min_charge: 10,
};

const JIEKOU_EMBEDDING_PRICING = {
  charge_mode: 'token_based' as const,
  unit_price: 0,
  input_unit_price: 0.00001,
  output_unit_price: 0,
  currency: 'USD',
  platform_input_unit_price: 0.05,
  platform_output_unit_price: 0,
  platform_min_charge: 1,
};

async function seedJiekouPricing(): Promise<number> {
  const sb = getSupabaseClient();
  let count = 0;

  const upsertPricing = async (row: Record<string, unknown>) => {
    const { provider, scope, model_key } = row;
    const { error } = await sb.from('provider_pricing').upsert(row, {
      onConflict: 'provider,scope,model_key',
    });
    if (error) throw new Error(`provider_pricing ${provider}/${scope}/${model_key}: ${error.message}`);
    count += 1;
    console.log(`✅ pricing [${scope}] ${model_key}`);
  };

  const llmKeys = new Set<string>();
  for (const m of JIEKOU_LLM_MODELS) {
    llmKeys.add(m.model_key);
    await upsertPricing({
      provider: 'jiekou',
      scope: m.scope,
      model_key: m.model_key,
      ...JIEKOU_TOKEN_PRICING,
      updated_at: new Date().toISOString(),
    });
  }

  for (const modelKey of llmKeys) {
    await upsertPricing({
      provider: 'jiekou',
      scope: 'default',
      model_key: modelKey,
      ...JIEKOU_TOKEN_PRICING,
      updated_at: new Date().toISOString(),
    });
  }

  for (const m of JIEKOU_MEDIA_MODELS) {
    const pricing = m.scope === 'video' ? JIEKOU_VIDEO_PRICING : JIEKOU_GRAPH_PRICING;
    await upsertPricing({
      provider: 'jiekou',
      scope: m.scope,
      model_key: m.model_key,
      ...pricing,
      updated_at: new Date().toISOString(),
    });
    await upsertPricing({
      provider: 'jiekou',
      scope: 'default',
      model_key: m.model_key,
      ...pricing,
      updated_at: new Date().toISOString(),
    });
  }

  await upsertPricing({
    provider: 'jiekou',
    scope: 'knowledge',
    model_key: 'qwen3-embedding-8b',
    ...JIEKOU_EMBEDDING_PRICING,
    updated_at: new Date().toISOString(),
  });

  const { error: balErr } = await sb.from('provider_balances').upsert(
    {
      provider: 'jiekou',
      balance: 500,
      currency: 'USD',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'provider' }
  );
  if (balErr) throw new Error(`provider_balances jiekou: ${balErr.message}`);
  console.log('✅ provider_balances jiekou → 500 USD（可在 Admin 调整）');

  return count;
}

async function main() {
  RepositoryFactory.init();
  const modelRepo = RepositoryFactory.createProviderModelRepository();

  const all = [...JIEKOU_LLM_MODELS, ...JIEKOU_MEDIA_MODELS];
  let count = 0;
  for (const row of all) {
    const saved = await modelRepo.upsert(row);
    count += 1;
    console.log(`✅ [${saved.scope}] ${saved.model_key} → ${saved.upstream_model}`);
  }

  await refreshProviderModelCatalog();

  console.log('');
  console.log('写入 jiekou provider_pricing / provider_balances...');
  const pricingCount = await seedJiekouPricing();

  console.log('');
  console.log(`完成：共 upsert ${count} 个 jiekou 模型、${pricingCount} 条定价（含已有 knowledge embedding）。`);
  console.log('请确认 Admin 已配置 JIEKOU_API_KEY，然后 reload mxmcgi-api / mxmcgi-worker。');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
