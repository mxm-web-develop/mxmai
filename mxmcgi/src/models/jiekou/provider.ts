/**
 * 接口AI Provider（jiekou.ai）
 * - 文本：OpenAI 兼容 https://api.highwayapi.ai/openai/v1/chat/completions
 * - 图/音/视频：v3 专用端点 https://api.highwayapi.ai/v3/{upstream_model}
 * 文档：https://docs.jiekou.ai/docs/support/quickstart
 */

import type {
  ModelProvider,
  ProviderType,
  GenerateParams,
  GenerateResult,
  ProviderUsageSummary,
  ProviderBillingInfo,
} from '../providers-inner';
import { getFirstProviderKey, recordStats, getProviderStats } from '../providers-inner';
import { isModelEnabled, getByProviderAndModelKey } from '../provider-model-catalog';
import { requireUpstreamPhysicalId } from '../physical-model-id';
import { DeerAPIClient } from '../deerapi/client';
import { jiekouOpenAiRoot } from './base-url';
import { callJiekouV3WithOptionalPoll } from './v3-client';

export class JiekouProvider implements ModelProvider {
  readonly provider: ProviderType = 'jiekou';
  readonly name = '接口AI';

  constructor(
    private readonly injectApiKey?: string,
    private readonly injectBaseUrl?: string,
  ) {}

  private async getApiKey(): Promise<string> {
    const key =
      this.injectApiKey ??
      (await getFirstProviderKey('jiekou')) ??
      process.env.JIEKOU_API_KEY;
    if (!key?.trim()) {
      throw new Error(
        'JIEKOU_API_KEY / Admin 中 provider=jiekou 的 Key 未配置（见 https://docs.jiekou.ai/docs/support/quickstart）',
      );
    }
    return key.trim();
  }

  private getOpenAiRoot(): string {
    return jiekouOpenAiRoot(this.injectBaseUrl);
  }

  private async getClient(): Promise<DeerAPIClient> {
    return new DeerAPIClient({
      apiKey: await this.getApiKey(),
      baseUrl: this.getOpenAiRoot(),
      vendorLabel: '接口AI',
    });
  }

  private resolveUpstreamModel(modelKey: string): string {
    return requireUpstreamPhysicalId('jiekou', modelKey);
  }

  private getModality(modelKey: string): 'text' | 'image' | 'video' | 'audio' {
    const row = getByProviderAndModelKey('jiekou', modelKey);
    if (row) {
      const m = (row.modality ?? '').toLowerCase();
      const s = (row.scope ?? '').toLowerCase();
      if (m === 'video' || s === 'video') return 'video';
      if (m === 'audio' || m === 'music' || s === 'audio' || s === 'music') return 'audio';
      if (m === 'image' || s === 'graph') return 'image';
    }
    if (/gpt-image|nano-banana|gemini-.*-image|seedream|flux|dall-e/i.test(modelKey)) {
      return 'image';
    }
    return 'text';
  }

  supportsModel(modelName: string): boolean {
    return isModelEnabled('jiekou', modelName);
  }

  async generate(modelName: string, params: GenerateParams): Promise<GenerateResult> {
    if (!this.supportsModel(modelName)) {
      throw new Error(`接口AI provider 不支持模型: ${modelName}`);
    }
    const modality = this.getModality(modelName);
    if (modality === 'image') return this.generateImage(modelName, params);
    if (modality === 'video' || modality === 'audio') {
      return this.generateV3Media(modelName, params, modality);
    }
    return this.generateText(modelName, params);
  }

