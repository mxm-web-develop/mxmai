/**
 * 香港服务器（mxm-hk / 8.218.14.129）当前在线物理模型的输入/输出能力（modality）配置
 *
 * 单一来源 ——
 *   1. seed-provider-models-{atlascloud,maxplan,jiekou}.ts 引用本文件，写入生产 provider_models.capabilities
 *   2. scripts/sync-modality-capacities-production.sh 通过 sync-modality-capacities.ts 拉本文件做"只更新 capabilities" 的幂等补齐
 *   3. Admin ProviderRoutes UI 展示"模型能力" Tab 时回显本字段
 *
 * 双写结构（与 mxmdata 现有 seed 兼容）：
 *   {
 *     // 旧（嵌套对象，admin 老表单曾用）
 *     input:  { text: true, image: true, ... },
 *     output: { video: true, audio: true, ... },
 *     // 新（拍平数组，本次新增；运行时优先读）
 *     supported_inputs:  ['text', 'image', ...],
 *     supported_outputs: ['video', 'audio', ...],
 *     // 可选：*-to-* 模式（atlascloud 官方风格）
 *     modes: ['text-to-video', 'image-to-video', ...],
 *     // 已有：业务参数
 *     context_window?: number,
 *     max_output_tokens?: number,
 *     vector_dim?: number,
 *   }
 *
 * 6 个枚举值（与 AtlasCloud 官方归类对齐）：
 *   text / image / audio / video / 3d / embed
 */

import type { Modality } from '../../models/provider-modality';

/** 单一模型的完整 capabilities 描述（双写） */
export interface HkModelCapabilities {
  supported_inputs: Modality[];
  supported_outputs: Modality[];
  modes?: string[];
  context_window?: number;
  max_output_tokens?: number;
  vector_dim?: number;
}

type SeedRow = Parameters<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ReturnType<any>['upsert']
>[0];

/** 把 HkModelCapabilities 转成"老 seed 嵌套 + 新拍平"双写对象，注入到 SeedRow.capabilities */
export function toCapabilities(cap: HkModelCapabilities): Record<string, unknown> {
  const built: Record<string, unknown> = {
    // 新（拍平数组）—— 运行时优先
    supported_inputs: cap.supported_inputs,
    supported_outputs: cap.supported_outputs,
    // 老（嵌套对象）—— 兼容旧 seed/Admin
    input: legacyBoolMap(cap.supported_inputs),
    output: legacyBoolMap(cap.supported_outputs),
  };
  if (cap.modes && cap.modes.length > 0) built.modes = cap.modes;
  if (cap.context_window != null) built.context_window = cap.context_window;
  if (cap.max_output_tokens != null) built.max_output_tokens = cap.max_output_tokens;
  if (cap.vector_dim != null) built.vector_dim = cap.vector_dim;
  return built;
}

function legacyBoolMap(modalities: Modality[]): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const m of modalities) out[m] = true;
  return out;
}

/** 把 toCapabilities() 的结果填到 SeedRow 上（in-place 返回新对象） */
export function withCapabilities<T extends object>(row: T, cap: HkModelCapabilities): T & { capabilities: Record<string, unknown> } {
  return { ...row, capabilities: toCapabilities(cap) };
}

// =====================================================================
// AtlasCloud（HK 主力通道之一）
// 来源：https://www.atlascloud.ai/models + mxmcgi/src/models/atlascloud/* 现有 seed
// =====================================================================

const ATLAS_TEXT_BASE: HkModelCapabilities = {
  // Atlas 上 Gemini/Claude/GPT 等 LLM 的输入不止 text：Gemini 3.5 Flash 支持 图/视频/音频；
  // Claude Opus 4.8 / gpt-oss-120b 仅文本输入。所有都输出文本。
  supported_inputs: ['text'],
  supported_outputs: ['text'],
  modes: ['chat', 'completion'],
};

const ATLAS_GEMINI_35: HkModelCapabilities = {
  // Gemini 3.5 Flash 系列原生多模态：可读图、视频、音频
  supported_inputs: ['text', 'image', 'video', 'audio'],
  supported_outputs: ['text'],
  modes: ['chat', 'completion', 'multimodal-qa'],
};

const ATLAS_CLAUDE_OPUS: HkModelCapabilities = {
  // Claude Opus 4.8 支持 image（PDF/截图），不支持视频/音频
  supported_inputs: ['text', 'image'],
  supported_outputs: ['text'],
  modes: ['chat', 'completion', 'vision-qa'],
};

