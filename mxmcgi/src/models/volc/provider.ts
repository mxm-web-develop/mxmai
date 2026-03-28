/**
 * Volc Provider（火山引擎 / 豆包 Seedream）
 *
 * 目前只支持图像模型：
 * - seedream-4-volc （上游 Seedream-4）
 *
 * 注意：这里直接对接 Doubao / Volcengine 的图片生成接口，参数尽量与 DeerAPI 侧保持一致。
 */

import {
  type ModelProvider,
  type ProviderType,
  type GenerateParams,
  type GenerateResult,
  type ProviderUsageSummary,
  type ProviderBillingInfo,
} from '../../core/providers/types';
import { getFirstProviderKey } from '../../core/providers/provider-keys';
import { isModelEnabled } from '../provider-model-catalog';
import { requireUpstreamPhysicalId } from '../physical-model-id';
import { recordStats, getProviderStats } from '../../core/providers/provider-stats';

export class VolcProvider implements ModelProvider {
  readonly provider: ProviderType = 'volc';
  readonly name = 'Volcengine';

  constructor(private readonly injectApiKey?: string, private readonly injectBaseUrl?: string) {}

  private async getApiKey(): Promise<string> {
    const key = this.injectApiKey ?? (await getFirstProviderKey('volc')) ?? process.env.VOLC_API_KEY;
    if (!key) {
      throw new Error('VOLC_API_KEY / Admin 中 provider=volc 的 Key 未配置');
    }
    return key;
  }

  /**
   * Doubao / Volc 图像生成 base url
   * 这里使用 Ark 通用图片生成接口，实际部署时可通过 VOLC_BASE_URL 覆盖。
   */
  private getBaseUrl(): string {
    const base =
      this.injectBaseUrl ||
      process.env.VOLC_BASE_URL ||
      'https://ark.cn-beijing.volces.com/api/v3';
    return base.replace(/\/+$/, '');
  }

  private resolveModelName(modelKey: string): string {
    return requireUpstreamPhysicalId('volc', modelKey);
  }

  supportsModel(modelName: string): boolean {
    return isModelEnabled('volc', modelName);
  }

  async generate(modelName: string, params: GenerateParams): Promise<GenerateResult> {
    if (!this.supportsModel(modelName)) {
      throw new Error(`Volc provider 不支持模型: ${modelName}`);
    }

    const start = Date.now();
    let success = true;
    let errorCode: string | undefined;

    try {
      const apiKey = await this.getApiKey();
      const upstreamModel = this.resolveModelName(modelName); // 如 seedream-4
      const baseUrl = this.getBaseUrl();

      // 参考 Ark Doubao Image Generation 接口路径
      const url = `${baseUrl}/image/generation`;

      const body: Record<string, any> = {
        model: upstreamModel,
        input: {
          prompt: params.prompt,
        },
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
        throw new Error(`Volc Seedream 请求失败: ${resp.status} ${resp.statusText} ${text}`);
      }

      const json: any = await resp.json();

      const imageUrls: string[] = [];
      if (Array.isArray(json?.data)) {
        for (const item of json.data) {
          if (item?.url && typeof item.url === 'string') {
            imageUrls.push(item.url);
          } else if (item?.b64_json && typeof item.b64_json === 'string') {
            imageUrls.push(`data:image/png;base64,${item.b64_json}`);
          }
        }
      }

      if (imageUrls.length === 0) {
        throw new Error('Volc Seedream 返回为空或未包含图片 URL');
      }

      return {
        mediaUrls: imageUrls,
        metadata: {
          provider: this.provider,
          model: modelName,
          upstreamModel,
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
        provider: 'volc',
        logicalModel: modelName,
        model_key: modelName,
        success,
        latencyMs: Date.now() - start,
        errorCode,
      });
    }
  }

  async getUsageSummary(window: string): Promise<ProviderUsageSummary> {
    const list = getProviderStats({ provider: 'volc', window });
    const agg =
      list.find((a) => a.provider === 'volc') || {
        provider: 'volc' as ProviderType,
        requestCount: 0,
        successCount: 0,
        errorRate: 0,
        avgLatencyMs: 0,
        window,
      };
    return {
      provider: 'volc',
      requestCount: agg.requestCount,
      successCount: agg.successCount,
      errorRate: agg.errorRate,
      avgLatencyMs: agg.avgLatencyMs,
      window: agg.window,
    };
  }

  async getBillingInfo(): Promise<ProviderBillingInfo> {
    return { provider: 'volc', supported: false };
  }
}

