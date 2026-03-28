/**
 * OpenAI Provider
 *
 * 只封装当前业务实际用到的 Chat/文本写作能力：
 * - gpt-5-nano
 * - gpt-5-2
 *
 * 统一入口：openai Chat Completions API（或兼容的 /v1/chat/completions）。
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
import { fetch as undiciFetch, ProxyAgent } from 'undici';

export class OpenAIProvider implements ModelProvider {
  readonly provider: ProviderType = 'openai';
  readonly name = 'OpenAI';

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
   * 获取用于 OpenAI 请求的 dispatcher
   *
   * 需求：
   * - 线上部署在国外机房，不需要翻墙，应该「直连」OpenAI
   * - 本地开发在中国大陆，需要通过 Clash 等本地代理访问 OpenAI
   *
   * 方案：
   * - 默认「不使用」 ProxyAgent（即不走本地 HTTP 代理，保持直连行为，适合线上环境）
   * - 只有在显式设置 OPENAI_USE_PROXY_AGENT=1 时，才启用 ProxyAgent，
   *   并优先使用 CLASHPROXY，其次 HTTPS_PROXY / HTTP_PROXY
   *
   * 这样：
   * - 线上环境只要不配置 OPENAI_USE_PROXY_AGENT，就永远直连，不受本机代理配置影响
   * - 本地开发只需在环境里加一行 OPENAI_USE_PROXY_AGENT=1，就可以复用 Clash 代理
   */
  private getDispatcher() {
    // 开关：只有本地开发时才会显式打开
    if (process.env.OPENAI_USE_PROXY_AGENT !== '1') {
      return undefined;
    }

    const clashProxy = process.env.CLASHPROXY;
    const envProxy = clashProxy || process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
    if (!envProxy) return undefined;

    try {
      console.log('[OpenAIProvider] 使用 ProxyAgent 代理 OpenAI 请求:', { envProxy });
      return new ProxyAgent(envProxy);
    } catch (e) {
      console.warn('[OpenAIProvider] 创建 ProxyAgent 失败，将尝试直连:', e);
      return undefined;
    }
  }

  private resolveModelName(modelKey: string): string {
    return requireUpstreamPhysicalId('openai', modelKey);
  }

  supportsModel(modelName: string): boolean {
    return isModelEnabled('openai', modelName);
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

      // 组装更详细的错误信息（便于在 Task 列表中直观看到原因）
      let detailedMessage = e instanceof Error ? e.message : String(e);
      const baseUrl = this.getBaseUrl();
      const proxy =
        process.env.CLASHPROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || 'direct';

      // 从 undici 的 cause 中提取底层网络错误（如 ECONNRESET / ECONNREFUSED）
      const cause =
        e && typeof e === 'object' && 'cause' in e ? ((e as any).cause as any) : undefined;
      const causeParts: string[] = [];
      if (cause && typeof cause === 'object') {
        if (cause.code) causeParts.push(`code=${cause.code}`);
        if (cause.errno && cause.errno !== cause.code) causeParts.push(`errno=${cause.errno}`);
        if (cause.address) {
          const port = cause.port ? `:${cause.port}` : '';
          causeParts.push(`addr=${cause.address}${port}`);
        }
      }

      if (e instanceof Error && e.message.includes('fetch failed')) {
        detailedMessage = `fetch failed: ${causeParts.join(', ') || 'unknown network error'}, baseUrl=${baseUrl}, proxy=${proxy}`;
      }

      if (!errorCode) {
        errorCode = detailedMessage;
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
        baseUrl,
        proxy,
        message: e instanceof Error ? e.message : String(e),
        detailedMessage,
        name: e instanceof Error ? e.name : undefined,
        stack: e instanceof Error ? e.stack : undefined,
        // Node fetch 通常会把底层错误挂在 cause 上（包含 ECONNREFUSED / ETIMEDOUT 等信息）
        cause,
      });

      // 抛出带有详细信息的新错误，让任务系统将其写入 task 错误字段
      throw new Error(detailedMessage);
    } finally {
      // 记录基础统计信息，便于 Admin 监控
      recordStats({
        provider: 'openai',
        logicalModel: modelName,
        model_key: modelName,
        success,
        latencyMs: Date.now() - start,
        errorCode,
      });
    }
  }

  async getUsageSummary(window: string): Promise<ProviderUsageSummary> {
    const list = await getProviderStats({ provider: 'openai', window });
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

