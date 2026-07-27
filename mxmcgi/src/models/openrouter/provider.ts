/**
 * OpenRouter Provider
 *
 * OpenAI-compatible API 代理，支持 400+ 模型：
 * - Text/Chat（/api/v1/chat/completions）
 * - Image generation（modalities: ["image"]）
 * - Video generation（/api/v1/videos + polling）
 *
 * 可作为 DeerAPI 的替代方案：统一 endpoint，多 provider 自动 fallback。
 * 文档: https://openrouter.ai/docs/quickstart
 */

import type {
  ModelProvider,
  ProviderType,
  GenerateParams,
  GenerateResult,
  StreamChunk,
  StreamStatus,
  ProgressEvent,
  ProgressStatus,
  ProviderUsageSummary,
  ProviderBillingInfo,
} from '../providers-inner';
import { getFirstProviderKey, recordStats, getProviderStats } from '../providers-inner';
import { isModelEnabled, getByProviderAndModelKey } from '../provider-model-catalog';
import { requireUpstreamPhysicalId } from '../physical-model-id';
import {
  buildOpenRouterImageUserMessage,
  collectOpenRouterReferenceImageUrls,
  extractOpenRouterGeneratedImageUrls,
  mapAspectRatioToOpenRouterImageConfig,
} from './image-chat';
import { fetch as undiciFetch } from 'undici';

const BASE_URL = 'https://openrouter.ai/api/v1';

export class OpenRouterProvider implements ModelProvider {
  readonly provider: ProviderType = 'openrouter';
  readonly name = 'OpenRouter';

  constructor(
    private readonly injectApiKey?: string,
    private readonly injectBaseUrl?: string,
  ) {}

  private async getApiKey(): Promise<string> {
    const key =
      this.injectApiKey ??
      (await getFirstProviderKey('openrouter')) ??
      process.env.OPENROUTER_API_KEY;
    if (!key) {
      throw new Error(
        'OPENROUTER_API_KEY / Admin 中 provider=openrouter 的 Key 未配置',
      );
    }
    return key;
  }

  private getBaseUrl(): string {
    const base =
      this.injectBaseUrl || process.env.OPENROUTER_BASE_URL || BASE_URL;
    return base.replace(/\/+$/, '');
  }

  private resolveUpstreamModel(modelKey: string): string {
    return requireUpstreamPhysicalId('openrouter', modelKey);
  }

  private getModality(modelKey: string): 'text' | 'image' | 'video' {
    const row = getByProviderAndModelKey('openrouter', modelKey);
    if (row) {
      const m = (row.modality ?? '').toLowerCase();
      const s = (row.scope ?? '').toLowerCase();
      if (m === 'video' || s === 'video') return 'video';
      if (m === 'image' || s === 'graph') return 'image';
      if (m === 'text' || ['writing', 'text', 'default', 'outline'].includes(s)) return 'text';
    }
    return 'text';
  }

  supportsModel(modelName: string): boolean {
    return isModelEnabled('openrouter', modelName);
  }

  async generate(modelName: string, params: GenerateParams): Promise<GenerateResult> {
    if (!this.supportsModel(modelName)) {
      throw new Error(`OpenRouter provider 不支持模型: ${modelName}`);
    }

    const modality = this.getModality(modelName);

    switch (modality) {
      case 'video':
        return this.generateVideo(modelName, params);
      case 'image':
        return this.generateImage(modelName, params);
      default:
        return this.generateText(modelName, params);
    }
  }

  // ─── Text / Chat Completions ─────────────────────────────────────────────────