export const HK_ATLASCLOUD_MODALITIES: Record<string, HkModelCapabilities> = {
  // —— 图 ——
  'gpt-image-2': {
    supported_inputs: ['text', 'image'],
    supported_outputs: ['image'],
    modes: ['text-to-image', 'image-edit'],
  },
  'nano-banana-2': {
    supported_inputs: ['text', 'image'],
    supported_outputs: ['image'],
    modes: ['text-to-image', 'image-edit', 'reference-to-image'],
  },
  // —— 视频 ——
  'bytedance/seedance-2.0': {
    supported_inputs: ['text', 'image', 'video', 'audio'],
    supported_outputs: ['video', 'audio'],
    modes: [
      'text-to-video',
      'image-to-video',
      'reference-to-video',
      'video-edit',
      'video-extension',
    ],
  },
  'bytedance/seedance-2.0-mini': {
    supported_inputs: ['text', 'image', 'video', 'audio'],
    supported_outputs: ['video', 'audio'],
    modes: ['text-to-video', 'image-to-video', 'reference-to-video'],
  },
  'bytedance/seedance-2.0-fast/text-to-video': {
    supported_inputs: ['text'],
    supported_outputs: ['video'],
    modes: ['text-to-video'],
  },
  'bytedance/seedance-v1.5-pro/text-to-video-fast': {
    supported_inputs: ['text'],
    supported_outputs: ['video'],
    modes: ['text-to-video'],
  },
  // —— LLM（text + writing 双 scope 共用） ——
  'anthropic/claude-opus-4.8': ATLAS_CLAUDE_OPUS,
  'google/gemini-3.5-flash': ATLAS_GEMINI_35,
  'openai/gpt-oss-120b': ATLAS_TEXT_BASE,
  // DeepSeek V4 / GLM-5.2：纯文本（Atlas /v1/models input_modalities=text）
  'deepseek-ai/deepseek-v4-flash': {
    supported_inputs: ['text'],
    supported_outputs: ['text'],
    modes: ['chat', 'completion', 'long-context'],
    context_window: 1_048_576,
    max_output_tokens: 393_216,
  },
  'deepseek-ai/deepseek-v4-pro': {
    supported_inputs: ['text'],
    supported_outputs: ['text'],
    modes: ['chat', 'completion', 'long-context'],
    context_window: 1_048_576,
    max_output_tokens: 393_216,
  },
  'zai-org/glm-5.2': {
    supported_inputs: ['text'],
    supported_outputs: ['text'],
    modes: ['chat', 'completion', 'long-context'],
    context_window: 1_048_576,
    max_output_tokens: 131_072,
  },
  // GPT 5.6 系列：text + image 输入（Atlas API modalities）
  'openai/gpt-5.6-luna': {
    supported_inputs: ['text', 'image'],
    supported_outputs: ['text'],
    modes: ['chat', 'completion', 'vision-qa', 'long-context'],
    context_window: 1_050_000,
    max_output_tokens: 131_072,
  },
  'openai/gpt-5.6-terra': {
    supported_inputs: ['text', 'image'],
    supported_outputs: ['text'],
    modes: ['chat', 'completion', 'vision-qa', 'long-context'],
    context_window: 1_050_000,
    max_output_tokens: 131_072,
  },
  'openai/gpt-5.6-sol': {
    supported_inputs: ['text', 'image'],
    supported_outputs: ['text'],
    modes: ['chat', 'completion', 'vision-qa', 'long-context'],
    context_window: 1_050_000,
    max_output_tokens: 131_072,
  },
  // —— 音乐 Suno ——
  'suno/chirp-v4': {
    supported_inputs: ['text'],
    supported_outputs: ['audio'],
    modes: ['text-to-music'],
  },
  'suno/chirp-v5': {
    supported_inputs: ['text'],
    supported_outputs: ['audio'],
    modes: ['text-to-music'],
  },
};

// =====================================================================
// maxplan（国内 Token Plan / api.minimaxi.com）
// =====================================================================

