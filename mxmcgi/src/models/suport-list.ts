/**
 * 模型支持列表和映射配置
 *
 * 统一管理所有 provider 的模型列表和映射关系，与 models 同目录便于扫描和调试。
 * 结构：{ provider: { graph: {...}, text: {...}, audio: {...}, video: {...} } }
 */

export enum ChargeMode {
  token_based = 'token_based',
  token_based_per_thousand = 'token_based_per_thousand',
  per_change_mode = 'per_change_mode',
}

/**
 * 模型配置接口
 */
export interface ModelConfig {
  modelname: string;
  price: number;
  provider_price?: number;
  charge_mode: ChargeMode;
  currency: string;
  service?: string;
}

/**
 * 模型映射类型：可以是字符串（向后兼容）或 ModelConfig 对象
 */
export type ModelMapping = string | ModelConfig;

/**
 * 从模型映射中提取模型名称
 */
export function getModelName(mapping: ModelMapping): string {
  if (typeof mapping === 'string') return mapping;
  return mapping.modelname;
}

export default {
  replicate: {
    graph: {
      'seedream-4': {
        modelname: 'bytedance/seedream-4',
        price: 0.03,
        charge_mode: ChargeMode.per_change_mode,
        currency: 'USD',
      },
      'nano-banana': {
        modelname: 'google/nano-banana',
        price: 0.1,
        charge_mode: ChargeMode.per_change_mode,
        currency: 'USD',
      },
      'nano-banana-pro': {
        modelname: 'google/nano-banana-pro',
        price: 0.3,
        charge_mode: ChargeMode.per_change_mode,
        currency: 'USD',
      },
      'flux-fast': {
        modelname: 'black-forest-labs/flux-1.1-pro',
        price: 0.04,
        charge_mode: ChargeMode.per_change_mode,
        currency: 'USD',
      },
      'flux-2-flex': {
        modelname: 'black-forest-labs/flux-2',
        price: 0.05,
        charge_mode: ChargeMode.per_change_mode,
        currency: 'USD',
      },
      'ideogram-v2a': {
        modelname: 'ideogram-ai/ideogram-v2',
        price: 0.08,
        charge_mode: ChargeMode.per_change_mode,
        currency: 'USD',
      },
      'recraft-crisp-upscale': {
        modelname: 'recraft-ai/recraft-v3',
        price: 0.05,
        charge_mode: ChargeMode.per_change_mode,
        currency: 'USD',
      },
    },
    text: {
      'deepseek-r1': {
        modelname: 'deepseek-ai/deepseek-r1',
        price: 0.00001,
        charge_mode: ChargeMode.token_based,
        currency: 'USD',
      },
      'gemini-3-pro': {
        modelname: 'google/gemini-3-pro',
        price: 0.00125,
        charge_mode: ChargeMode.token_based,
        currency: 'USD',
      },
      'gemini-2-5-flash': {
        modelname: 'google/gemini-2.5-flash',
        price: 0.075,
        charge_mode: ChargeMode.token_based,
        currency: 'USD',
      },
      'claude-4.5-sonnet': {
        modelname: 'anthropic/claude-3.5-sonnet',
        price: 0.003,
        charge_mode: ChargeMode.token_based,
        currency: 'USD',
      },
      'gpt-5-nano': {
        modelname: 'openai/gpt-5-nano',
        price: 0.00015,
        charge_mode: ChargeMode.token_based,
        currency: 'USD',
      },
    },
    audio: {},
  },
  ppio: {
    graph: {
      'nano-banana': {
        modelname: 'nano-banana',
        price: 0.1,
        provider_price: 0.08,
        charge_mode: ChargeMode.per_change_mode,
        currency: 'USD',
      },
      'nano-banana-pro': {
        modelname: 'nano-banana-pro',
        price: 0.25,
        provider_price: 0.15,
        charge_mode: ChargeMode.per_change_mode,
        currency: 'USD',
      },
    },
    text: {},
    audio: {
      'minimax-voice-cloning': {
        modelname: 'minimax-voice-cloning',
        price: 0.8,
        charge_mode: ChargeMode.per_change_mode,
        currency: 'USD',
      },
      'minimax-speech-02-turbo': {
        modelname: 'minimax-speech-02-turbo',
        price: 0.00005,
        charge_mode: ChargeMode.token_based,
        currency: 'USD',
      },
      'minimax-speech-2.6-hd': {
        modelname: 'minimax-speech-2.6-hd',
        price: 0.0001,
        charge_mode: ChargeMode.token_based,
        currency: 'USD',
      },
      'minimax-speech-2.5-turbo': {
        modelname: 'minimax-speech-2.5-turbo-preview',
        price: 0.00005,
        charge_mode: ChargeMode.token_based,
        currency: 'USD',
      },
      'minimax-speech-2.5-hd': {
        modelname: 'minimax-speech-2.5-hd-preview',
        price: 0.0001,
        charge_mode: ChargeMode.token_based,
        currency: 'USD',
      },
      'minimax-speech-02-hd-async': {
        modelname: 'minimax-speech-02-hd',
        price: 0.0001,
        charge_mode: ChargeMode.token_based,
        currency: 'USD',
      },
      'minimax-speech-2.6-hd-async': {
        modelname: 'minimax-speech-2.6-hd',
        price: 0.0001,
        charge_mode: ChargeMode.token_based,
        currency: 'USD',
      },
      'minimax-speech-2.5-turbo-async': {
        modelname: 'minimax-speech-2.5-turbo-preview',
        price: 0.00005,
        charge_mode: ChargeMode.token_based,
        currency: 'USD',
      },
    },
  },
  deer: {
    graph: {
      // DeerAPI nano-banana 普通版，Gemini 2.5 Flash 图像接口，速度最快、成本最低
      'nano-banana': {
        modelname: 'gemini-2.5-flash-image',
        price: 0.05,
        charge_mode: ChargeMode.per_change_mode,
        currency: 'USD',
        service: 'google',
      },
      // DeerAPI nano-banana-pro 走 Gemini 3 Pro 图像接口，最高画质
      'nano-banana-pro': {
        modelname: 'gemini-3-pro-image',
        price: 0.25,
        charge_mode: ChargeMode.per_change_mode,
        currency: 'USD',
        service: 'google',
      },
      // DeerAPI nano-banana-2：基于 Gemini 3.1 Flash Image（preview 版本），在 2.5 代基础上画质和文字渲染都有明显提升
      'nano-banana-2': {
        modelname: 'gemini-3.1-flash-image-preview',
        price: 0.06,
        charge_mode: ChargeMode.per_change_mode,
        currency: 'USD',
        service: 'google',
      },
      // DeerAPI nano-banana-2-pro：基于 Gemini 3.1 Flash Image 正式版，主打最高画质与稳定性
      'nano-banana-2-pro': {
        modelname: 'gemini-3.1-flash-image',
        price: 0.12,
        charge_mode: ChargeMode.per_change_mode,
        currency: 'USD',
        service: 'google',
      },
      'flux-2-pro': {
        modelname: 'flux-2-pro',
        price: 0.05,
        charge_mode: ChargeMode.per_change_mode,
        currency: 'USD',
      },
      'seedream-4': {
        modelname: 'doubao-seedream-4-5-251128',
        price: 0.02,
        charge_mode: ChargeMode.per_change_mode,
        currency: 'USD',
      },
      'seedream-5': {
        modelname: 'doubao-seedream-5-0-260128',
        price: 0.035,
        charge_mode: ChargeMode.per_change_mode,
        currency: 'USD',
      },
    },
    text: {
      'deepseek-r1': {
        modelname: 'deepseek-ai/deepseek-r1',
        price: 0.00055,
        charge_mode: ChargeMode.token_based,
        currency: 'USD',
      },
      'deepseek-v3.2': {
        modelname: 'deepseek-v3.2',
        price: 0.00027, // $0.27 per million tokens (input), $0.432 per million tokens (output). This is input price per 1k tokens.
        charge_mode: ChargeMode.token_based,
        currency: 'USD',
      },
      'gemini-3-pro': {
        modelname: 'gemini-3-pro-preview',
        price: 0.00125,
        charge_mode: ChargeMode.token_based,
        currency: 'USD',
      },
      'gemini-2-5-flash': {
        modelname: 'gemini-2.5-flash',
        price: 0.075,
        charge_mode: ChargeMode.token_based,
        currency: 'USD',
      },
      'gpt-5-2': {
        modelname: 'gpt-5.2',
        price: 0.014,
        charge_mode: ChargeMode.token_based,
        currency: 'USD',
      },
      'qwen3-235b': {
        modelname: 'qwen3-235b-a22b',
        price: 0.0008,
        charge_mode: ChargeMode.token_based,
        currency: 'USD',
      },
      'qwen3-30b': {
        modelname: 'qwen3-30b-a3b',
        price: 0.0003,
        charge_mode: ChargeMode.token_based,
        currency: 'USD',
      },
      'claude-4.5-sonnet': {
        modelname: 'claude-sonnet-4-5-20250929',
        price: 0.003,
        charge_mode: ChargeMode.token_based,
        currency: 'USD',
      },
    },
    audio: {
      'suno-music': {
        modelname: 'suno-music',
        price: 0.1,
        charge_mode: ChargeMode.per_change_mode,
        currency: 'USD',
      },
    },
    video: {
      'sora-2': {
        modelname: 'sora-2',
        price: 0.05,
        charge_mode: ChargeMode.per_change_mode,
        currency: 'USD',
      },
      'sora-2-pro': {
        modelname: 'sora-2-pro',
        price: 0.1,
        charge_mode: ChargeMode.per_change_mode,
        currency: 'USD',
      },
      'sora-2-all': {
        modelname: 'sora-2-all',
        price: 0.1,
        charge_mode: ChargeMode.per_change_mode,
        currency: 'USD',
      },
      'sora-2-pro-all': {
        modelname: 'sora-2-pro-all',
        price: 1,
        charge_mode: ChargeMode.per_change_mode,
        currency: 'USD',
      },
      'sora-2-deer': {
        modelname: 'sora-2-all',
        price: 0.1,
        charge_mode: ChargeMode.per_change_mode,
        currency: 'USD',
      },
      'sora-2-deer-pro': {
        modelname: 'sora-2-pro-all',
        price: 1,
        charge_mode: ChargeMode.per_change_mode,
        currency: 'USD',
      },
      'runway': {
        modelname: 'runway',
        price: 0.05,
        charge_mode: ChargeMode.per_change_mode,
        currency: 'USD',
      },
    },
  },
  openai: {
    text: {
      'gpt-5-nano': {
        modelname: 'gpt-5-nano',
        // $0.05 / 1M input tokens → $0.00005 / 1K（仅作参考，真实价格以 OpenAI 最新定价为准）
        price: 0.00005,
        charge_mode: ChargeMode.token_based,
        currency: 'USD',
      },
      'gpt-5-2': {
        modelname: 'gpt-5.2',
        // $1.75 / 1M input tokens → $0.00175 / 1K（仅作参考）
        price: 0.00175,
        charge_mode: ChargeMode.token_based,
        currency: 'USD',
      },
    },
    graph: {},
    audio: {},
    video: {},
  },
  google: {
    text: {
      'gemini-2.5-flash': {
        modelname: 'gemini-2.0-flash',
        price: 0.075,
        charge_mode: ChargeMode.token_based,
        currency: 'USD',
      },
      'gemini-2-5-flash': {
        modelname: 'gemini-2.0-flash',
        price: 0.075,
        charge_mode: ChargeMode.token_based,
        currency: 'USD',
      },
      'gemini-2.5-pro': {
        modelname: 'gemini-2.5-pro-preview-05-06',
        price: 0.00125,
        charge_mode: ChargeMode.token_based,
        currency: 'USD',
      },
      'gemini-3-pro': {
        modelname: 'gemini-2.5-pro-preview-05-06',
        price: 0.00125,
        charge_mode: ChargeMode.token_based,
        currency: 'USD',
      },
    },
    graph: {},
    audio: {},
    video: {},
  },
  anthropic: {
    text: {
      'claude-4.5-sonnet': {
        modelname: 'claude-sonnet-4-5-20250929',
        price: 0.003,
        charge_mode: ChargeMode.token_based,
        currency: 'USD',
      },
      'claude-3-5-sonnet': {
        modelname: 'claude-3-5-sonnet-20241022',
        price: 0.003,
        charge_mode: ChargeMode.token_based,
        currency: 'USD',
      },
    },
    graph: {},
    audio: {},
    video: {},
  },
  qwen: {
    text: {},
    graph: {},
    audio: {},
    video: {},
  },
  volc: {
    text: {},
    graph: {
      'seedream-4-volc': {
        modelname: 'seedream-4',
        price: 0.02,
        charge_mode: ChargeMode.per_change_mode,
        currency: 'USD',
      },
    },
    audio: {},
    video: {},
  },
  minimax: {
    text: {},
    graph: {},
    audio: {
      'minimax-speech-2.8-hd': {
        modelname: 'speech-2.8-hd',
        price: 0.0001,
        charge_mode: ChargeMode.token_based,
        currency: 'USD',
      },
    },
    video: {},
  },
};
