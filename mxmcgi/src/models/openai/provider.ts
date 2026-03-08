/**
 * OpenAI Provider
 *
 * 只封装当前业务实际用到的 Chat/文本写作能力：
 * - gpt-5-nano
 * - gpt-5-2
 *
 * 统一入口：openai Chat Completions API（或兼容的 /v1/chat/completions）。
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
import { recordStats, getProviderStats } from '../../core/providers/provider-stats';
import { type ModelMapping, getModelName } from '../suport-list';
import { fetch as undiciFetch, ProxyAgent } from 'undici';

export class OpenAIProvider implements ModelProvider {
  readonly provider: ProviderType = 'openai';
  readonly name = 'OpenAI';

  // 仅收录 suport-list.openai 下的 text 模型
  private readonly modelMap: Record<string, ModelMapping> = (() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const supportList = require('../suport-list').default;
    return {
      ...(supportList.openai?.text || {}),
    };
  })();

  constructor(private readonly injectApiKey?: string, private readonly injectBaseUrl?: string) {}

  private async getApiKey(): Promise<string> {
    const key = this.injectApiKey ?? (await getFirstProviderKey('openai')) ?? process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error('OPENAI_API_KEY / Admin 中 provider=openai 的 Key 未配置');
    }
    return key;
  }

  private getBaseUrl(): string {
    const base = this.injectBaseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    return base.replace(/\/+$/, '');
  }

  /**
   * 获取用于 OpenAI 请求的 dispatcher（Clash 代理开关）
   * - 若存在 CLASHPROXY，则优先使用（例如 http://127.0.0.1:7890）
   * - 否则回退到 HTTPS_PROXY / HTTP_PROXY
   * - 都不存在时返回 undefined（直连）
   */
  private getDispatcher() {
    const clashProxy = process.env.CLASHPROXY;
    const envProxy = clashProxy || process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
    if (!envProxy) return undefined;
    try {
      return new ProxyAgent(envProxy);
    } catch (e) {
      console.warn('[OpenAIProvider] 创建 ProxyAgent 失败，将尝试直连:', e);
      return undefined;
    }
  }

  private resolveModelName(modelKey: string): string {
    const mapping = this.modelMap[modelKey];
    if (!mapping) {
      throw new Error(`OpenAI provider 不支持模型: ${modelKey}`);
    }
    return getModelName(mapping);
  }

  supportsModel(modelName: string): boolean {
    return modelName in this.modelMap;
  }

  async generate(modelName: string, params: GenerateParams): Promise<GenerateResult> {
    if (!this.supportsModel(modelName)) {
      throw new Error(`OpenAI provider 不支持模型: ${modelName}`);
    }

    const start = Date.now();
    let success = true;
    let errorCode: string | undefined;

    try {
      const apiKey = await this.getApiKey();
      const upstreamModel = this.resolveModelName(modelName);
      const baseUrl = this.getBaseUrl();
      const dispatcher = this.getDispatcher();

      const body: Record<string, any> = {
        model: upstreamModel,
        messages: [
          {
            role: 'user',
            content: params.prompt,
          },
        ],
        ...(params.parameters || {}),
      };

      // 调试日志（避免输出完整 prompt）
      const promptPreview =
        typeof params.prompt === 'string' ? params.prompt.slice(0, 80) : '[非字符串 prompt]';
      console.log('[OpenAIProvider] 准备请求 OpenAI Chat Completions:', {
        logicalModel: modelName,
        upstreamModel,
        baseUrl,
        hasDispatcher: !!dispatcher,
        promptPreview,
      });

      // 目前先统一走非流式返回；后续若有需要，可根据 params.outputFormat === 'stream' 增加流式实现
      const resp = await undiciFetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        ...(dispatcher ? { dispatcher } : {}),
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        console.error('[OpenAIProvider] OpenAI 请求失败', {
          status: resp.status,
          statusText: resp.statusText,
          body: text?.slice(0, 500),
        });
        errorCode = `${resp.status} ${resp.statusText}`;
        throw new Error(`OpenAI 请求失败: ${resp.status} ${resp.statusText} ${text}`);
      }

      const json: any = await resp.json();
      const content: string =
        json?.choices?.[0]?.message?.content ??
        (typeof json?.choices?.[0]?.message?.content === 'string'
          ? json.choices[0].message.content
          : '');

      const usage = {
        prompt_tokens: json?.usage?.prompt_tokens || 0,
        completion_tokens: json?.usage?.completion_tokens || 0,
        total_tokens: json?.usage?.total_tokens || 0,
      };

      console.log('[OpenAIProvider] OpenAI 请求成功，返回结构概要:', {
        logicalModel: modelName,
        upstreamModel,
        hasChoices: Array.isArray(json?.choices),
        firstChoiceType: json?.choices?.[0]?.message?.role,
        firstContentPreview:
          typeof content === 'string' ? content.slice(0, 80) : '[非字符串内容]',
      });

      return {
        mediaUrls: content ? [content] : [],
        metadata: {
          provider: this.provider,
          model: modelName,
          upstreamModel,
          text: content,
          usage,
          raw: json,
        },
        ...(content ? { text: content } : {}),
        ...(usage ? { usage } : {}),
      } as any;
    } catch (e) {
      success = false;
      if (!errorCode && e instanceof Error) {
        errorCode = e.message;
      }
      // 网络层 / SDK 层异常（如 fetch failed），这里补充详细日志，便于排查
      console.error('[OpenAIProvider] 调用 OpenAI 出错', {
        logicalModel: modelName,
        upstreamModel: (() => {
          try {
            return this.resolveModelName(modelName);
          } catch {
            return 'unknown';
          }
        })(),
        baseUrl: this.getBaseUrl(),
        message: e instanceof Error ? e.message : String(e),
        name: e instanceof Error ? e.name : undefined,
        stack: e instanceof Error ? e.stack : undefined,
        // Node fetch 通常会把底层错误挂在 cause 上（包含 ECONNREFUSED / ETIMEDOUT 等信息）
        cause:
          e && typeof e === 'object' && 'cause' in e
            ? (e as any).cause
            : undefined,
      });
      throw e;
    } finally {
      // 记录基础统计信息，便于 Admin 监控
      recordStats({
        provider: 'openai',
        logicalModel: modelName,
        success,
        latencyMs: Date.now() - start,
        errorCode,
      });
    }
  }

  async getUsageSummary(window: string): Promise<ProviderUsageSummary> {
    const list = getProviderStats({ provider: 'openai', window });
    const agg =
      list.find((a) => a.provider === 'openai') || {
        provider: 'openai' as ProviderType,
        requestCount: 0,
        successCount: 0,
        errorRate: 0,
        avgLatencyMs: 0,
        window,
      };
    return {
      provider: 'openai',
      requestCount: agg.requestCount,
      successCount: agg.successCount,
      errorRate: agg.errorRate,
      avgLatencyMs: agg.avgLatencyMs,
      window: agg.window,
    };
  }

  async getBillingInfo(): Promise<ProviderBillingInfo> {
    // 暂不直接查官方用量，只标记为不支持；后续如需可接 dashboard / usage API
    return { provider: 'openai', supported: false };
  }
}

