/**
 * Anthropic Provider（Claude 系列）
 *
 * 封装 Claude Messages 接口，当前仅支持文本模型：
 * - claude-4.5-sonnet
 * - claude-3-5-sonnet
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
import { isModelEnabled } from '../provider-model-catalog';
import { requireUpstreamPhysicalId } from '../physical-model-id';

export class AnthropicProvider implements ModelProvider {
  readonly provider: ProviderType = 'anthropic';
  readonly name = 'Anthropic Claude';

  constructor(private readonly injectApiKey?: string, private readonly injectBaseUrl?: string) {}

  private async getApiKey(): Promise<string> {
    const key =
      this.injectApiKey ?? (await getFirstProviderKey('anthropic')) ?? process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error('ANTHROPIC_API_KEY / Admin 中 provider=anthropic 的 Key 未配置');
    }
    return key;
  }

  private getBaseUrl(): string {
    const base = this.injectBaseUrl || process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1';
    return base.replace(/\/+$/, '');
  }

  private resolveModelName(modelKey: string): string {
    return requireUpstreamPhysicalId('anthropic', modelKey);
  }

  supportsModel(modelName: string): boolean {
    return isModelEnabled('anthropic', modelName);
  }

  async generate(modelName: string, params: GenerateParams): Promise<GenerateResult> {
    if (!this.supportsModel(modelName)) {
      throw new Error(`Anthropic provider 不支持模型: ${modelName}`);
    }

    const start = Date.now();
    let success = true;
    let errorCode: string | undefined;

    try {
      const apiKey = await this.getApiKey();
      const upstreamModel = this.resolveModelName(modelName);
      const baseUrl = this.getBaseUrl();

      const url = `${baseUrl}/messages`;

      const systemPrompt = params.parameters?.system_prompt || params.parameters?.system_instruction;
      const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
      if (systemPrompt) {
        // Claude 把 system 放在单独字段
      }
      messages.push({
        role: 'user',
        content: params.prompt,
      });

      const maxTokens =
        params.parameters?.max_tokens ??
        params.parameters?.max_output_tokens ??
        4096;

      const body: Record<string, any> = {
        model: upstreamModel,
        max_tokens: maxTokens,
        messages,
        ...(systemPrompt ? { system: String(systemPrompt) } : {}),
      };

      if (params.parameters?.temperature != null) {
        body.temperature = params.parameters.temperature;
      }

      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': process.env.ANTHROPIC_API_VERSION || '2023-06-01',
        },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        errorCode = `${resp.status} ${resp.statusText}`;
        throw new Error(`Anthropic 请求失败: ${resp.status} ${resp.statusText} ${text}`);
      }

      const json: any = await resp.json();
      let contentText = '';
      if (Array.isArray(json?.content)) {
        contentText = json.content
          .filter((c: any) => c && c.type === 'text' && typeof c.text === 'string')
          .map((c: any) => c.text)
          .join('');
      }

      const usage = json.usage
        ? {
            prompt_tokens: json.usage.input_tokens,
            completion_tokens: json.usage.output_tokens,
            total_tokens:
              (json.usage.input_tokens || 0) + (json.usage.output_tokens || 0),
          }
        : undefined;

      return {
        mediaUrls: [],
        metadata: {
          provider: this.provider,
          model: modelName,
          upstreamModel,
          text: contentText,
          usage,
          raw: json,
        },
      };
    } catch (e) {
      success = false;
      if (!errorCode && e instanceof Error) {
        errorCode = e.message;
      }
      throw e;
    } finally {
      recordStats({
        provider: 'anthropic',
        logicalModel: modelName,
        model_key: modelName,
        success,
        latencyMs: Date.now() - start,
        errorCode,
      });
    }
  }

  async getUsageSummary(window: string): Promise<ProviderUsageSummary> {
    const list = getProviderStats({ provider: 'anthropic', window });
    const agg =
      list.find((a) => a.provider === 'anthropic') || {
        provider: 'anthropic' as ProviderType,
        requestCount: 0,
        successCount: 0,
        errorRate: 0,
        avgLatencyMs: 0,
        window,
      };
    return {
      provider: 'anthropic',
      requestCount: agg.requestCount,
      successCount: agg.successCount,
      errorRate: agg.errorRate,
      avgLatencyMs: agg.avgLatencyMs,
      window: agg.window,
    };
  }

  async getBillingInfo(): Promise<ProviderBillingInfo> {
    return { provider: 'anthropic', supported: false };
  }
}