  private async generateText(modelName: string, params: GenerateParams): Promise<GenerateResult> {
    const start = Date.now();
    let success = true;
    let errorCode: string | undefined;

    try {
      const client = await this.getClient();
      const upstreamModel = this.resolveUpstreamModel(modelName);
      const extra = params.parameters || {};
      const resp = await client.chat({
        model: upstreamModel,
        style: 'openai',
        messages: [{ role: 'user', content: params.prompt }],
        temperature: extra.temperature as number | undefined,
        max_tokens: (extra.max_tokens ?? extra.maxTokens) as number | undefined,
        max_completion_tokens: extra.max_completion_tokens as number | undefined,
        stream: false,
      });
      const content = resp.choices?.[0]?.message?.content ?? '';
      const usage = {
        prompt_tokens: resp.usage?.prompt_tokens ?? 0,
        completion_tokens: resp.usage?.completion_tokens ?? 0,
        total_tokens: resp.usage?.total_tokens ?? 0,
      };
      return {
        mediaUrls: content ? [content] : [],
        metadata: {
          provider: this.provider,
          model: modelName,
          upstreamModel,
          text: content,
          usage,
        },
        text: content,
        usage,
      } as GenerateResult;
    } catch (e) {
      success = false;
      errorCode = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      recordStats({
        provider: 'jiekou',
        logicalModel: modelName,
        model_key: modelName,
        success,
        latencyMs: Date.now() - start,
        errorCode,
      });
    }
  }

  private async generateImage(modelName: string, params: GenerateParams): Promise<GenerateResult> {
    return this.generateV3Media(modelName, params, 'image');
  }

  private async generateV3Media(
    modelName: string,
    params: GenerateParams,
    modality: 'image' | 'video' | 'audio',
  ): Promise<GenerateResult> {
    const start = Date.now();
    let success = true;
    let errorCode: string | undefined;

    try {
      const apiKey = await this.getApiKey();
      const upstreamEndpoint = this.resolveUpstreamModel(modelName);
      const p = (params.parameters || {}) as Record<string, unknown>;
      const body = this.buildV3RequestBody(params, modality);
      const maxWaitMs = Number(p.max_wait_ms ?? p.maxWaitMs) || undefined;
      const pollIntervalMs = Number(p.poll_interval_ms ?? p.pollIntervalMs) || undefined;

      console.log(
        `[JiekouProvider] v3/${upstreamEndpoint} modality=${modality}` +
          (body.reference_images || body.images ? '（含参考图）' : ''),
      );

      const { urls, raw } = await callJiekouV3WithOptionalPoll({
        apiKey,
        endpoint: upstreamEndpoint,
        body,
        baseUrl: this.injectBaseUrl,
        maxWaitMs,
        pollIntervalMs,
      });

      if (urls.length === 0) {
        throw new Error('接口AI v3 未返回可用媒体 URL');
      }

      return {
        mediaUrls: urls,
        metadata: {
          provider: this.provider,
          model: modelName,
          upstreamModel: upstreamEndpoint,
          modality,
          raw,
        },
      };
    } catch (e) {
      success = false;
      errorCode = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      recordStats({
        provider: 'jiekou',
        logicalModel: modelName,
        model_key: modelName,
        success,
        latencyMs: Date.now() - start,
        errorCode,
      });
    }
  }

