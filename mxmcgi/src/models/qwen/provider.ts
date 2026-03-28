/**
 * Qwen Provider（通义千问）
 *
 * 通过 DashScope 的 OpenAI 兼容 chat completions 接口，支持当前 deer 已用到的 Qwen3 文本模型：
 * - qwen3-235b
 * - qwen3-30b
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

export class QwenProvider implements ModelProvider {
  readonly provider: ProviderType = 'qwen';
  readonly name = 'Qwen';

  constructor(private readonly injectApiKey?: string, private readonly injectBaseUrl?: string) {}

  private async getApiKey(): Promise<string> {
    const key = this.injectApiKey ?? (await getFirstProviderKey('qwen')) ?? process.env.QWEN_API_KEY;
    if (!key) {
      throw new Error('QWEN_API_KEY / Admin 中 provider=qwen 的 Key 未配置');
    }
    return key;
  }

  /**
   * DashScope OpenAI 兼容模式 base url
   * 文档示例： https://dashscope.aliyuncs.com/compatible-mode/v1
   */
  private getBaseUrl(): string {
    const base =
      this.injectBaseUrl || process.env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    return base.replace(/\/+$/, '');
  }

  private resolveModelName(modelKey: string): string {
    return requireUpstreamPhysicalId('qwen', modelKey);
  }

  supportsModel(modelName: string): boolean {
    return isModelEnabled('qwen', modelName);
  }

  async generate(modelName: string, params: GenerateParams): Promise<GenerateResult> {
    if (!this.supportsModel(modelName)) {
      throw new Error(`Qwen provider 不支持模型: ${modelName}`);
    }

    const start = Date.now();
    let success = true;
    let errorCode: string | undefined;

    try {
      const apiKey = await this.getApiKey();
      const upstreamModel = this.resolveModelName(modelName);
      const baseUrl = this.getBaseUrl();

      const url = `${baseUrl}/chat/completions`;

      const systemPrompt = params.parameters?.system_prompt || params.parameters?.system_instruction;
      const messages: Array<{ role: string; content: string }> = [];
      if (systemPrompt) {
        messages.push({ role: 'system', content: String(systemPrompt) });
      }
      messages.push({ role: 'user', content: params.prompt });

      const body: Record<string, any> = {
        model: upstreamModel,
        messages,
        ...(params.parameters || {}),
      };

      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        errorCode = `${resp.status} ${resp.statusText}`;
        throw new Error(`Qwen 请求失败: ${resp.status} ${resp.statusText} ${text}`);
      }

      const json: any = await resp.json();
      const content: string =
        json?.choices?.[0]?.message?.content ??
        (typeof json?.choices?.[0]?.message?.content === 'string' ? json.choices[0].message.content : '');

      const usage = json.usage
        ? {
            prompt_tokens: json.usage.prompt_tokens,
            completion_tokens: json.usage.completion_tokens,
            total_tokens: json.usage.total_tokens,
          }
        : undefined;

      return {
        mediaUrls: [],
        metadata: {
          provider: this.provider,
          model: modelName,
          upstreamModel,
          text: content,
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
        provider: 'qwen',
        logicalModel: modelName,
        model_key: modelName,
        success,
        latencyMs: Date.now() - start,
        errorCode,
      });
    }
  }

  async getUsageSummary(window: string): Promise<ProviderUsageSummary> {
    const list = getProviderStats({ provider: 'qwen', window });
    const agg =
      list.find((a) => a.provider === 'qwen') || {
        provider: 'qwen' as ProviderType,
        requestCount: 0,
        successCount: 0,
        errorRate: 0,
        avgLatencyMs: 0,
        window,
      };
    return {
      provider: 'qwen',
      requestCount: agg.requestCount,
      successCount: agg.successCount,
      errorRate: agg.errorRate,
      avgLatencyMs: agg.avgLatencyMs,
      window: agg.window,
    };
  }

  async getBillingInfo(): Promise<ProviderBillingInfo> {
    return { provider: 'qwen', supported: false };
  }
}

