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
import { listByProvider, getByProviderAndModelKey } from '../models/provider-model-catalog';
import { runDeerImageConnectivityTest } from './deer-image-connectivity-test';

export type ConnectivityModality = 'text' | 'image' | 'audio' | 'music' | 'video' | 'embedding';

function isProviderType(s: string): s is ProviderType {
  return [
    'deer',
    'replicate',
    'ppio',
    'openai',
    'openrouter',
    'qhai',
    'jiekou',
    'google',
    'anthropic',
    'qwen',
    'volc',
    'minimax',
    'atlascloud',
    'maxplan',
  ].includes(s);
}

/** protocol 字段值，误填到 model_key 时给出明确提示 */
const PROTOCOL_LIKE_MODEL_KEYS = new Set([
  'prediction_video',
  'generate_video',
  'deer_video_job',
  'openai_video',
  'replicate_video',
  'openrouter_video',
]);

export function isProtocolLikeModelKey(modelKey: string): boolean {
  return PROTOCOL_LIKE_MODEL_KEYS.has(String(modelKey || '').trim().toLowerCase());
}

/**
 * 解析连通性测试用的模态：纯动态，仅基于 provider_models（DB）。
 */
export function resolveInferedModalityForConnectivityTest(
  provider: string,
  modelKey: string,
  scope: string,
  modalityFromRow: string | null
): ConnectivityModality {
  const scopeLower = String(scope || '').toLowerCase();
  const modalityLower = String(modalityFromRow || '').toLowerCase();
  if (scopeLower === 'knowledge' || modalityLower === 'embedding') return 'embedding';
  if (scopeLower === 'graph') return 'image';
  if (scopeLower === 'music') return 'music';
  if (scopeLower === 'audio') return 'audio';
  if (scopeLower === 'video') return 'video';

  if (isProviderType(provider)) {
    const rows = listByProvider(provider).filter((m) => m.model_key === modelKey);
    if (rows.some((r) => r.scope === 'knowledge' || r.modality === 'embedding')) return 'embedding';
    if (rows.some((r) => r.scope === 'graph' || r.modality === 'image')) return 'image';
    if (rows.some((r) => r.scope === 'music' || r.modality === 'music')) return 'music';
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

  if (modalityLower === 'music') return 'music';
  if (modalityLower === 'image' || modalityLower === 'audio' || modalityLower === 'video') {
    return modalityLower;
  }
  if (modalityLower === 'text') return 'text';

  return scopeLower === 'music'
    ? 'music'
    : scopeLower === 'audio'
      ? 'audio'
      : scopeLower === 'video'
        ? 'video'
        : 'text';
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
  music: 'Upbeat pop, happy mood, connectivity test instrumental',
  video: 'A simple scene with a static object and subtle camera movement',
};

function isMaxplanMusicModel(modelKey: string, row?: ReturnType<typeof getByProviderAndModelKey>): boolean {
  const protocol = String(row?.protocol ?? '').toLowerCase();
  const scopeNorm = String(row?.scope ?? '').toLowerCase();
  return (
    protocol === 'music_generation' ||
    protocol === 'music' ||
    scopeNorm === 'music' ||
    /^music-/i.test(modelKey)
  );
}

/** 各 provider 最小 generate 参数（不含 deer 图生专用分支） */
export function buildMinConnectivityGenerateParams(
  provider: string,
  modelKey: string,
  modality: 'text' | 'image' | 'audio' | 'music' | 'video'
): { params: GenerateParams; strategy: string } {
  switch (provider) {
    case 'atlascloud':
      if (modality === 'video') {
        return {
          params: {
            prompt: PROMPT.video,
            outputFormat: 'json',
            parameters: {
              // Seedance 2.0 / Atlas T2V：使用 duration + resolution + ratio，勿传 width/height/fps
              duration: 5,
              resolution: '720p',
              ratio: 'adaptive',
              generate_audio: false,
              max_wait_ms: 12_000,
              poll_interval_ms: 2_000,
            },
          },
          strategy:
            'atlascloud:generateVideo + prediction 轮询（Seedance 参数 duration/resolution/ratio，max_wait_ms 12s）',
        };
      }
      if (modality === 'image') {
        return {
          params: {
            prompt: PROMPT.image,
            outputFormat: 'json',
            parameters: {
              aspect_ratio: '1:1',
              // gpt-image 等异步图生常 >10s；连通性测试给足轮询窗口，避免误判为不可用
              max_wait_ms: 180_000,
              poll_interval_ms: 3_000,
            },
          },
          strategy:
            'atlascloud:generateImage + prediction 轮询（max_wait_ms 180s；生产默认 45min，见 ATLASCLOUD_IMAGE_MAX_WAIT_MS）',
        };
      }
      // 其余按通用兜底（目前 atlascloud:chat 已在 provider 内兼容）
      break;

    case 'qhai':
      if (modality === 'image') {
        return {
          params: {
            prompt: PROMPT.image,
            outputFormat: 'json',
            parameters: { size: '1024x1024' },
          },
          strategy:
            'qhai:/v1/images/generations（gpt-image/nano-banana 用此接口；参考图走 extra_fields.reference_images，勿用 edits）',
        };
      }
      return {
        params: {
          prompt: PROMPT.text,
          outputFormat: 'json',
          parameters: { max_tokens: 16, temperature: 0 },
        },
        strategy: 'qhai:OpenAI 兼容 /v1/chat/completions',
      };

    case 'jiekou':
      if (modality === 'image') {
        return {
          params: {
            prompt: PROMPT.image,
            outputFormat: 'json',
            parameters: { size: '1K', aspect_ratio: '1:1', max_wait_ms: 180_000 },
          },
          strategy:
            'jiekou:v3/{upstream_model} 图生（upstream 填文档端点如 gpt-image-2-light-text-to-image；参考图走 reference_images）',
        };
      }
      if (modality === 'video') {
        return {
          params: {
            prompt: PROMPT.video,
            outputFormat: 'json',
            parameters: { duration: 5, aspect_ratio: '16:9', max_wait_ms: 120_000 },
          },
          strategy:
            'jiekou:v3/async/{upstream_model} 异步视频（upstream 如 async/kling-v3.0-pro-t2v，轮询 task-result）',
        };
      }
      return {
        params: {
          prompt: PROMPT.text,
          outputFormat: 'json',
          parameters: { max_tokens: 16, temperature: 0 },
        },
        strategy: 'jiekou:OpenAI 兼容 /openai/v1/chat/completions（国内直连 api.highwayapi.ai）',
      };

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

    case 'openrouter':
      if (modality === 'image') {
        return {
          params: {
            prompt: PROMPT.image,
            outputFormat: 'json',
            parameters: { aspect_ratio: '1:1' },
          },
          strategy:
            'openrouter:/api/v1/chat/completions modalities=[image,text]（如 openai/gpt-5-image；编辑=多模态参考图 input）',
        };
      }
      if (modality === 'video') {
        return {
          params: {
            prompt: PROMPT.video,
            outputFormat: 'json',
            parameters: { duration: 5 },
          },
          strategy: 'openrouter:/api/v1/videos + 轮询',
        };
      }
      return {
        params: {
          prompt: PROMPT.text,
          outputFormat: 'json',
          parameters: { max_tokens: 32, temperature: 0 },
        },
        strategy: 'openrouter:Chat Completions 最小请求',
      };

    case 'maxplan':
      if (modality === 'image') {
        return {
          params: {
            prompt: PROMPT.image,
            outputFormat: 'json',
            parameters: { aspect_ratio: '1:1', response_format: 'url', n: 1 },
          },
          strategy: 'maxplan:/v1/image_generation（scope=graph，upstream 如 image-01）',
        };
      }
      if (modality === 'music') {
        return {
          params: {
            prompt: PROMPT.music,
            outputFormat: 'json',
            parameters: {
              is_instrumental: true,
              output_format: 'url',
              audio_setting: { sample_rate: 44100, bitrate: 256000, format: 'mp3' },
            },
          },
          strategy:
            'maxplan:/v1/music_generation（scope=music；纯器乐最小请求，上游常需 1～3 分钟）',
        };
      }
      if (modality === 'audio') {
        const row = getByProviderAndModelKey('maxplan', modelKey);
        if (isMaxplanMusicModel(modelKey, row)) {
          return {
            params: {
              prompt: PROMPT.music,
              outputFormat: 'json',
              parameters: {
                is_instrumental: true,
                output_format: 'url',
                audio_setting: { sample_rate: 44100, bitrate: 256000, format: 'mp3' },
              },
            },
            strategy:
              'maxplan:/v1/music_generation（scope=music，upstream 如 music-2.6；上游常需 1～3 分钟）',
          };
        }
        return {
          params: {
            prompt: PROMPT.audio,
            outputFormat: 'json',
            parameters: {
              voice_setting: { voice_id: 'female-shaonv', speed: 1, vol: 1, pitch: 0 },
            },
          },
          strategy: 'maxplan:/v1/t2a_v2（scope=audio；protocol=text_to_speech 时走旧 TTS）',
        };
      }
      return {
        params: {
          prompt: PROMPT.text,
          outputFormat: 'json',
          parameters: { max_tokens: 32, temperature: 0 },
        },
        strategy: 'maxplan:/v1/text/chatcompletion_v2',
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
    music: { is_instrumental: true, output_format: 'url' },
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
  modality: 'text' | 'image' | 'audio' | 'music' | 'video',
  result: GenerateResult
): boolean {
  const meta = result.metadata as Record<string, unknown> | undefined;
  const hasMedia = Array.isArray(result.mediaUrls) && result.mediaUrls.length > 0;
  const hasStream = !!(result as { stream?: unknown; streamString?: unknown }).stream ||
    !!(result as { stream?: unknown; streamString?: unknown }).streamString;
  const hasMetadata = !!result.metadata;
  const hasTaskId =
    !!(meta?.taskId && String(meta.taskId).length > 0) ||
    !!(meta?.task_id && String(meta.task_id).length > 0) ||
    !!(meta?.predictionId && String(meta.predictionId).length > 0);

  if (modality === 'text') {
    return hasMedia || hasMetadata || hasStream;
  }
  if (provider === 'replicate' && (modality === 'image' || modality === 'video' || modality === 'audio' || modality === 'music')) {
    return hasMedia || hasMetadata;
  }
  if (modality === 'image') {
    return hasMedia || hasMetadata || hasTaskId;
  }
  return hasMedia || hasMetadata || hasTaskId;
}

type PushStep = (key: string, title: string, status: 'pending' | 'running' | 'success' | 'failed', detail?: string) => void;

async function runEmbeddingConnectivityTest(options: {
  provider: string;
  modelKey: string;
  pushStep: PushStep;
}): Promise<RunProviderConnectivityOutcome> {
  const { provider, modelKey, pushStep } = options;
  const testInput = '连通性测试向量';

  if (!isProviderType(provider)) {
    const err = `Provider ${provider} 不支持 embedding 连通性测试`;
    pushStep('invoke', `调用上游（${provider}）`, 'failed', err);
    return {
      success: false,
      error: err,
      requestPayload: {
        prompt: testInput,
        outputFormat: 'json',
        parameters: {},
        inferredModality: 'embedding',
        strategy: 'embedding: unsupported provider',
      },
    };
  }

  const row = getByProviderAndModelKey(provider, modelKey);
  if (!row) {
    const err = `provider_models 中未找到 ${provider}/${modelKey}`;
    pushStep('invoke', `调用上游（${provider}）`, 'failed', err);
    return {
      success: false,
      error: err,
      requestPayload: {
        prompt: testInput,
        outputFormat: 'json',
        parameters: {},
        inferredModality: 'embedding',
      },
    };
  }

  const { requireUpstreamPhysicalId } = await import('../models/physical-model-id');
  const { dimensionsFromProviderModel } = await import('../core/knowledge/knowledge-embedding-routing');
  const { embedOpenAiCompatible } = await import('../knowledge/embedding/openai-compatible-client');

  let upstreamModel: string;
  try {
    upstreamModel = requireUpstreamPhysicalId(provider, modelKey);
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    pushStep('invoke', `调用上游（${provider}）`, 'failed', err);
    return {
      success: false,
      error: err,
      requestPayload: {
        prompt: testInput,
        outputFormat: 'json',
        parameters: {},
        inferredModality: 'embedding',
      },
    };
  }

  const dimensions = dimensionsFromProviderModel(row);
  const strategy = `${provider}:POST /openai/v1/embeddings（upstream=${upstreamModel}, dimensions=${dimensions}）`;
  const requestPayload: ConnectivityRequestPayload = {
    prompt: testInput,
    outputFormat: 'json',
    parameters: { input: testInput, dimensions, upstreamModel },
    inferredModality: 'embedding',
    strategy,
  };

  pushStep('invoke', `调用上游（${provider}）`, 'running', strategy);

  try {
    const resp = await embedOpenAiCompatible(provider, {
      input: testInput,
      upstreamModel,
      dimensions,
    });
    const vec = resp.data?.[0]?.embedding;
    if (!Array.isArray(vec) || vec.length === 0) {
      pushStep('invoke', `调用上游（${provider}）`, 'failed', 'Embeddings 响应为空');
      return {
        success: false,
        error: 'Embeddings 响应为空',
        requestPayload,
      };
    }

    pushStep('invoke', `调用上游（${provider}）`, 'success', `向量维度 ${vec.length}`);
    pushStep('verify', '验证返回结果', 'success', `embedding[0].length=${vec.length}`);
    return {
      success: true,
      responseMeta: {
        dimensions: vec.length,
        expectedDimensions: dimensions,
        usage: resp.usage ?? null,
        model: resp.model ?? upstreamModel,
      },
      requestPayload,
    };
  } catch (e) {
    const msg = await enrichConnectivityError(provider, modelKey, e);
    pushStep('invoke', `调用上游（${provider}）`, 'failed', msg);
    return {
      success: false,
      error: msg,
      requestPayload,
    };
  }
}

/**
 * 按 provider 执行连通性测试（deer 图生除外已在内部走专用实现）
 */
export async function runProviderConnectivityTest(options: {
  provider: string;
  modelKey: string;
  inferredModality: ConnectivityModality;
  p: ModelProvider;
  pushStep: PushStep;
}): Promise<RunProviderConnectivityOutcome> {
  const { provider, modelKey, inferredModality, p, pushStep } = options;

  if (inferredModality === 'embedding') {
    return runEmbeddingConnectivityTest({ provider, modelKey, pushStep });
  }

  if (isProtocolLikeModelKey(modelKey)) {
    const hint =
      `model_key「${modelKey}」是 protocol 协议名，不能作为物理模型键。` +
      `请在 Admin 将 model_key 改为业务名（如 seedance-2），` +
      `upstream_model 填 bytedance/seedance-2.0/text-to-video，protocol 填 prediction_video。`;
    pushStep('prepare', '检查 model_key 命名', 'failed', hint);
    return {
      success: false,
      error: hint,
      requestPayload: {
        prompt: '',
        outputFormat: 'json',
        parameters: {},
        inferredModality,
        strategy: 'blocked: protocol-like model_key',
      },
    };
  }

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
    const msg = await enrichConnectivityError(provider, modelKey, e);
    pushStep('invoke', `调用上游（${provider}）`, 'failed', msg);
    return {
      success: false,
      error: msg,
      requestPayload,
    };
  }
}

/** 连通性失败时补充可操作诊断 */
export async function enrichConnectivityError(
  provider: string,
  modelKey: string,
  err: unknown,
): Promise<string> {
  const msg = err instanceof Error ? err.message : String(err);
  const lines: string[] = [msg];

  if (provider === 'openrouter') {
    if (/not available in your region|region/i.test(msg)) {
      lines.push(
        '诊断：OpenRouter 对 openai/gpt-5-image（及多数 OpenAI 图生）在你当前网络/账号地区不可用（403 region）。' +
          ' 这不是 SuperMXMai 配置问题。可选方案：① 换 OpenRouter 上非 OpenAI 的图生模型（如 google/gemini-2.5-flash-image）；' +
          ' ② 图生主通道继续用启航 qhai + gpt-image-2；③ 使用可访问 OpenAI 区域的 OpenRouter 账号/网络。'
      );
      try {
        const { getFirstProviderKey } = await import('../core/providers/provider-keys');
        const { fetchOpenRouterImageModelIds } = await import('../models/openrouter/list-models');
        const key = await getFirstProviderKey('openrouter');
        if (key) {
          const ids = await fetchOpenRouterImageModelIds(key);
          const alts = ids
            .filter((id) => !/^openai\//i.test(id) && /image|flux|gemini|banana|recraft/i.test(id))
            .slice(0, 10);
          if (alts.length) {
            lines.push(`当前 Key 在本地区可能可用的图生替代（upstream 示例）：${alts.join(', ')}`);
          }
        }
      } catch {
        // ignore list failure
      }
      lines.push('文档：https://openrouter.ai/docs/guides/overview/multimodal/image-generation');
    }
    return lines.join('\n');
  }

  if (provider === 'atlascloud' && /图像生成超时|status=processing/i.test(msg)) {
    lines.push(
      '诊断：AtlasCloud 已接受任务（有 predictionId）但连通性测试轮询窗口内未完成。' +
        ' gpt-image 等模型常需 30s～3min；Admin 连通性测试已默认 max_wait_ms=180s。' +
        ' 生产任务默认最长等待 45 分钟（环境变量 ATLASCLOUD_IMAGE_MAX_WAIT_MS 可覆盖）。'
    );
    return lines.join('\n');
  }

  if (provider !== 'qhai' && provider !== 'jiekou') return lines.join('\n');

  if (provider === 'jiekou') {
    if (/not an chat model|not a chat model/i.test(msg)) {
      lines.push(
        '诊断：该 model 为 Embedding 模型，应走 POST /openai/v1/embeddings，勿用 chat/completions。' +
          ' 请在 Admin 确认 scope=knowledge、modality=embedding、protocol=openai-embeddings。',
      );
    }
    if (/404|not found/i.test(msg)) {
      lines.push(
        '诊断：接口AI 图/视频需配置 v3 upstream_model（如 gpt-image-2-light-text-to-image），' +
          '文本走 /openai/v1/chat/completions。Base URL 默认 https://api.highwayapi.ai。' +
          ' 文档：https://docs.jiekou.ai/docs/support/faq_api',
      );
    }
    if (/401|403|unauthorized/i.test(msg)) {
      lines.push(
        '诊断：请确认 Admin Provider Keys 或 JIEKOU_API_KEY 已在 https://jiekou.ai/settings/key-management 创建。',
      );
    }
    try {
      const { getFirstProviderKey } = await import('../core/providers/provider-keys');
      const { fetchJiekouAccessibleModelIds } = await import('../models/jiekou/list-models');
      const key = await getFirstProviderKey('jiekou');
      if (!key && /401|403|key/i.test(msg)) {
        lines.push('诊断：未配置 jiekou API Key（Admin Provider Keys 或环境变量 JIEKOU_API_KEY）。');
      } else if (key) {
        const ids = await fetchJiekouAccessibleModelIds(key);
        if (ids.length > 0) {
          lines.push(`当前 Key 在 /openai/v1/models 可见 ${ids.length} 个模型（示例：${ids.slice(0, 8).join(', ')}）`);
        }
      }
    } catch {
      // ignore
    }
    lines.push('文档：https://docs.jiekou.ai/docs/support/quickstart');
    return lines.join('\n');
  }

  if (/model_price_not_configured|倍率或价格未配置/i.test(msg)) {
    lines.push(
      '诊断：启航对该模型在所用接口上未配置计费倍率（403 model_price_not_configured）。' +
        'gpt-image / nano-banana 请使用 /v1/images/generations（含 reference_images），勿用 /v1/images/edits；' +
        '若仍失败请在启航控制台为该模型开通定价。'
    );
  }
  if (/model_unavailable|模型暂时不可用/i.test(msg)) {
    try {
      const { getFirstProviderKey } = await import('../core/providers/provider-keys');
      const { getUpstreamModel } = await import('../models/provider-model-catalog');
      const { fetchQhaiAccessibleModelIds } = await import('../models/qhai/list-models');
      const key = await getFirstProviderKey('qhai');
      if (key) {
        const ids = await fetchQhaiAccessibleModelIds(key);
        const upstream = getUpstreamModel('qhai', modelKey) ?? modelKey;
        const hit =
          ids.includes(modelKey) ||
          ids.includes(upstream) ||
          ids.some((id) => id.toLowerCase() === modelKey.toLowerCase());
        lines.push(
          `诊断：当前 Admin/环境使用的 API Key 在 GET /v1/models 中${
            hit ? '已列出' : '未列出'
          } model_key=${modelKey}${upstream !== modelKey ? `、upstream=${upstream}` : ''}。` +
            (hit
              ? ' 模型在列表中但仍 503，多为渠道瞬时不可用或账号额度/分组限制，请在启航控制台核对。'
              : ' 模型广场展示 ≠ 当前 Key 可用；请换有该模型权限的 Key，或改用列表中的图生 ID。')
        );
        if (!hit && ids.length > 0) {
          const imageIds = ids
            .filter((id) => /gpt-image|nano-banana|qh-draw|dall-e|即梦/i.test(id))
            .slice(0, 12);
          if (imageIds.length) {
            lines.push(`当前 Key 可用图生示例：${imageIds.join(', ')}`);
          }
        }
      } else {
        lines.push('诊断：未配置 qhai API Key（Admin Provider Keys 或环境变量 QHAI_API_KEY）。');
      }
    } catch (diagErr) {
      lines.push(
        `诊断：无法拉取模型列表（${diagErr instanceof Error ? diagErr.message : String(diagErr)}）`
      );
    }
    lines.push(
      '图生文档：常规绘图需 model+prompt+size — https://www.qhaigc.net/docs/api-reference/images/generate ；' +
        '模型列表 API — https://www.qhaigc.net/docs/api-reference/other/models'
    );
  }
  if (/\/v1\/v1\//i.test(msg)) {
    lines.push(
      '诊断：请求 URL 出现 /v1/v1/ 重复，请确认 QHAI_BASE_URL 为 https://api.qhaigc.net 或 https://api.qhaigc.net/v1（已自动规范化，需重启 mxmcgi）。'
    );
  }
  return lines.join('\n');
}
