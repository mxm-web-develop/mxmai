/**
 * Google Provider（Gemini 系列）
 *
 * 只封装当前业务实际用到的文本能力：
 * - gemini-3-pro
 * - gemini-2.5-flash / gemini-2-5-flash
 *
 * 统一入口：Google Generative Language API 的 generateContent 接口。
 */

import {
  type ModelProvider,
  type ProviderType,
  type GenerateParams,
  type GenerateResult,
  type ProviderUsageSummary,
  type ProviderBillingInfo,
  getFirstProviderKey,
  recordStats,
  getProviderStats,
} from '../providers';
import { isModelEnabled } from '../provider-model-catalog';
import { requireUpstreamPhysicalId } from '../physical-model-id';

export class GoogleProvider implements ModelProvider {
  readonly provider: ProviderType = 'google';
  readonly name = 'Google Gemini';

  constructor(private readonly injectApiKey?: string, private readonly injectBaseUrl?: string) {}

  private async getApiKey(): Promise<string> {
    const key = this.injectApiKey ?? (await getFirstProviderKey('google')) ?? process.env.GOOGLE_API_KEY;
    if (!key) {
      throw new Error('GOOGLE_API_KEY / Admin 中 provider=google 的 Key 未配置');
    }
    return key;
  }

  /**
   * Gemini REST base url
   * 默认使用官方 `https://generativelanguage.googleapis.com/v1beta`
   */
  private getBaseUrl(): string {
    const base = this.injectBaseUrl || process.env.GOOGLE_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta';
    return base.replace(/\/+$/, '');
  }

  private resolveModelName(modelKey: string): string {
    return requireUpstreamPhysicalId('google', modelKey);
  }

  supportsModel(modelName: string): boolean {
    return isModelEnabled('google', modelName);
  }

  async generate(modelName: string, params: GenerateParams): Promise<GenerateResult> {
    if (!this.supportsModel(modelName)) {
      throw new Error(`Google provider 不支持模型: ${modelName}`);
    }

    const start = Date.now();
    let success = true;
    let errorCode: string | undefined;

    try {
      const apiKey = await this.getApiKey();
      const upstreamModel = this.resolveModelName(modelName);
      const baseUrl = this.getBaseUrl();

      const url = `${baseUrl}/models/${encodeURIComponent(upstreamModel)}:generateContent?key=${encodeURIComponent(
        apiKey,
      )}`;

      // 简单对接文本输入，系统提示从 parameters.system_prompt / system_instruction 读取
      const systemPrompt = params.parameters?.system_prompt || params.parameters?.system_instruction;
      const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
      if (systemPrompt) {
        contents.push({
          role: 'user',
          parts: [{ text: String(systemPrompt) }],
        });
      }
      contents.push({
        role: 'user',
        parts: [{ text: params.prompt }],
      });

      const body: Record<string, any> = {
        contents,
        ...('parameters' in params && params.parameters ? { generationConfig: { ...params.parameters } } : {}),
      };

      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        errorCode = `${resp.status} ${resp.statusText}`;
        throw new Error(`Google Gemini 请求失败: ${resp.status} ${resp.statusText} ${text}`);
      }

      const json: any = await resp.json();
      // 从 candidates[0].content.parts[*].text 汇总
      let contentText = '';
      const candidate = json?.candidates?.[0];
      const parts = candidate?.content?.parts || candidate?.content?.[0]?.parts || [];
      if (Array.isArray(parts)) {
        contentText = parts
          .map((p: any) => (typeof p?.text === 'string' ? p.text : ''))
          .filter(Boolean)
          .join('');
      }

      return {
        mediaUrls: [],
        metadata: {
          provider: this.provider,
          model: modelName,
          upstreamModel,
          text: contentText,
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
        provider: 'google',
        logicalModel: modelName,
        model_key: modelName,
        success,
        latencyMs: Date.now() - start,
        errorCode,
      });
    }
  }

  async getUsageSummary(window: string): Promise<ProviderUsageSummary> {
    const list = getProviderStats({ provider: 'google', window });
    const agg =
      list.find((a) => a.provider === 'google') || {
        provider: 'google' as ProviderType,
        requestCount: 0,
        successCount: 0,
        errorRate: 0,
        avgLatencyMs: 0,
        window,
      };
    return {
      provider: 'google',
      requestCount: agg.requestCount,
      successCount: agg.successCount,
      errorRate: agg.errorRate,
      avgLatencyMs: agg.avgLatencyMs,
      window: agg.window,
    };
  }

  async getBillingInfo(): Promise<ProviderBillingInfo> {
    // 暂不查官方账单，只标记为不支持
    return { provider: 'google', supported: false };
  }
}

