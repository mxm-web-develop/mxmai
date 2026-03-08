/**
 * Minimax Provider
 *
 * 目前只支持语音模型：
 * - minimax-speech-2.8-hd （官方 TTS）
 *
 * 其他历史的 minimax-* 能力仍通过 PPIOProvider 走 PPIO 通道。
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
import { type ModelMapping, getModelName } from '../suport-list';
import { recordStats, getProviderStats } from '../../core/providers/provider-stats';

export class MinimaxProvider implements ModelProvider {
  readonly provider: ProviderType = 'minimax';
  readonly name = 'Minimax';

  private readonly modelMap: Record<string, ModelMapping> = (() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const supportList = require('../suport-list').default;
    return {
      ...(supportList.minimax?.audio || {}),
    };
  })();

  constructor(private readonly injectApiKey?: string, private readonly injectGroupId?: string, private readonly injectBaseUrl?: string) {}

  private async getApiKey(): Promise<string> {
    const key =
      this.injectApiKey ?? (await getFirstProviderKey('minimax')) ?? process.env.MINIMAX_API_KEY;
    if (!key) {
      throw new Error('MINIMAX_API_KEY / Admin 中 provider=minimax 的 Key 未配置');
    }
    return key;
  }

  private getGroupId(): string {
    return this.injectGroupId || process.env.MINIMAX_GROUP_ID || '';
  }

  private getBaseUrl(): string {
    const base =
      this.injectBaseUrl ||
      process.env.MINIMAX_BASE_URL ||
      'https://api.minimax.chat';
    return base.replace(/\/+$/, '');
  }

  private resolveModelName(modelKey: string): string {
    const mapping = this.modelMap[modelKey];
    if (!mapping) {
      throw new Error(`Minimax provider 不支持模型: ${modelKey}`);
    }
    return getModelName(mapping);
  }

  supportsModel(modelName: string): boolean {
    return modelName in this.modelMap;
  }

  /**
   * 目前仅实现 minimax-speech-2.8-hd 的文本转语音。
   * 返回的 mediaUrls 为音频 URL 或 data URI。
   */
  async generate(modelName: string, params: GenerateParams): Promise<GenerateResult> {
    if (!this.supportsModel(modelName)) {
      throw new Error(`Minimax provider 不支持模型: ${modelName}`);
    }

    const start = Date.now();
    let success = true;
    let errorCode: string | undefined;

    try {
      const apiKey = await this.getApiKey();
      const groupId = this.getGroupId();
      const upstreamModel = this.resolveModelName(modelName); // 如 speech-2.8-hd
      const baseUrl = this.getBaseUrl();

      const url = `${baseUrl}/v1/text_to_speech`;

      const text = params.prompt || params.parameters?.text;
      if (!text) {
        throw new Error('Minimax TTS 需要提供 prompt 或 parameters.text');
      }

      const voiceId =
        params.parameters?.voice_id ||
        params.parameters?.voiceId ||
        'female-shaonv';

      const body: Record<string, any> = {
        model: upstreamModel,
        text,
        voice_id: voiceId,
        ...params.parameters,
      };

      if (groupId) {
        body.group_id = groupId;
      }

      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const textResp = await resp.text().catch(() => '');
        errorCode = `${resp.status} ${resp.statusText}`;
        throw new Error(`Minimax TTS 请求失败: ${resp.status} ${resp.statusText} ${textResp}`);
      }

      const json: any = await resp.json();

      const mediaUrls: string[] = [];
      if (json?.audio_url && typeof json.audio_url === 'string') {
        mediaUrls.push(json.audio_url);
      } else if (json?.data && typeof json.data === 'string') {
        mediaUrls.push(`data:audio/mpeg;base64,${json.data}`);
      }

      if (mediaUrls.length === 0) {
        throw new Error('Minimax TTS 返回为空或未包含音频数据');
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
      if (!errorCode && e instanceof Error) {
        errorCode = e.message;
      }
      throw e;
    } finally {
      recordStats({
        provider: 'minimax',
        logicalModel: modelName,
        success,
        latencyMs: Date.now() - start,
        errorCode,
      });
    }
  }

  async getUsageSummary(window: string): Promise<ProviderUsageSummary> {
    const list = getProviderStats({ provider: 'minimax', window });
    const agg =
      list.find((a) => a.provider === 'minimax') || {
        provider: 'minimax' as ProviderType,
        requestCount: 0,
        successCount: 0,
        errorRate: 0,
        avgLatencyMs: 0,
        window,
      };
    return {
      provider: 'minimax',
      requestCount: agg.requestCount,
      successCount: agg.successCount,
      errorRate: agg.errorRate,
      avgLatencyMs: agg.avgLatencyMs,
      window: agg.window,
    };
  }

  async getBillingInfo(): Promise<ProviderBillingInfo> {
    return { provider: 'minimax', supported: false };
  }
}