  private buildV3RequestBody(
    params: GenerateParams,
    modality: 'image' | 'video' | 'audio',
  ): Record<string, unknown> {
    const p = (params.parameters || {}) as Record<string, unknown>;
    const body: Record<string, unknown> = {
      prompt: params.prompt,
    };

    if (params.negativePrompt) {
      body.negative_prompt = params.negativePrompt;
    }

    const n = p.n ?? p.num_outputs ?? p.max_images;
    if (n != null) body.n = Number(n);

    const quality = p.quality;
    if (typeof quality === 'string') body.quality = quality;

    const size = this.resolveImageSize(params);
    if (size) {
      if (/^\dK$/i.test(size)) {
        body.size = size.toUpperCase();
      } else {
        body.size = size;
      }
    }

    const aspectRatio =
      (params as { aspect_ratio?: string }).aspect_ratio ||
      (p.aspect_ratio as string | undefined) ||
      (p.aspectRatio as string | undefined);
    if (aspectRatio) body.aspect_ratio = aspectRatio;

    if (modality === 'video') {
      if (p.duration != null) body.duration = Number(p.duration);
      if (typeof p.aspect_ratio === 'string') body.aspect_ratio = p.aspect_ratio;
      if (typeof p.resolution === 'string') body.resolution = p.resolution;
    }

    if (modality === 'audio') {
      if (typeof p.voice_id === 'string') body.voice_id = p.voice_id;
      if (typeof p.text === 'string' && !params.prompt) body.text = p.text;
    }

    const refUris = this.collectReferenceImageUris(params);
    if (refUris.length > 0) {
      body.reference_images = refUris;
      if (modality === 'video' && refUris.length === 1) {
        body.image = refUris[0];
      }
      if (modality === 'image') {
        body.images = refUris;
      }
    }

    for (const [k, v] of Object.entries(p)) {
      if (
        v === undefined ||
        k === 'n' ||
        k === 'num_outputs' ||
        k === 'max_images' ||
        k === 'quality' ||
        k === 'size' ||
        k === 'aspect_ratio' ||
        k === 'aspectRatio' ||
        k === 'max_wait_ms' ||
        k === 'maxWaitMs' ||
        k === 'poll_interval_ms' ||
        k === 'pollIntervalMs'
      ) {
        continue;
      }
      if (!(k in body)) body[k] = v;
    }

    return body;
  }

  private resolveImageSize(params: GenerateParams): string | undefined {
    const p = params.parameters || {};
    if (typeof p.size === 'string') return p.size;
    if (typeof p.image_size === 'string') return p.image_size;
    const ar =
      (params as { aspect_ratio?: string }).aspect_ratio ||
      (p.aspect_ratio as string | undefined) ||
      (p.aspectRatio as string | undefined);
    if (ar === '1:1') return '1024x1024';
    if (ar === '16:9') return '1792x1024';
    if (ar === '9:16') return '1024x1792';
    if (ar === '3:4') return '1024x1536';
    if (ar === '4:3') return '1536x1024';
    return undefined;
  }

  private hasNonemptyImageSlot(v: unknown): boolean {
    if (v == null) return false;
    if (typeof v === 'string') return v.trim().length > 0;
    if (Array.isArray(v)) {
      return v.some((x) => typeof x === 'string' && String(x).trim().length > 0);
    }
    return false;
  }

  private collectReferenceImageUris(params: GenerateParams): string[] {
    const p = (params.parameters || {}) as Record<string, unknown>;
    const top = params as Record<string, unknown>;
    const slots: unknown[] = [];
    for (const key of [
      'image',
      'image_base64s',
      'images',
      'image_input',
      'image_urls',
      'reference_images',
    ]) {
      if (this.hasNonemptyImageSlot(p[key])) slots.push(p[key]);
      if (this.hasNonemptyImageSlot(top[key])) slots.push(top[key]);
    }

    const out: string[] = [];
    const pushOne = (raw: string) => {
      const s = raw.trim();
      if (!s) return;
      if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('data:')) {
        out.push(s);
        return;
      }
      out.push(`data:image/png;base64,${s}`);
    };

    for (const slot of slots) {
      if (typeof slot === 'string') pushOne(slot);
      else if (Array.isArray(slot)) {
        for (const item of slot) {
          if (typeof item === 'string') pushOne(item);
        }
      }
    }
    return out;
  }

  async getUsageSummary(window: string): Promise<ProviderUsageSummary> {
    const list = await getProviderStats({ provider: 'jiekou', window });
    const agg = list.find((a) => a.provider === 'jiekou') || {
      provider: 'jiekou' as ProviderType,
      requestCount: 0,
      successCount: 0,
      errorRate: 0,
      avgLatencyMs: 0,
      window,
    };
    return {
      provider: 'jiekou',
      requestCount: agg.requestCount,
      successCount: agg.successCount,
      errorRate: agg.errorRate,
      avgLatencyMs: agg.avgLatencyMs,
      window: agg.window,
    };
  }

  async getBillingInfo(): Promise<ProviderBillingInfo> {
    return { provider: 'jiekou', supported: false };
  }
}
