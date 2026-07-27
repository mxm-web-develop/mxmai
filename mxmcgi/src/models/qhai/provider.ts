/**
 * 启航 AI Provider（OpenAI 兼容）
 * 文档：https://www.qhaigc.net/docs/quickstart
 * Base URL 默认 https://api.qhaigc.net/v1
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
import { normalizeQhaiApiRoot } from './base-url';

export class QhaiProvider implements ModelProvider {
  readonly provider: ProviderType = 'qhai';
  readonly name = '启航 AI';

  constructor(
    private readonly injectApiKey?: string,
    private readonly injectBaseUrl?: string,
  ) {}

  private async getApiKey(): Promise<string> {
    const key =
      this.injectApiKey ??
      (await getFirstProviderKey('qhai')) ??
      process.env.QHAI_API_KEY;
    if (!key?.trim()) {
      throw new Error(
        'QHAI_API_KEY / Admin 中 provider=qhai 的 Key 未配置（见 https://www.qhaigc.net/docs/quickstart）',
      );
    }
    return key.trim();
  }

  /** DeerAPIClient 用：根地址不含 /v1（见 base-url.ts） */
  private getBaseUrl(): string {
    return normalizeQhaiApiRoot(this.injectBaseUrl);
  }

  private async getClient(): Promise<DeerAPIClient> {
    return new DeerAPIClient({
      apiKey: await this.getApiKey(),
      baseUrl: this.getBaseUrl(),
      vendorLabel: '启航 AI',
    });
  }

  private resolveUpstreamModel(modelKey: string): string {
    return requireUpstreamPhysicalId('qhai', modelKey);
  }

  private getModality(modelKey: string): 'text' | 'image' {
    const row = getByProviderAndModelKey('qhai', modelKey);
    if (row) {
      const m = (row.modality ?? '').toLowerCase();
      const s = (row.scope ?? '').toLowerCase();
      if (m === 'image' || s === 'graph') return 'image';
    }
    if (/gpt-image|nano-banana|qh-draw|dall-e|image/i.test(modelKey)) return 'image';
    return 'text';
  }

  supportsModel(modelName: string): boolean {
    return isModelEnabled('qhai', modelName);
  }

  async generate(modelName: string, params: GenerateParams): Promise<GenerateResult> {
    if (!this.supportsModel(modelName)) {
      throw new Error(`启航 AI provider 不支持模型: ${modelName}`);
    }
    const modality = this.getModality(modelName);
    if (modality === 'image') {
      return this.generateImage(modelName, params);
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
        provider: 'qhai',
        logicalModel: modelName,
        model_key: modelName,
        success,
        latencyMs: Date.now() - start,
        errorCode,
      });
    }
  }

  /**
   * 启航上 gpt-image / nano-banana 仅对 /v1/images/generations 配置了计费；
   * /v1/images/edits 会 403 model_price_not_configured。参考图用 extra_fields.reference_images。
   * @see https://www.qhaigc.net/docs/api-reference/images/banana-generate
   */
  private usesGenerationsWithReferenceImages(modelKey: string, upstreamModel: string): boolean {
    const s = `${modelKey} ${upstreamModel}`;
    return /gpt-image|nano-banana/i.test(s);
  }

  private async generateImage(modelName: string, params: GenerateParams): Promise<GenerateResult> {
    const start = Date.now();
    let success = true;
    let errorCode: string | undefined;

    try {
      const client = await this.getClient();
      const upstreamModel = this.resolveUpstreamModel(modelName);
      const size = this.resolveImageSize(params) || '1024x1024';
      const refUris = this.collectReferenceImageUris(params);
      const useGenRefs = this.usesGenerationsWithReferenceImages(modelName, upstreamModel);

      let response: { data: Array<{ url?: string; b64_json?: string }> };
      if (useGenRefs) {
        const extra_fields =
          refUris.length > 0 ? { reference_images: refUris } : undefined;
        console.log(
          `[QhaiProvider] /v1/images/generations 模型=${upstreamModel}` +
            (refUris.length ? `，reference_images=${refUris.length}` : ''),
        );
        response = await client.createOpenAIImageGeneration({
          model: upstreamModel,
          prompt: params.prompt,
          n: this.resolveImageCount(params),
          size,
          extra_fields,
        });
      } else if (refUris.length > 0) {
        const images = this.collectReferenceImages(params);
        console.log(
          `[QhaiProvider] 参考图 ${images.length} 张，走 /v1/images/edits，模型: ${upstreamModel}`,
        );
        response = await client.createOpenAIImageEdit({
          model: upstreamModel,
          prompt: params.prompt,
          images,
          n: this.resolveImageCount(params),
          size,
        });
      } else {
        response = await client.createOpenAIImageGeneration({
          model: upstreamModel,
          prompt: params.prompt,
          n: this.resolveImageCount(params),
          size,
        });
      }

      const mediaUrls = this.extractImageUrls(response);
      if (mediaUrls.length === 0) {
        throw new Error('启航 AI 图像接口未返回可用 URL 或 base64');
      }

      return {
        mediaUrls,
        metadata: {
          provider: this.provider,
          model: modelName,
          upstreamModel,
          raw: response,
        },
      };
    } catch (e) {
      success = false;
      errorCode = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      recordStats({
        provider: 'qhai',
        logicalModel: modelName,
        model_key: modelName,
        success,
        latencyMs: Date.now() - start,
        errorCode,
      });
    }
  }

  private resolveImageCount(params: GenerateParams): number | undefined {
    const p = params.parameters || {};
    const n = p.n ?? p.num_outputs ?? p.max_images;
    return n != null ? Number(n) : undefined;
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

  /** 启航 generations + extra_fields.reference_images（URL 或 data URI） */
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

  private collectReferenceImages(
    params: GenerateParams,
  ): Array<{ data: Buffer; filename: string; contentType: string }> {
    const p = (params.parameters || {}) as Record<string, unknown>;
    const top = params as Record<string, unknown>;
    const slots: unknown[] = [];
    for (const key of [
      'image',
      'image_base64s',
      'images',
      'image_input',
      'image_urls',
    ]) {
      if (this.hasNonemptyImageSlot(p[key])) slots.push(p[key]);
      if (this.hasNonemptyImageSlot(top[key])) slots.push(top[key]);
    }

    const out: Array<{ data: Buffer; filename: string; contentType: string }> = [];
    let idx = 0;
    const pushOne = (raw: string) => {
      const s = raw.trim();
      if (!s) return;
      let b64 = s;
      let ct = 'image/png';
      if (s.startsWith('data:')) {
        const m = /^data:([^;]+);base64,(.+)$/i.exec(s);
        if (m) {
          ct = m[1] || ct;
          b64 = m[2];
        }
      } else if (s.startsWith('http://') || s.startsWith('https://')) {
        throw new Error(
          '启航 AI 图像编辑当前仅支持 base64/data URI 参考图；请由 graph-service 在 qhai 路径下转为 data URI',
        );
      }
      const buf = Buffer.from(b64, 'base64');
      const ext = ct.includes('jpeg') || ct.includes('jpg') ? 'jpg' : 'png';
      out.push({ data: buf, filename: `ref-${idx++}.${ext}`, contentType: ct });
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

  private extractImageUrls(response: {
    data?: Array<{ url?: string; b64_json?: string }>;
  }): string[] {
    const urls: string[] = [];
    for (const item of response.data ?? []) {
      if (item?.url) urls.push(item.url);
      else if (item?.b64_json) {
        urls.push(`data:image/png;base64,${item.b64_json}`);
      }
    }
    return urls;
  }

  async getUsageSummary(window: string): Promise<ProviderUsageSummary> {
    const list = await getProviderStats({ provider: 'qhai', window });
    const agg = list.find((a) => a.provider === 'qhai') || {
      provider: 'qhai' as ProviderType,
      requestCount: 0,
      successCount: 0,
      errorRate: 0,
      avgLatencyMs: 0,
      window,
    };
    return {
      provider: 'qhai',
      requestCount: agg.requestCount,
      successCount: agg.successCount,
      errorRate: agg.errorRate,
      avgLatencyMs: agg.avgLatencyMs,
      window: agg.window,
    };
  }

  async getBillingInfo(): Promise<ProviderBillingInfo> {
    return { provider: 'qhai', supported: false };
  }
}