  private async generateText(modelName: string, params: GenerateParams): Promise<GenerateResult> {
    const start = Date.now();
    let success = true;
    let errorCode: string | undefined;

    try {
      const apiKey = await this.getApiKey();
      const upstreamModel = this.resolveUpstreamModel(modelName);
      const baseUrl = this.getBaseUrl();

      const { collectOpenRouterReferenceImageUrls, buildOpenRouterImageUserMessage } = await import(
        './image-chat'
      );
      const refFromParams = collectOpenRouterReferenceImageUrls(params as any);
      const refFromReferenceImage: string[] = [];
      const refArr = (params as { referenceImage?: unknown }).referenceImage;
      if (Array.isArray(refArr)) {
        for (const row of refArr) {
          const c =
            row && typeof row === 'object'
              ? (row as { content?: string }).content
              : undefined;
          if (typeof c === 'string' && c.trim()) {
            const s = c.trim();
            refFromReferenceImage.push(
              s.startsWith('http') || s.startsWith('data:') ? s : `data:image/png;base64,${s}`
            );
          }
        }
      }
      const referenceUrls = [...new Set([...refFromParams, ...refFromReferenceImage])];
      const userContent = buildOpenRouterImageUserMessage(params.prompt, referenceUrls);

      const passthrough = { ...(params.parameters || {}) } as Record<string, unknown>;
      // 避免把图片槽位原样塞进 chat/completions body
      for (const k of ['image', 'images', 'image_base64s', 'image_urls', 'image_input']) {
        delete passthrough[k];
      }

      const body: Record<string, any> = {
        model: upstreamModel,
        messages: [{ role: 'user', content: userContent }],
        ...passthrough,
      };

      if (params.outputFormat === 'stream') {
        body.stream = true;
        return this.handleTextStream(baseUrl, apiKey, body, modelName, upstreamModel);
      }

      const resp = await undiciFetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://supermxmai.com',
          'X-OpenRouter-Title': 'SuperMXMai',
        },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        errorCode = `${resp.status}`;
        throw new Error(
          `OpenRouter 请求失败: ${resp.status} ${resp.statusText} ${text.slice(0, 500)}`,
        );
      }

      const json: any = await resp.json();
      const content: string = json?.choices?.[0]?.message?.content ?? '';
      const usage = {
        prompt_tokens: json?.usage?.prompt_tokens || 0,
        completion_tokens: json?.usage?.completion_tokens || 0,
        total_tokens: json?.usage?.total_tokens || 0,
      };