export const HK_MAXPLAN_MODALITIES: Record<string, HkModelCapabilities> = {
  'image-01': {
    supported_inputs: ['text', 'image'],
    supported_outputs: ['image'],
    modes: ['text-to-image', 'image-to-image', 'subject-reference'],
  },
  'image-01-live': {
    supported_inputs: ['text', 'image'],
    supported_outputs: ['image'],
    modes: ['text-to-image', 'image-to-image', 'style-transfer'],
  },
  'MiniMax-M3': {
    // 官方：原生多模态（text + image + video 输入 → text 输出）；OpenAI/Anthropic 兼容 API 均支持 image_url / video_url
    // https://platform.minimax.io/docs/api-reference/text-openai-api
    supported_inputs: ['text', 'image', 'video'],
    supported_outputs: ['text'],
    modes: ['chat', 'completion', 'long-context', 'vision-qa', 'multimodal-qa'],
    context_window: 1_000_000,
    max_output_tokens: 131_072,
  },
  'music-2.5': {
    supported_inputs: ['text'],
    supported_outputs: ['audio'],
    modes: ['text-to-music'],
  },
  'music-2.6': {
    supported_inputs: ['text'],
    supported_outputs: ['audio'],
    modes: ['text-to-music'],
  },
  'speech-2.8-hd': {
    supported_inputs: ['text'],
    supported_outputs: ['audio'],
    modes: ['text-to-speech', 'voice-clone'],
  },
  'speech-2.8-turbo': {
    supported_inputs: ['text'],
    supported_outputs: ['audio'],
    modes: ['text-to-speech'],
  },
  'speech-2.6-hd': {
    supported_inputs: ['text'],
    supported_outputs: ['audio'],
    modes: ['text-to-speech'],
  },
  'speech-2.6-turbo': {
    supported_inputs: ['text'],
    supported_outputs: ['audio'],
    modes: ['text-to-speech'],
  },
};

// =====================================================================
// jiekou（接口AI / api.highwayapi.ai）
// =====================================================================

const JIEKOU_TEXT: HkModelCapabilities = {
  supported_inputs: ['text'],
  supported_outputs: ['text'],
  modes: ['chat', 'completion'],
};

export const HK_JIEKOU_MODALITIES: Record<string, HkModelCapabilities> = {
  'deepseek-v3': JIEKOU_TEXT,
  'deepseek-r1': JIEKOU_TEXT,
  'gemini-2.5-flash': JIEKOU_TEXT,
  'gemini-2.0-flash': JIEKOU_TEXT,
  'qwen-2.5-72b': JIEKOU_TEXT,
  'qwen3-235b': JIEKOU_TEXT,
  'llama-3.3-70b': JIEKOU_TEXT,
  'claude-3-5-sonnet': JIEKOU_TEXT,
  'glm-4.5': JIEKOU_TEXT,
  // —— 图 ——
  'gpt-image-2-light': {
    supported_inputs: ['text', 'image'],
    supported_outputs: ['image'],
    modes: ['text-to-image', 'image-edit'],
  },
  'gemini-2.5-flash-image': {
    supported_inputs: ['text', 'image'],
    supported_outputs: ['image'],
    modes: ['text-to-image', 'image-edit'],
  },
  'seedream-4.0': {
    supported_inputs: ['text'],
    supported_outputs: ['image'],
    modes: ['text-to-image'],
  },
  'nano-banana-light': {
    supported_inputs: ['text', 'image'],
    supported_outputs: ['image'],
    modes: ['text-to-image', 'image-edit'],
  },
  // —— 视频 ——
  'kling-v3-pro-t2v': {
    supported_inputs: ['text', 'image'],
    supported_outputs: ['video'],
    modes: ['text-to-video', 'image-to-video'],
  },
  // —— 知识库 embedding ——
  'qwen3-embedding-8b': {
    supported_inputs: ['text'],
    supported_outputs: ['embed'],
    modes: ['embedding'],
    vector_dim: 1536, // 实际 jiekou 上 4096，但 pgvector 当前 1536 限制 → 标 1536 占位，Admin 可调
  },
};

/** 汇总：按 (provider, scope, model_key) 查找 */
export function lookupHkModalities(
  provider: 'atlascloud' | 'maxplan' | 'jiekou',
  modelKey: string,
): HkModelCapabilities | null {
  const table =
    provider === 'atlascloud'
      ? HK_ATLASCLOUD_MODALITIES
      : provider === 'maxplan'
        ? HK_MAXPLAN_MODALITIES
        : HK_JIEKOU_MODALITIES;
  return table[modelKey] ?? null;
}

/** 全量 HK 在线条目 — 给 sync 脚本用 */
export const HK_ALL_PROVIDER_MODALITIES: ReadonlyArray<{
  provider: 'atlascloud' | 'maxplan' | 'jiekou';
  model_key: string;
  capability: HkModelCapabilities;
}> = [
  ...Object.entries(HK_ATLASCLOUD_MODALITIES).map(([model_key, capability]) => ({
    provider: 'atlascloud' as const,
    model_key,
    capability,
  })),
  ...Object.entries(HK_MAXPLAN_MODALITIES).map(([model_key, capability]) => ({
    provider: 'maxplan' as const,
    model_key,
    capability,
  })),
  ...Object.entries(HK_JIEKOU_MODALITIES).map(([model_key, capability]) => ({
    provider: 'jiekou' as const,
    model_key,
    capability,
  })),
];

/** 仅类型导出，避免被误用 */
export type { SeedRow };
