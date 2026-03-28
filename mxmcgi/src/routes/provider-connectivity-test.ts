/**
 * Admin 物理模型连通性测试：按 provider × modality 分派策略，避免「一套 generate 打天下」。
 *
 * - deer + image：DeerAPI 专用（任务 id / 轮询 / Gemini 同步），见 deer-image-connectivity-test
 * - replicate + image：Replicate 异步预测，必须 enableProgress 并等待 outputPromise
 * - ppio：图/音参数与 OpenAI 兼容栈不同（如 size=1K、voice_id）
 * - openai/google/anthropic/qwen/volc/minimax：以 Chat 为主；无图生能力时明确提示
 * - 其它：兜底最小 generate + 通用校验
 */

import type { ModelProvider, GenerateParams, GenerateResult } from '../models/providers';
import type { ProviderType } from '../core/providers/types';
import type { ModelScope } from '../models/types';
import { listByProvider } from '../models/provider-model-catalog';
import { getModel } from '../models/registry';
import { runDeerImageConnectivityTest } from './deer-image-connectivity-test';

function isProviderType(s: string): s is ProviderType {
  return ['deer', 'replicate', 'ppio', 'openai', 'google', 'anthropic', 'qwen', 'volc', 'minimax'].includes(s);
}

/**
 * 代码注册表（registry）中的 scope → 连通性模态。
 * 用于纠正 provider_models 里 scope=default、modality=text 但实为图生/音/视频的条目。
 */
function inferModalityFromRegistry(provider: string, modelKey: string): 'image' | 'audio' | 'video' | null {
  if (!isProviderType(provider)) return null;
  const scopes: Array<{ scope: ModelScope; modality: 'image' | 'audio' | 'video' }> = [
    { scope: 'graph', modality: 'image' },
    { scope: 'audio', modality: 'audio' },
    { scope: 'video', modality: 'video' },
  ];
  for (const { scope, modality } of scopes) {
    if (getModel(provider, scope, modelKey)) return modality;
  }
  return null;
}

/**
 * 解析连通性测试用的模态：优先 provider_models（DB），再代码 registry，最后过渡静态表。
 */
export function resolveInferedModalityForConnectivityTest(
  provider: string,
  modelKey: string,
  scope: string,
  modalityFromRow: string | null
): 'text' | 'image' | 'audio' | 'video' {
  if (scope === 'graph') return 'image';
  if (scope === 'audio') return 'audio';
  if (scope === 'video') return 'video';

  if (isProviderType(provider)) {
    const rows = listByProvider(provider).filter((m) => m.model_key === modelKey);
    if (rows.some((r) => r.scope === 'graph' || r.modality === 'image')) return 'image';
    if (rows.some((r) => r.scope === 'audio' || r.modality === 'audio')) return 'audio';
    if (rows.some((r) => r.scope === 'video' || r.modality === 'video')) return 'video';
    if (
      rows.some((r) =>
        ['writing', 'text', 'default', 'outline'].includes((r.scope ?? '').toLowerCase()) ||
        (r.modality ?? '').toLowerCase() === 'text'
      )
    ) {
      return 'text';
    }
  }

  const fromRegistry = inferModalityFromRegistry(provider, modelKey);
  if (fromRegistry) return fromRegistry;

  if (modalityFromRow === 'image' || modalityFromRow === 'audio' || modalityFromRow === 'video') {
    return modalityFromRow;
  }
  if (modalityFromRow === 'text') return 'text';

  return scope === 'audio' ? 'audio' : scope === 'video' ? 'video' : 'text';
}

export type ConnectivityRequestPayload = {
  prompt: string;
  outputFormat: 'json';
  parameters: Record<string, unknown>;
  inferredModality: string;
  /** 便于前端展示当前采用的策略说明 */
  strategy?: string;
};

export type RunProviderConnectivityOutcome = {
  success: boolean;
  error?: string;
  responseMeta?: Record<string, unknown> | null;
  requestPayload: ConnectivityRequestPayload;
};

const PROMPT = {
  text: '连通性测试：请回复 OK',
  image: 'A single minimal geometric icon on plain background',
  audio: 'Hello, this is a connectivity test.',
  video: 'A simple scene with a static object and subtle camera movement',
};