      return {
        mediaUrls: content ? [content] : [],
        metadata: {
          provider: this.provider,
          model: modelName,
          upstreamModel,
          text: content,
          usage,
          raw: json,
          visionImageCount: referenceUrls.length,
        },
        text: content,
        usage,
      } as any;
    } catch (e) {
      success = false;
      if (!errorCode) errorCode = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      recordStats({
        provider: 'openrouter',
        logicalModel: modelName,
        model_key: modelName,
        success,
        latencyMs: Date.now() - start,
        errorCode,
      });
    }
  }

  private async handleTextStream(
    baseUrl: string,
    apiKey: string,
    body: Record<string, any>,
    modelName: string,
    upstreamModel: string,
  ): Promise<GenerateResult> {
    const resp = await undiciFetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://supermxmai.com',
        'X-OpenRouter-Title': 'SuperMXMai',
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(
        `OpenRouter stream 请求失败: ${resp.status} ${resp.statusText} ${text.slice(0, 500)}`,
      );
    }

    const reader = resp.body;
    if (!reader) {
      throw new Error('OpenRouter 返回了空响应体');
    }

    const self = this;
    const stream = (async function* (): AsyncIterable<StreamChunk> {
      let status: StreamStatus = 'pending';
      let collection = '';
      const decoder = new TextDecoder();
      let buffer = '';

      for await (const raw of reader as any) {
        const text = decoder.decode(raw, { stream: true });
        buffer += text;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') {
            status = 'completed';
            yield { chunk: '', status, collection };
            return;
          }
          try {
            const parsed = JSON.parse(data);
            const delta = parsed?.choices?.[0]?.delta?.content;
            if (typeof delta === 'string' && delta.length > 0) {
              if (status === 'pending') status = 'streaming';
              collection += delta;
              yield { chunk: delta, status, collection };
            }
          } catch {
            // skip malformed SSE lines
          }
        }
      }

      if (status === 'streaming') {
        status = 'completed';
        yield { chunk: '', status, collection };
      }
    })();

    const stringStream = (async function* () {
      for await (const chunk of stream) {
        if (chunk.chunk) yield chunk.chunk;
      }
    })();

    return {
      mediaUrls: [],
      metadata: {
        provider: self.provider,
        model: modelName,
        upstreamModel,
        outputFormat: 'stream',
      },
      stream,
      streamString: stringStream,
    };
  }

  // ─── Image Generation ────────────────────────────────────────────────────────

  private async generateImage(modelName: string, params: GenerateParams): Promise<GenerateResult> {
    const start = Date.now();
    let success = true;
    let errorCode: string | undefined;

    try {
      const apiKey = await this.getApiKey();
      const upstreamModel = this.resolveUpstreamModel(modelName);
      const baseUrl = this.getBaseUrl();

      const extra = {
        ...(params.parameters || {}),
        ...((params as { aspect_ratio?: string }).aspect_ratio
          ? { aspect_ratio: (params as { aspect_ratio?: string }).aspect_ratio }
          : {}),
      } as Record<string, unknown>;

      const refUrls = collectOpenRouterReferenceImageUrls(params);
      const userContent = buildOpenRouterImageUserMessage(params.prompt, refUrls);
      const imageConfig = mapAspectRatioToOpenRouterImageConfig(extra);

      const body: Record<string, unknown> = {
        model: upstreamModel,
        messages: [{ role: 'user', content: userContent }],
        modalities: ['image', 'text'],
      };
      if (imageConfig) body.image_config = imageConfig;

      console.log(
        `[OpenRouterProvider] chat/completions 图生 model=${upstreamModel}` +
          (refUrls.length ? ` refs=${refUrls.length}` : ' text-only'),
      );

      const resp = await undiciFetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://supermxmai.com',
          'X-OpenRouter-Title': 'SuperMXMai',
        },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        errorCode = `${resp.status}`;
        throw new Error(
          `OpenRouter image 请求失败: ${resp.status} ${resp.statusText} ${text.slice(0, 500)}`,
        );
      }

      const json: unknown = await resp.json();
      const mediaUrls = extractOpenRouterGeneratedImageUrls(json);
      if (mediaUrls.length === 0) {
        throw new Error(
          'OpenRouter 图生响应未包含 images（请确认 model 支持 output_modalities=image，如 openai/gpt-5-image）',
        );
      }

      return {
        mediaUrls,
        metadata: {
          provider: this.provider,
          model: modelName,
          upstreamModel,
          raw: json,
        },
      };
    } catch (e) {
      success = false;
      if (!errorCode) errorCode = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      recordStats({
        provider: 'openrouter',
        logicalModel: modelName,
        model_key: modelName,
        success,
        latencyMs: Date.now() - start,
        errorCode,
      });
    }
  }

  // ─── Video Generation ────────────────────────────────────────────────────────

  private async generateVideo(modelName: string, params: GenerateParams): Promise<GenerateResult> {
    const start = Date.now();
    let success = true;
    let errorCode: string | undefined;

    try {
      const apiKey = await this.getApiKey();
      const upstreamModel = this.resolveUpstreamModel(modelName);
      const baseUrl = this.getBaseUrl();
      const extra = params.parameters || {};

      const body: Record<string, any> = {
        model: upstreamModel,
        prompt: params.prompt,
      };

      if (extra.duration) body.duration = extra.duration;
      if (extra.resolution) body.resolution = extra.resolution;
      if (extra.size) body.size = extra.size;
      if (extra.generate_audio != null) body.generate_audio = extra.generate_audio;
      if (extra.seed != null) body.seed = extra.seed;

      if (extra.reference_images && Array.isArray(extra.reference_images) && extra.reference_images.length > 0) {
        body.frame_images = [
          { type: 'image_url', image_url: { url: extra.reference_images[0] }, frame_type: 'first_frame' },
        ];
      } else if (extra.input_reference && typeof extra.input_reference === 'string') {
        body.frame_images = [
          { type: 'image_url', image_url: { url: extra.input_reference }, frame_type: 'first_frame' },
        ];
      }

      console.log('[OpenRouterProvider] 提交 video 任务:', {
        model: upstreamModel,
        promptPreview: params.prompt.slice(0, 80),
        duration: extra.duration,
      });

      const resp = await undiciFetch(`${baseUrl}/videos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://supermxmai.com',
          'X-OpenRouter-Title': 'SuperMXMai',
        },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        errorCode = `${resp.status}`;
        throw new Error(
          `OpenRouter video 请求失败: ${resp.status} ${resp.statusText} ${text.slice(0, 500)}`,
        );
      }

      const createResult: any = await resp.json();
      const jobId = createResult?.id;
      const pollingUrl = createResult?.polling_url;

      if (!jobId && !pollingUrl) {
        throw new Error('OpenRouter video 创建成功但未返回 job ID 或 polling URL');
      }

      const progressStream = this.createVideoProgressStream(
        jobId,
        pollingUrl || `${baseUrl}/videos/${jobId}`,
        apiKey,
      );

      const outputPromise = this.waitForVideoCompletion(
        jobId,
        pollingUrl || `${baseUrl}/videos/${jobId}`,
        apiKey,
      );

      const mediaUrls = await outputPromise;

      return {
        mediaUrls,
        metadata: {
          provider: this.provider,
          model: modelName,
          upstreamModel,
          videoJobId: jobId,
        },
        progress: progressStream,
      };
    } catch (e) {
      success = false;
      if (!errorCode) errorCode = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      recordStats({
        provider: 'openrouter',
        logicalModel: modelName,
        model_key: modelName,
        success,
        latencyMs: Date.now() - start,
        errorCode,
      });
    }
  }

  private async waitForVideoCompletion(
    jobId: string,
    pollingUrl: string,
    apiKey: string,
  ): Promise<string[]> {
    const maxAttempts = 360;
    const pollInterval = 10000;

    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, pollInterval));

      const resp = await undiciFetch(pollingUrl, {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        if (resp.status >= 500) continue;
        throw new Error(`OpenRouter video poll 失败 (${jobId}): ${resp.status} ${text.slice(0, 300)}`);
      }

      const data: any = await resp.json();
      const status = data?.status;

      if (status === 'completed' || status === 'succeeded') {
        const urls: string[] = [];
        if (data.output?.url) urls.push(data.output.url);
        if (data.output?.video_url) urls.push(data.output.video_url);
        if (data.video_url) urls.push(data.video_url);
        if (Array.isArray(data.output?.urls)) urls.push(...data.output.urls);
        if (Array.isArray(data.generations)) {
          for (const g of data.generations) {
            if (g?.url) urls.push(g.url);
            if (g?.video_url) urls.push(g.video_url);
          }
        }
        if (urls.length === 0) {
          throw new Error(
            `OpenRouter video job ${jobId} 完成但未返回视频 URL: ${JSON.stringify(data).slice(0, 500)}`,
          );
        }
        return Array.from(new Set(urls));
      }

      if (status === 'failed' || status === 'canceled' || status === 'cancelled') {
        const errMsg = data?.error || data?.failure_reason || 'Unknown error';
        throw new Error(`OpenRouter video job ${jobId} 失败: ${errMsg}`);
      }
    }

    throw new Error(`OpenRouter video job ${jobId} 超时（${maxAttempts * pollInterval / 1000}s）`);
  }

  private async *createVideoProgressStream(
    jobId: string,
    pollingUrl: string,
    apiKey: string,
  ): AsyncIterable<ProgressEvent> {
    const maxAttempts = 360;
    const pollInterval = 10000;

    yield { status: 'starting' as ProgressStatus, progress: 5 };

    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, pollInterval));

      try {
        const resp = await undiciFetch(pollingUrl, {
          method: 'GET',
          headers: { Authorization: `Bearer ${apiKey}` },
        });

        if (!resp.ok) continue;
        const data: any = await resp.json();
        const status = data?.status;

        if (status === 'completed' || status === 'succeeded') {
          yield { status: 'succeeded' as ProgressStatus, progress: 100 };
          return;
        }
        if (status === 'failed' || status === 'canceled' || status === 'cancelled') {
          yield {
            status: 'failed' as ProgressStatus,
            error: data?.error || data?.failure_reason || 'Unknown',
          };
          return;
        }

        const progress = Math.min(95, 5 + Math.floor((i / maxAttempts) * 90));
        yield {
          status: 'processing' as ProgressStatus,
          progress,
          logs: data?.progress_message ? [data.progress_message] : undefined,
        };
      } catch {
        // transient network error, keep polling
      }
    }

    yield { status: 'failed' as ProgressStatus, error: 'Timeout' };
  }

  // ─── Admin 监控 ──────────────────────────────────────────────────────────────

  async getUsageSummary(window: string): Promise<ProviderUsageSummary> {
    const list = await getProviderStats({ provider: 'openrouter', window });
    const agg = list.find((a) => a.provider === 'openrouter') || {
      provider: 'openrouter' as ProviderType,
      requestCount: 0,
      successCount: 0,
      errorRate: 0,
      avgLatencyMs: 0,
      window,
    };
    return {
      provider: 'openrouter',
      requestCount: agg.requestCount,
      successCount: agg.successCount,
      errorRate: agg.errorRate,
      avgLatencyMs: agg.avgLatencyMs,
      window: agg.window,
    };
  }

  async getBillingInfo(): Promise<ProviderBillingInfo> {
    return { provider: 'openrouter', supported: false };
  }
}
