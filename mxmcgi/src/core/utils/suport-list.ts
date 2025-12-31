/**
 * 模型支持列表和映射配置
 * 
 * 统一管理所有 provider 的模型列表和映射关系
 * 结构：{ provider: { graph: {...}, text: {...}, audio: {...} } }
 */

export enum ChargeMode {
    token_based='token_based',
    token_based_per_thousand = 'token_based_per_thousand',
    per_change_mode = 'per_change_mode',
}

/**
 * 模型配置接口
 */
export interface ModelConfig {
  modelname: string; // 模型名称（用于 API 调用）
  price: number; // 官方价格
  provider_price?: number; // 提供商价格（可选，由用户填写）
  charge_mode: ChargeMode; // 计费模式
  currency: string; // 货币单位，默认 'USD'
}

/**
 * 模型映射类型：可以是字符串（向后兼容）或 ModelConfig 对象
 */
export type ModelMapping = string | ModelConfig;

/**
 * 辅助函数：从模型映射中提取模型名称
 * 支持字符串格式（向后兼容）和对象格式
 */
export function getModelName(mapping: ModelMapping): string {
  if (typeof mapping === 'string') {
    return mapping;
  }
  return mapping.modelname;
}

export default { 
    openai: {

        },
    google:{

    },
    anthropic:{

    },
    replicate: {
        graph: {
            'seedream-4': {
                modelname: 'bytedance/seedream-4',
                price: 0.03, 
                changemode: ChargeMode.per_change_mode,
                charge_mode: ChargeMode.per_change_mode,
                currency: 'USD',
            },
            'nano-banana': {
                modelname: 'google/nano-banana-pro',
                price: 0.3, // Replicate 按秒计费，约 $0.0001/秒
                changemode: ChargeMode.per_change_mode,
                charge_mode: ChargeMode.per_change_mode,
                currency: 'USD',
            },
            // 'flux-kontext-fast': 'black-forest-labs/flux-kontext-pro', // 已禁用：该模型是图片编辑模型，需要 input_image 参数，仅传 prompt 时生成内容与提示词无关
            // 'recraft-crisp-upscale': {
            //     modelname: 'recraft-ai/recraft-crisp-upscale',
            //     price: 0.02, // 估算价格，按图片计费
            //     changemode: ChargeMode.per_change_mode,
            //     charge_mode: ChargeMode.per_change_mode,
            //     currency: 'USD',
            // },
        },
        text: {
            'deepseek-r1': {
                modelname: 'deepseek-ai/deepseek-r1',
                price: 0.00001, // 估算价格，按 token 计费
                changemode: ChargeMode.token_based,
                charge_mode: ChargeMode.token_based,
                currency: 'USD',
            },
            'gemini-3-pro': {
                modelname: 'google/gemini-3-pro',
                price: 0.00125, // Google Gemini 3 Pro 官方价格
                changemode: ChargeMode.token_based,
                charge_mode: ChargeMode.token_based,
                currency: 'USD',
            },
            'gemini-2-5-flash': {
                modelname: 'google/gemini-2.5-flash',
                price: 0.075, // Google Gemini 2.5 Flash 官方价格
                changemode: ChargeMode.token_based,
                charge_mode: ChargeMode.token_based,
                currency: 'USD',
            },
            'claude-4.5-sonnet': {
                modelname: 'anthropic/claude-3.5-sonnet',
                price: 0.003, // Anthropic Claude 3.5 Sonnet 官方价格
                changemode: ChargeMode.token_based,
                charge_mode: ChargeMode.token_based,
                currency: 'USD',
            },
            'gpt-5-nano': {
                modelname: 'openai/gpt-5-nano',
                price: 0.00015, // OpenAI GPT-5 Nano 官方价格
                changemode: ChargeMode.token_based,
                charge_mode: ChargeMode.token_based,
                currency: 'USD',
            },
        },
        // 预留音频模型映射（目前未通过 Replicate 调用音频）
        audio: {
        },
    },
    ppio: {
        graph: {
            'nano-banana': {
                modelname: 'nano-banana',
                price: 0.25, // Gemini 3 Pro Image Preview，平均价格（1K-2K: $0.134, 4K: $0.24）
                provider_price: 0.15,
             
                charge_mode: ChargeMode.per_change_mode,
                currency: 'USD',
            }, // Gemini 3 Pro Image Preview
        },
        text: {},
        /**
         * 音频模型映射（PPIO / MiniMax）
         *
         * key：对外暴露的统一模型名
         * value：底层 PPIO / MiniMax 的具体模型 ID 或接口标识
         *
         * 参考文档：
         * - MiniMax 音频快速复刻（voice cloning）：
         *   https://ppio.com/docs/models/reference-minimax-voice-cloning
         *   接口：POST /v3/minimax-voice-cloning
         * - MiniMax Speech-2.5-hd-preview 异步语音合成：
         *   https://ppio.com/docs/models/reference-minimax-speech-2.5-hd-async
         *   接口：POST /v3/async/minimax-speech-2.5-hd-preview
         * - MiniMax Speech-2.5-turbo-preview 异步语音合成：
         *   https://ppio.com/docs/models/reference-minimax-speech-2.5-turbo-async
         *   接口：POST /v3/async/minimax-speech-2.5-turbo-preview
         */
        audio: {
            // 音色快速复刻（返回 voice_id，可配合后续 TTS 接口使用）
            'minimax-voice-cloning': {
                modelname: 'minimax-voice-cloning',
                price: 0.8, // MiniMax 音色复刻，按次计费（估算）
              
                charge_mode: ChargeMode.per_change_mode,
                currency: 'USD',
            },
            // 文本转语音（Speech-02-turbo，同步接口）
            'minimax-speech-02-turbo': {
                modelname: 'minimax-speech-02-turbo',
                price: 0.00005, // MiniMax Speech-02 Turbo，约 $0.05 per 1000 characters = $0.00005/character
           
                charge_mode: ChargeMode.token_based,
                currency: 'USD',
            },
            // 文本转语音（Speech-2.6-hd，同步接口）
            'minimax-speech-2.6-hd': {
                modelname: 'minimax-speech-2.6-hd',
                price: 0.0001, // MiniMax Speech-2.6 HD，约 $0.1 per 1000 characters = $0.0001/character
                charge_mode: ChargeMode.token_based,
                currency: 'USD',
            },
            // 文本转语音（Speech-2.5-turbo，同步接口）
            'minimax-speech-2.5-turbo': {
                modelname: 'minimax-speech-2.5-turbo-preview',
                price: 0.00005, // MiniMax Speech-2.5 Turbo，约 $0.05 per 1000 characters = $0.00005/character
                charge_mode: ChargeMode.token_based,
                currency: 'USD',
            },
            // 文本转语音（Speech-2.5-hd，同步接口）
            'minimax-speech-2.5-hd': {
                modelname: 'minimax-speech-2.5-hd-preview',
                price: 0.0001, // MiniMax Speech-2.5 HD，约 $0.1 per 1000 characters = $0.0001/character
                charge_mode: ChargeMode.token_based,
                currency: 'USD',
            },
            // 文本转语音（Speech-02-hd，异步接口）
            'minimax-speech-02-hd-async': {
                modelname: 'minimax-speech-02-hd',
                price: 0.0001, // MiniMax Speech-02 HD，约 $0.08-0.105 per 1000 characters，取 $0.1/1000 = $0.0001/character
                charge_mode: ChargeMode.token_based,
                currency: 'USD',
            },
            // 文本转语音（Speech-2.6-hd，异步接口）
            'minimax-speech-2.6-hd-async': {
                modelname: 'minimax-speech-2.6-hd',
                price: 0.0001, // MiniMax Speech-2.6 HD，约 $0.08-0.105 per 1000 characters，取 $0.1/1000 = $0.0001/character
                charge_mode: ChargeMode.token_based,
                currency: 'USD',
            },
            // // 文本转语音（高清版，异步接口）
            // 'minimax-speech-2.5-hd-async': {
            //     modelname: 'minimax-speech-2.5-hd-preview',
            //     price: 0.0001, // MiniMax Speech-2.5 HD，约 $0.08-0.105 per 1000 characters，取 $0.1/1000 = $0.0001/character
            //
            //     currency: 'USD',
            // },
            // // 文本转语音（turbo 版本，异步接口）
            'minimax-speech-2.5-turbo-async': {
                modelname: 'minimax-speech-2.5-turbo-preview',
                price: 0.00005, // MiniMax Speech-2.5 Turbo，约 $0.05 per 1000 characters = $0.00005/character
                charge_mode: ChargeMode.token_based,
                currency: 'USD',
            },
        },
    },
    deer: {
        graph: {
            'nano-banana': {
                modelname: 'nano-banana',
                price: 0.25, // 参考 PPIO 价格
                
                charge_mode: ChargeMode.per_change_mode,
                currency: 'USD',
            },
            'flux-2-pro': {
                modelname: 'flux-2-pro',
                price: 0.05, // 估算价格
                charge_mode: ChargeMode.per_change_mode,
                currency: 'USD',
            },
            'seedream-4': {
                modelname: 'doubao-seedream-4-5-251128',
                price: 0.02, // 估算价格
                charge_mode: ChargeMode.per_change_mode,
                currency: 'USD',
            },
        },
        text: {
            'deepseek-r1': {
                modelname: 'deepseek-ai/deepseek-r1',
                price: 0.00055, // 参考 Replicate 价格
                charge_mode: ChargeMode.token_based,
                currency: 'USD',
            },
            'gemini-3-pro': {
                modelname: 'gemini-3-pro-preview',
                price: 0.00125, // Google Gemini 3 Pro 官方价格
                charge_mode: ChargeMode.token_based,
                currency: 'USD',
            },
            'gemini-2-5-flash': {
                modelname: 'gemini-2.5-flash',
                price: 0.075, // Google Gemini 2.5 Flash 官方价格
                charge_mode: ChargeMode.token_based,
                currency: 'USD',
            },
            'gpt-5-2': {
                modelname: 'gpt-5.2',
                price: 0.002, // 估算价格
                charge_mode: ChargeMode.token_based,
                currency: 'USD',
            },
            'qwen3-235b': {
                modelname: 'qwen3-235b-a22b',
                price: 0.0008, // 估算价格
                charge_mode: ChargeMode.token_based,
                currency: 'USD',
            },
            'qwen3-30b': {
                modelname: 'qwen3-30b-a3b',
                price: 0.0003, // 估算价格
                charge_mode: ChargeMode.token_based,
                currency: 'USD',
            },
            // Claude 4.5 Sonnet：DeerAPI 走 Anthropic Messages，模型 ID 按官方文档
            'claude-4.5-sonnet': {
                modelname: 'claude-sonnet-4-5-20250929',
                price: 0.003, // Anthropic Claude 3.5 Sonnet 官方价格
                charge_mode: ChargeMode.token_based,
                currency: 'USD',
            },
        },
        // 预留 DeerAPI 音频模型映射
        audio: {
        },
        // DeerAPI 视频模型映射
        video: {
            // 官方 Sora 接口（按秒计费）
            'sora-2': {
                modelname: 'sora-2',
                price: 0.05, // 估算价格，按视频计费
                charge_mode: ChargeMode.per_change_mode,
                currency: 'USD',
            },
            'sora-2-pro': {
                modelname: 'sora-2-pro',
                price: 0.1, // 估算价格，按视频计费
                charge_mode: ChargeMode.per_change_mode,
                currency: 'USD',
            },
            // 逆向异步 Sora 接口（固定时长计费）
            // 文档参考：
            // - https://apidoc.deerapi.com/sora/self-developed/create
            // - https://apidoc.deerapi.com/sora%E9%80%86%E5%90%91%E6%9F%A5%E5%9B%9E-371242934e0
            'sora-2-all': {
                modelname: 'sora-2-all',
                // deer 文档：sora-2-all 固定按次 $0.1 计费
                price: 0.1,
                charge_mode: ChargeMode.per_change_mode,
                currency: 'USD',
            },
            'sora-2-pro-all': {
                modelname: 'sora-2-pro-all',
                // deer 文档：sora-2-pro-all 固定按次 $1 计费
                price: 1,
                charge_mode: ChargeMode.per_change_mode,
                currency: 'USD',
            },
            // Runway 统一视频生成接口（通过 DeerAPI 调用 Runway API）
            // 根据参数自动选择：图片转视频/文本转视频/视频转视频
            // 参考文档: https://docs.dev.runwayml.com/api/
            'runway': {
                modelname: 'runway',
                price: 0.05, // 估算价格，按视频计费
                charge_mode: ChargeMode.per_change_mode,
                currency: 'USD',
            },
        },
    },
};
