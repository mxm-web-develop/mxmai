/**
 * Maxplan Provider - TokenPlan 国内入口
 * API 文档: https://api.minimaxi.com/v1/text/chatcompletion_v2
 */

import {
  type ModelProvider,
  type ProviderType,
  type GenerateParams,
  type GenerateResult,
  type ProviderUsageSummary,
  type ProviderBillingInfo,
  recordStats,
  getProviderStats,
} from '../../core/providers';
import { getFirstProviderKey } from '../../core/providers/provider-keys';
import { isModelEnabled } from '../provider-model-catalog';
import { requireUpstreamPhysicalId } from '../physical-model-id';

export class MaxplanProvider implements ModelProvider {
  readonly provider: ProviderType = 'maxplan';
  readonly name = 'Maxplan';

  constructor(private readonly injectApiKey?: string, private readonly injectBaseUrl?: string) {}

  private async getApiKey(): Promise<string> {
    const key =
      this.injectApiKey ??
      (await getFirstProviderKey('maxplan')) ??
      process.env.MAXPLAN_API_KEY;
    if (!key) {
      throw new Error('MAXPLAN_API_KEY / Admin 中 provider=maxplan 的 Key 未配置');
    }
    return key;
  }

  private getBaseUrl(): string {
    const base =
      this.injectBaseUrl ||
      process.env.MAXPLAN_BASE_URL ||
      'https://api.minimaxi.com';
    return String(base).replace(/\/+$/, '');
  }

  private resolveUpstreamModel(modelKey: string): string {
    return requireUpstreamPhysicalId('maxplan', modelKey);
  }

  supportsModel(modelName: string): boolean {
    return isModelEnabled('maxplan', modelName);
  }

  getUsageSummary(window: string): Promise<ProviderUsageSummary> {
    return getProviderStats({ provider: this.provider, window }).then((list) => {
      return (
        list.find((a) => a.provider === this.provider) || {
          provider: this.provider,
          requestCount: 0,
          successCount: 0,
          errorRate: 0,
          avgLatencyMs: 0,
          window,
        }
      );
    });
  }

  async getBillingInfo(): Promise<ProviderBillingInfo> {
    return { provider: 'maxplan', supported: false };
  }

  /**
   * Maxplan 文本生成 - Chat Completion v2
   * POST https://api.minimaxi.com/v1/text/chatcompletion_v2
   */
  private async generateText(modelKey: string, params: GenerateParams): Promise<GenerateResult> {
    const apiKey = await this.getApiKey();
    const upstreamModel = this.resolveUpstreamModel(modelKey);
    const baseUrl = this.getBaseUrl();

    const rawParams = (params.parameters ?? {}) as Record<string, unknown>;
    const providedMessages = (rawParams as any).messages;

    const body: Record<string, any> = {
      model: upstreamModel,
      ...rawParams,
      messages: Array.isArray(providedMessages)
        ? providedMessages
        : [{ role: 'user', content: params.prompt }],
    };

    const resp = await fetch(`${baseUrl}/v1/text/chatcompletion_v2`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`Maxplan API 请求失败: ${resp.status} ${resp.statusText} ${text}`);
    }

    const json: any = await resp.json().catch(() => ({}));
    const content: string =
      json?.choices?.[0]?.message?.content != null ? String(json.choices[0].message.content) : '';

    const usage = {
      prompt_tokens: Number(json?.usage?.prompt_tokens ?? 0),
      completion_tokens: Number(json?.usage?.completion_tokens ?? 0),
      total_tokens: Number(json?.usage?.total_tokens ?? 0),
    };

    return {
      mediaUrls: content ? [content] : [],
      metadata: {
        provider: this.provider,
        model: modelKey,
        upstreamModel,
        text: content,
        usage,
        raw: json,
      },
    } as any;
  }

  async generate(modelName: string, params: GenerateParams): Promise<GenerateResult> {
    if (!this.supportsModel(modelName)) {
      throw new Error(`Maxplan provider 不支持模型: ${modelName}`);
    }

    const start = Date.now();
    let success = true;
    let errorCode: string | undefined;
    try {
      return await this.generateText(modelName, params);
    } catch (e) {
      success = false;
      errorCode = 'maxplan_error';
      throw e;
    } finally {
      const latencyMs = Date.now() - start;
      recordStats({
        provider: this.provider,
        logicalModel: modelName,
        model_key: modelName,
        success,
        latencyMs,
        errorCode,
      });
    }
  }
}