/** 各 provider 最小 generate 参数（不含 deer 图生专用分支） */
export function buildMinConnectivityGenerateParams(
  provider: string,
  modelKey: string,
  modality: 'text' | 'image' | 'audio' | 'video'
): { params: GenerateParams; strategy: string } {
  switch (provider) {
    case 'deer':
      if (modality === 'text') {
        return {
          params: {
            prompt: PROMPT.text,
            outputFormat: 'json',
            parameters: { max_tokens: 16, temperature: 0 },
          },
          strategy: 'deer:chat/completions 最小 token',
        };
      }
      if (modality === 'audio') {
        return {
          params: {
            prompt: PROMPT.audio,
            outputFormat: 'json',
            parameters: {},
          },
          strategy: 'deer:音频（Suno 等由 Provider 内部分支处理）',
        };
      }
      if (modality === 'video') {
        return {
          params: {
            prompt: PROMPT.video,
            outputFormat: 'json',
            parameters: { seconds: '4', size: '1280x720' },
          },
          strategy: 'deer:视频 multipart 最小参数',
        };
      }
      break;

    case 'replicate':
      if (modality === 'image') {
        return {
          params: {
            prompt: PROMPT.image,
            outputFormat: 'json',
            parameters: {
              aspect_ratio: '1:1',
              num_outputs: 1,
            },
            enableProgress: true,
          },
          strategy: 'replicate:异步 prediction，enableProgress 等待 output',
        };
      }
      if (modality === 'video' || modality === 'audio') {
        return {
          params: {
            prompt: modality === 'video' ? PROMPT.video : PROMPT.audio,
            outputFormat: 'json',
            parameters: {},
            enableProgress: true,
          },
          strategy: `replicate:异步 prediction（${modality}），enableProgress 等待 output`,
        };
      }
      return {
        params: {
          prompt: PROMPT.text,
          outputFormat: 'json',
          parameters: { max_tokens: 64, temperature: 0 },
        },
        strategy: 'replicate:文本/兼容 run 或 stream',
      };

    case 'ppio':
      if (modality === 'image') {
        return {
          params: {
            prompt: PROMPT.image,
            outputFormat: 'json',
            parameters: { size: '1K' },
          },
          strategy: 'ppio:textToImage/editImage，size=1K',
        };
      }
      if (modality === 'audio') {
        return {
          params: {
            prompt: PROMPT.audio,
            outputFormat: 'json',
            parameters: {
              voice_setting: { voice_id: 'female-shaonv' },
              language_boost: 'en',
              output_format: 'url',
            },
          },
          strategy: 'ppio:语音合成默认音色',
        };
      }
      return {
        params: {
          prompt: PROMPT.text,
          outputFormat: 'json',
          parameters: { max_tokens: 64, temperature: 0 },
        },
        strategy: 'ppio:OpenAI 兼容 Chat',
      };

    case 'openai':
    case 'google':
    case 'anthropic':
    case 'qwen':
    case 'volc':
    case 'minimax':
      if (modality !== 'text') {
        return {
          params: {
            prompt: modality === 'image' ? PROMPT.image : modality === 'audio' ? PROMPT.audio : PROMPT.video,
            outputFormat: 'json',
            parameters: {},
          },
          strategy: `${provider}:当前实现以 Chat 为主；若失败请确认该 model_key 在 Provider 内是否支持此模态`,
        };
      }
      return {
        params: {
          prompt: PROMPT.text,
          outputFormat: 'json',
          parameters: { max_tokens: 32, temperature: 0 },
        },
        strategy: `${provider}:Chat Completions 最小请求`,
      };

    default:
      break;
  }

  const fallback: Record<string, Record<string, unknown>> = {
    text: { max_tokens: 16, temperature: 0 },
    image: { size: '1024x1024', n: 1 },
    audio: { seconds: 1, language_boost: 'en' },
    video: { seconds: 2, size: '720p' },
  };
  const pr = PROMPT[modality] || PROMPT.text;
  return {
    params: {
      prompt: pr,
      outputFormat: 'json',
      parameters: fallback[modality] || fallback.text,
    },
    strategy: `default:${provider}/${modality} 兜底参数`,
  };
}

