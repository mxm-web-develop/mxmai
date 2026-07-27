/**
 * Admin 连通性测试：Deer 图片类模型专用
 * 与文本不同：需拿到上游可追踪的任务 id（Flux/部分异步）或同步返回的图片 URL（Seedream/Gemini）
 */

import { DeerAPIClient } from '../models/deerapi/client';
import { getDeerProviderKeys } from '../models/providers';
import { getUpstreamModel } from '../models/provider-model-catalog';

function isDeerRateLimitError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  const lower = msg.toLowerCase();
  return (
    lower.includes('429') ||
    lower.includes('too many requests') ||
    msg.includes('1302') ||
    msg.includes('速率限制') ||
    msg.includes('rix_api_error')
  );
}

/** 与 DeerProvider 上游解析对齐：provider_models.upstream_model ?? model_key */
function resolveDeerPhysicalModelName(modelKey: string): string {
  return getUpstreamModel('deer', modelKey) ?? modelKey;
}

type DeerImageKind = 'flux' | 'seedream' | 'gemini' | 'openai';

function classifyDeerImageModel(modelKey: string): DeerImageKind {
  if (modelKey.startsWith('flux-')) return 'flux';
  if (modelKey === 'seedream-4' || modelKey === 'seedream-5') return 'seedream';
  if (modelKey.startsWith('gpt-image')) return 'openai';
  return 'gemini';
}

/** 从 Gemini generateContent 响应中提取图片 URL / data URI（与 DeerProvider 逻辑对齐的精简版） */
function extractImageUrlsFromGeminiResponse(response: any): string[] {
  const imageUrls: string[] = [];
  if (response?.candidates?.[0]) {
    const candidate = response.candidates[0];
    const parts = candidate.content?.parts || [];
    for (const part of parts) {
      const inlineData = part?.inline_data || part?.inlineData;
      if (inlineData?.data && typeof inlineData.data === 'string') {
        const mime = inlineData.mime_type || inlineData.mimeType || 'image/png';
        imageUrls.push(`data:${mime};base64,${inlineData.data}`);
      }
    }
  }
  if (imageUrls.length === 0 && Array.isArray(response?.data)) {
    for (const item of response.data) {
      if (item?.url) imageUrls.push(item.url);
      else if (item?.b64_json) imageUrls.push(`data:image/png;base64,${item.b64_json}`);
    }
  }
  return imageUrls;
}

/** Seedream 返回结构兼容提取：支持 data/images/output/result 及多种 url/base64 字段 */
function extractImageUrlsFromOpenAIResponse(response: any): string[] {
  const imageUrls: string[] = [];
  const pushMaybe = (item: any) => {
    if (!item) return;
    if (typeof item === 'string' && (item.startsWith('http://') || item.startsWith('https://'))) {
      imageUrls.push(item);
      return;
    }
    const obj = item as Record<string, any>;
    if (typeof obj.url === 'string') imageUrls.push(obj.url);
    else if (obj.b64_json) {
      const b64 = typeof obj.b64_json === 'string' ? obj.b64_json : JSON.stringify(obj.b64_json);
      imageUrls.push(`data:image/png;base64,${b64}`);
    }
    else if (obj.base64) {
      const b64 = typeof obj.base64 === 'string' ? obj.base64 : JSON.stringify(obj.base64);
      imageUrls.push(`data:image/png;base64,${b64}`);
    }
  };
  const candidates = [
    response?.data,
    response?.images,
    response?.output,
    response?.result,
  ];
  for (const c of candidates) {
    if (Array.isArray(c)) c.forEach(pushMaybe);
    else if (c) pushMaybe(c);
  }
  return imageUrls;
}

/** Seedream 返回结构兼容提取：支持 data/images/output/result 及多种 url/base64 字段 */
function extractImageUrlsFromSeedreamResponse(response: any): string[] {
  const imageUrls: string[] = [];
  const pushMaybe = (item: any) => {
    if (!item) return;
    if (typeof item === 'string' && (item.startsWith('http://') || item.startsWith('https://'))) {
      imageUrls.push(item);
      return;
    }
    const obj = item as Record<string, any>;
    if (typeof obj.url === 'string') imageUrls.push(obj.url);
    else if (typeof obj.image_url === 'string') imageUrls.push(obj.image_url);
    else if (typeof obj.output_url === 'string') imageUrls.push(obj.output_url);
    else if (typeof obj?.image?.url === 'string') imageUrls.push(obj.image.url);
    else if (typeof obj?.result?.url === 'string') imageUrls.push(obj.result.url);
    else if (typeof obj.b64_json === 'string') imageUrls.push(`data:image/png;base64,${obj.b64_json}`);
    else if (typeof obj.base64 === 'string') imageUrls.push(`data:image/png;base64,${obj.base64}`);
    else if (typeof obj.b64 === 'string') imageUrls.push(`data:image/png;base64,${obj.b64}`);
    else if (typeof obj.image_base64 === 'string') imageUrls.push(`data:image/png;base64,${obj.image_base64}`);
  };
  const candidates = [
    response?.data,
    response?.images,
    response?.output,
    response?.result,
    response?.result?.data,
    response?.result?.images,
    response?.choices,
  ];
  for (const c of candidates) {
    if (Array.isArray(c)) c.forEach(pushMaybe);
    else pushMaybe(c);
  }
  return imageUrls;
}