function verifyResult(
  provider: string,
  modality: 'text' | 'image' | 'audio' | 'video',
  result: GenerateResult
): boolean {
  const meta = result.metadata as Record<string, unknown> | undefined;
  const hasMedia = Array.isArray(result.mediaUrls) && result.mediaUrls.length > 0;
  const hasStream = !!(result as { stream?: unknown; streamString?: unknown }).stream ||
    !!(result as { stream?: unknown; streamString?: unknown }).streamString;
  const hasMetadata = !!result.metadata;
  const hasTaskId =
    !!(meta?.taskId && String(meta.taskId).length > 0) ||
    !!(meta?.task_id && String(meta.task_id).length > 0);

  if (modality === 'text') {
    return hasMedia || hasMetadata || hasStream;
  }
  if (provider === 'replicate' && (modality === 'image' || modality === 'video' || modality === 'audio')) {
    return hasMedia || hasMetadata;
  }
  if (modality === 'image') {
    return hasMedia || hasMetadata || hasTaskId;
  }
  return hasMedia || hasMetadata || hasTaskId;
}

type PushStep = (key: string, title: string, status: 'pending' | 'running' | 'success' | 'failed', detail?: string) => void;

/**
 * 按 provider 执行连通性测试（deer 图生除外已在内部走专用实现）
 */
export async function runProviderConnectivityTest(options: {
  provider: string;
  modelKey: string;
  inferredModality: 'text' | 'image' | 'audio' | 'video';
  p: ModelProvider;
  pushStep: PushStep;
}): Promise<RunProviderConnectivityOutcome> {
  const { provider, modelKey, inferredModality, p, pushStep } = options;

  // —— Deer 图生：独立流程 ——
  if (provider === 'deer' && inferredModality === 'image') {
    const deerImg = await runDeerImageConnectivityTest(modelKey);
    for (const s of deerImg.steps) {
      pushStep(s.key, s.title, s.status, s.detail);
    }
    return {
      success: deerImg.success,
      error: deerImg.success ? undefined : deerImg.error ?? '图片连通性测试失败',
      responseMeta: deerImg.responseMeta ?? null,
      requestPayload: {
        prompt: '[deer:image] DeerAPI 专用图生连通性（Flux 轮询 / Seedream / Gemini）',
        outputFormat: 'json',
        parameters: {},
        inferredModality: 'image',
        strategy: 'deer-image: 见步骤 invoke / poll / verify',
      },
    };
  }

  const { params, strategy } = buildMinConnectivityGenerateParams(provider, modelKey, inferredModality);
  const requestPayload: ConnectivityRequestPayload = {
    prompt: params.prompt,
    outputFormat: 'json',
    parameters: (params.parameters || {}) as Record<string, unknown>,
    inferredModality,
    strategy,
  };

  pushStep('invoke', `调用上游（${provider}）`, 'running', strategy);

  try {
    const result = await p.generate(modelKey, params);
    const responseMeta = (result.metadata as Record<string, unknown> | undefined) ?? null;
    pushStep('invoke', `调用上游（${provider}）`, 'success');

    pushStep('verify', '验证返回结果', 'running');
    const ok = verifyResult(provider, inferredModality, result);
    if (ok) {
      const meta = result.metadata as Record<string, unknown> | undefined;
      const hasMedia = Array.isArray(result.mediaUrls) && result.mediaUrls.length > 0;
      pushStep(
        'verify',
        '验证返回结果',
        'success',
        hasMedia
          ? `mediaUrls=${result.mediaUrls?.length ?? 0}`
          : meta?.taskId || meta?.task_id
            ? `taskId=${String(meta?.taskId ?? meta?.task_id)}`
            : 'metadata/stream 就绪'
      );
      return { success: true, responseMeta, requestPayload };
    }
    pushStep('verify', '验证返回结果', 'failed', '返回结构为空或无法识别');
    return {
      success: false,
      error: '返回结构为空或无法识别',
      responseMeta,
      requestPayload,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    pushStep('invoke', `调用上游（${provider}）`, 'failed', msg);
    return {
      success: false,
      error: msg,
      requestPayload,
    };
  }
}