export type ConnectivityStep = {
  key: string;
  title: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  detail?: string;
  at: string;
};

function push(
  steps: ConnectivityStep[],
  key: string,
  title: string,
  status: ConnectivityStep['status'],
  detail?: string
) {
  steps.push({ key, title, status, detail, at: new Date().toISOString() });
}

async function withDeerKeyRotationForTest<T>(fn: (client: DeerAPIClient) => Promise<T>): Promise<T> {
  const baseUrl = process.env.DEERAPI_BASE_URL;
  if (!baseUrl) throw new Error('DEERAPI_BASE_URL 未设置');
  const group = process.env.DEERAPI_GROUP;
  const keys = await getDeerProviderKeys();
  if (!keys.length) {
    throw new Error('未配置 Deer API Key（数据库或环境变量）');
  }
  let lastErr: unknown;
  for (let i = 0; i < keys.length; i++) {
    const client = new DeerAPIClient({ baseUrl, apiKey: keys[i], group });
    try {
      return await fn(client);
    } catch (e) {
      lastErr = e;
      if (i < keys.length - 1 && isDeerRateLimitError(e)) {
        console.warn(`[deer-image-connectivity] 429，切换下一条 Key（${i + 2}/${keys.length}）`);
        continue;
      }
      throw e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export interface DeerImageConnectivityResult {
  success: boolean;
  error?: string;
  taskId?: string;
  responseMeta?: Record<string, unknown>;
  steps: ConnectivityStep[];
}

/**
 * Deer 图片连通性：提交最小请求 → 拿到任务 id（Flux）或同步结果（Seedream/Gemini）→ 必要时轮询
 */
export async function runDeerImageConnectivityTest(modelKey: string): Promise<DeerImageConnectivityResult> {
  const steps: ConnectivityStep[] = [];
  const kind = classifyDeerImageModel(modelKey);
  const deerModel = resolveDeerPhysicalModelName(modelKey);

  try {
    return await withDeerKeyRotationForTest(async (client) => {
      push(steps, 'invoke', '提交图片生成任务', 'running', `kind=${kind}, upstream=${deerModel}`);

      if (kind === 'flux') {
        const prediction = await client.createFluxPrediction({
          model: deerModel,
          prompt: 'A single minimal geometric icon on plain background',
          aspect_ratio: '1:1',
          output_format: 'png',
        });
        const taskId = prediction.id;
        if (!taskId) {
          push(steps, 'invoke', '提交图片生成任务', 'failed', 'Flux 未返回任务 id');
          return { success: false, error: 'Flux 未返回任务 id', steps };
        }
        push(steps, 'invoke', '提交图片生成任务', 'success', `taskId=${taskId}`);
        push(steps, 'poll', '轮询任务直到可获取图片', 'running', `taskId=${taskId}`);

        const maxAttempts = 90;
        const intervalMs = 2000;
        for (let a = 0; a < maxAttempts; a++) {
          await new Promise((r) => setTimeout(r, intervalMs));
          const result = await client.getFluxResult(taskId);
          const st = (result.status || '').toLowerCase();
          if (st === 'ready' && result.result?.sample) {
            push(
              steps,
              'poll',
              '轮询任务直到可获取图片',
              'success',
              `status=${result.status}, imageUrl 已就绪`
            );
            push(steps, 'verify', '验证生成结果', 'success', '已取得图片 URL');
            return {
              success: true,
              taskId,
              responseMeta: { model: modelKey, upstream: deerModel, fluxStatus: result.status },
              steps,
            };
          }
          if (st === 'failed') {
            const err = JSON.stringify(result.error || 'Flux failed');
            push(steps, 'poll', '轮询任务直到可获取图片', 'failed', err);
            return { success: false, error: err, taskId, steps };
          }
        }
        push(steps, 'poll', '轮询任务直到可获取图片', 'failed', '轮询超时（约 3 分钟）');
        return { success: false, error: 'Flux 轮询超时', taskId, steps };
      }

      if (kind === 'seedream') {
        // Seedream 某些模型/账户对 size 参数限制更严格；优先不传 size，让上游使用默认尺寸
        // 且 response_format= url 与 b64_json 行为不一致，连通性测试按模型做双通道探测
        const formats: Array<'url' | 'b64_json'> = ['url', 'b64_json'];
        const sizeModes: Array<'omit' | '1k'> = ['omit', '1k'];
        let lastReason = 'Seedream 未返回图片数据';
        for (const sizeMode of sizeModes) {
          for (const rf of formats) {
            try {
              const req: {
                model: string;
                prompt: string;
                response_format: 'url' | 'b64_json';
                n: number;
                size?: '1k' | '2k' | '4k';
              } = {
                model: deerModel,
                prompt: 'A minimal connectivity test icon',
                response_format: rf,
                n: 1,
              };
              if (sizeMode === '1k') req.size = '1k';

              const response = await client.createSeedreamImageGeneration(req);
              const urls = extractImageUrlsFromSeedreamResponse(response);
              if (urls.length > 0) {
                push(
                  steps,
                  'invoke',
                  '提交图片生成任务',
                  'success',
                  `Seedream 已返回图片数据（response_format=${rf}, size=${sizeMode}）`
                );
                push(steps, 'verify', '验证生成结果', 'success', `images=${urls.length}`);
                return {
                  success: true,
                  responseMeta: {
                    model: modelKey,
                    upstream: deerModel,
                    created: response.created,
                    response_format: rf,
                    size: sizeMode,
                  },
                  steps,
                };
              }
              const responseKeys = Object.keys((response || {}) as Record<string, unknown>).join(', ');
              lastReason = `Seedream 响应未解析到图片字段（response_format=${rf}, size=${sizeMode}, keys: ${responseKeys || 'none'}）`;
            } catch (e) {
              lastReason = e instanceof Error ? e.message : String(e);
              // 当前组合失败继续尝试下一组，全部失败再返回
            }
          }
        }
        push(steps, 'invoke', '提交图片生成任务', 'failed', lastReason);
        return { success: false, error: lastReason, steps };
      }

      if (kind === 'openai') {
        // OpenAI 兼容接口：gpt-image-2 等
        const formats: Array<'url' | 'b64_json'> = ['b64_json', 'url'];
        const sizes = ['1024x1024', '1024x1792', '1792x1024'];
        let lastReason = 'OpenAI 图像生成未返回图片数据';

        for (const size of sizes) {
          for (const rf of formats) {
            try {
              const req = {
                model: deerModel,
                prompt: 'A minimal connectivity test icon',
                n: 1,
                size,
                response_format: rf,
              };

              const response = await client.createOpenAIImageGeneration(req);
              const urls = extractImageUrlsFromOpenAIResponse(response);
              if (urls.length > 0) {
                push(
                  steps,
                  'invoke',
                  '提交图片生成任务',
                  'success',
                  `OpenAI 已返回图片数据（size=${size}, response_format=${rf}）`
                );
                push(steps, 'verify', '验证生成结果', 'success', `images=${urls.length}`);
                return {
                  success: true,
                  responseMeta: {
                    model: modelKey,
                    upstream: deerModel,
                    created: response.created,
                    response_format: rf,
                    size,
                  },
                  steps,
                };
              }
              const responseKeys = Object.keys((response || {}) as Record<string, unknown>).join(', ');
              lastReason = `OpenAI 响应未解析到图片字段（size=${size}, rf=${rf}, keys: ${responseKeys || 'none'}）`;
            } catch (e) {
              lastReason = e instanceof Error ? e.message : String(e);
            }
          }
        }
        push(steps, 'invoke', '提交图片生成任务', 'failed', lastReason);
        return { success: false, error: lastReason, steps };
      }

      // Gemini nano-banana 等：同步 generateContent，尝试 TEXT+IMAGE 与仅 IMAGE
      let response: any;
      try {
        response = await client.generateContent({
          model: deerModel,
          prompt: 'A single minimal geometric icon on plain white background',
          responseModalities: ['TEXT', 'IMAGE'],
        });
      } catch (e1) {
        try {
          response = await client.generateContent({
            model: deerModel,
            prompt: 'A single minimal geometric icon on plain white background',
            responseModalities: ['IMAGE'],
          });
        } catch {
          const msg = e1 instanceof Error ? e1.message : String(e1);
          push(steps, 'invoke', '提交图片生成任务', 'failed', msg);
          return { success: false, error: msg, steps };
        }
      }

      const urls = extractImageUrlsFromGeminiResponse(response);
      if (urls.length > 0) {
        push(steps, 'invoke', '提交图片生成任务', 'success', 'Gemini generateContent 已返回图像数据');
        push(steps, 'verify', '验证生成结果', 'success', `images=${urls.length}`);
        return {
          success: true,
          responseMeta: { model: modelKey, upstream: deerModel, imageCount: urls.length },
          steps,
        };
      }

      push(steps, 'invoke', '提交图片生成任务', 'failed', 'Gemini 响应中未解析到图像数据');
      return {
        success: false,
        error: 'DeerAPI 图像生成响应中未包含可解析的图像数据（请检查上游模型与配额）',
        responseMeta: { model: modelKey, upstream: deerModel },
        steps,
      };
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    push(steps, 'invoke', '提交图片生成任务', 'failed', msg);
    return { success: false, error: msg, steps };
  }
}
