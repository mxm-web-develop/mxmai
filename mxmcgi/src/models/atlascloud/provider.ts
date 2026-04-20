import {
  type ModelProvider,
  type ProviderType,
  type GenerateParams,
  type GenerateResult,
  type ProgressEvent,
  type ProgressStatus,
  recordStats,
  getProviderStats,
  type ProviderUsageSummary,
} from '../../core/providers';
import { getFirstProviderKey } from '../../core/providers/provider-keys';
import { getByProviderAndModelKey, isModelEnabled } from '../provider-model-catalog';
import { requireUpstreamPhysicalId } from '../physical-model-id';

type AtlasCloudPredictionStatus = 'created' | 'processing' | 'completed' | 'succeeded' | 'failed' | 'timeout';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class AtlasCloudProvider implements ModelProvider {
  readonly provider: ProviderType = 'atlascloud';
  readonly name = 'AtlasCloud';

  constructor(private readonly injectApiKey?: string, private readonly injectBaseUrl?: string) {}

  private async getApiKey(): Promise<string> {
    const key =
      this.injectApiKey ??
      (await getFirstProviderKey('atlascloud')) ??
      process.env.ATLASCLOUD_API_KEY;
    if (!key) {
      throw new Error('ATLASCLOUD_API_KEY / Admin 中 provider=atlascloud 的 Key 未配置');
    }
    return key;
  }

  private getBaseUrl(): string {
    const base =
      this.injectBaseUrl ||
      process.env.ATLASCLOUD_BASE_URL ||
      'https://api.atlascloud.ai';
    return base.replace(/\/+$/, '');
  }

  /**
   * AtlasCloud 的 LLM 接口为 OpenAI Chat Completions 兼容：/v1/chat/completions
   * 参考：https://www.atlascloud.ai/models/openai/gpt-oss-120b?tab=api
   */
  private getChatBaseUrl(): string {
    const base =
      process.env.ATLASCLOUD_CHAT_BASE_URL ||
      process.env.ATLASCLOUD_OPENAI_BASE_URL ||
      'https://api.atlascloud.ai/v1';
    return String(base).replace(/\/+$/, '');
  }

  private resolveUpstreamModel(modelKey: string): string {
    return requireUpstreamPhysicalId('atlascloud', modelKey);
  }

  /**
   * 决定该模型走哪条 AtlasCloud API。
   *
   * 强约束（推荐）：在 `provider_models.protocol` 明确声明：
   * - openai / openai_chat / chat_completions -> chat
   * - sedeo / video_task -> sedeo
   * - prediction / generate_image -> prediction_image
   * - generate_video / prediction_video -> prediction_video
   *
   * 兼容兜底：根据 scope/modality/upstream/modelKey 猜测。
   */
  private resolveRouteKind(modelKey: string): 'chat' | 'sedeo' | 'prediction_image' | 'prediction_video' {
    const row = getByProviderAndModelKey('atlascloud', modelKey) as any;
    const protocol = String(row?.protocol ?? '').toLowerCase();
    if (protocol) {
      if (protocol.includes('openai') || protocol.includes('chat')) return 'chat';
      if (protocol.includes('sedeo') || protocol.includes('video_task')) return 'sedeo';
      if (protocol.includes('generate_video') || protocol.includes('prediction_video') || protocol.includes('text-to-video')) {
        return 'prediction_video';
      }
      if (protocol.includes('prediction') || protocol.includes('generate_image') || protocol.includes('text-to-image') || protocol.includes('image')) {
        return 'prediction_image';
      }
    }

    const scope = String(row?.scope ?? '').toLowerCase();
    const modality = String(row?.modality ?? '').toLowerCase();
    const upstream = String(row?.upstream_model ?? '').toLowerCase();

    // LLM：OpenAI Chat Completions 兼容（例如 openai/gpt-oss-120b）
    if (scope === 'text' || scope === 'writing' || scope === 'default') return 'chat';
    if (modality === 'text') return 'chat';
    if (upstream.includes('openai/') || upstream.includes('/gpt-')) return 'chat';

    // 视频：AtlasCloud 大部分走 generateVideo + prediction 轮询；仅 Sedeo 系列走 tasks
    if (scope === 'video' || modality === 'video') return 'prediction_video';
    if (upstream.includes('sedeo')) return 'sedeo';
    if (modelKey.startsWith('sedeo-') || modelKey.includes('sedeo')) return 'sedeo';

    // 默认按 prediction（图像）
    return 'prediction_image';
  }

  supportsModel(modelName: string): boolean {
    return isModelEnabled('atlascloud', modelName);
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

  private async atlasFetchJson<T = any>(
    path: string,
    init: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> }
  ): Promise<T> {
    const apiKey = await this.getApiKey();
    const baseUrl = this.getBaseUrl();
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(init.headers ?? {}),
      },
    });
    const text = await res.text();
    let json: any;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }
    if (!res.ok) {
      const msg =
        (json && (json.message || json.error || json.raw)) ||
        `HTTP ${res.status}`;
      throw new Error(`AtlasCloud API 请求失败: ${path} (${res.status}) ${msg}`);
    }
    return json as T;
  }

  private sanitizeAtlasParams(raw: unknown): Record<string, any> {
    const p = raw && typeof raw === 'object' ? (raw as Record<string, any>) : {};
    // 仅用于本服务的测试/轮询控制字段，避免透传给上游导致参数校验失败
    const { max_wait_ms, poll_interval_ms, ...rest } = p;
    return rest;
  }

  /**
   * AtlasCloud 部分模型文档同时给了两种写法：
   * - 平铺字段：{ model, prompt, width, height, ... }
   * - input 包裹：{ model, input: { prompt, ... } }
   *
   * 为了兼容后续新增模型，统一在这里做归一化：
   * - 若存在 parameters.input（object），优先展开到顶层
   * - prompt 优先级：input.prompt > parameters.prompt > params.prompt
   */
  private buildGenerateBody(upstreamModel: string, params: GenerateParams): Record<string, any> {
    const rawParams = this.sanitizeAtlasParams(params.parameters);
    const inputObj =
      rawParams.input && typeof rawParams.input === 'object' && !Array.isArray(rawParams.input)
        ? this.sanitizeAtlasParams(rawParams.input)
        : null;
    if (inputObj) {
      delete rawParams.input;
    }

    const prompt =
      (inputObj && inputObj.prompt != null ? String(inputObj.prompt) : undefined) ??
      (rawParams.prompt != null ? String(rawParams.prompt) : undefined) ??
      (params.prompt != null ? String(params.prompt) : undefined);

    return {
      model: upstreamModel,
      ...(inputObj ?? {}),
      ...rawParams,
      ...(prompt != null ? { prompt } : {}),
    };
  }

  private async generateTextViaChatCompletions(
    modelKey: string,
    params: GenerateParams
  ): Promise<GenerateResult> {
    const apiKey = await this.getApiKey();
    const upstreamModel = this.resolveUpstreamModel(modelKey);
    const baseUrl = this.getChatBaseUrl();

    const rawParams = (params.parameters ?? {}) as Record<string, unknown>;
    const providedMessages = (rawParams as any).messages;
    const body: Record<string, any> = {
      model: upstreamModel,
      ...rawParams,
      messages: Array.isArray(providedMessages)
        ? providedMessages
        : [{ role: 'user', content: params.prompt }],
    };

    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`AtlasCloud LLM 请求失败: ${resp.status} ${resp.statusText} ${text}`);
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
      ...(content ? { text: content } : {}),
      ...(usage ? { usage } : {}),
    } as any;
  }

  private createPredictionProgressStream(
    predictionId: string,
    pollEveryMs: number
  ): AsyncIterable<ProgressEvent> {
    const self = this;
    return (async function* (): AsyncIterable<ProgressEvent> {
      yield { status: 'starting', progress: 5 };
      while (true) {
        await sleep(pollEveryMs);
        const result = await self.atlasFetchJson<{ data: any }>(
          `/api/v1/model/prediction/${predictionId}`,
          { method: 'GET' }
        );
        const status = String(result?.data?.status ?? 'processing') as AtlasCloudPredictionStatus;
        if (status === 'completed' || status === 'succeeded') {
          yield { status: 'succeeded' as ProgressStatus, progress: 100, output: result?.data };
          break;
        }
        if (status === 'failed' || status === 'timeout') {
          yield {
            status: 'failed' as ProgressStatus,
            progress: 0,
            error: result?.data?.error || 'Generation failed',
            output: result?.data,
          };
          break;
        }
        yield { status: 'processing', progress: 50, output: result?.data };
      }
    })();
  }

  private async generateImageViaPrediction(
    modelKey: string,
    params: GenerateParams
  ): Promise<GenerateResult> {
    const upstream = this.resolveUpstreamModel(modelKey);
    const body = this.buildGenerateBody(upstream, params);

    const create = await this.atlasFetchJson<{ data: { id: string } }>(
      '/api/v1/model/generateImage',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );

    const predictionId = create?.data?.id ?? (create as any)?.id;
    if (!predictionId) {
      throw new Error('AtlasCloud generateImage 未返回 prediction id');
    }

    const pollEveryMs = Math.max(
      500,
      Number((params.parameters as any)?.poll_interval_ms ?? 2000)
    );
    const maxWaitMsRaw = (params.parameters as any)?.max_wait_ms;
    const maxWaitMs = maxWaitMsRaw != null ? Math.max(0, Number(maxWaitMsRaw)) : null;

    const progress =
      params.enableProgress === false
        ? undefined
        : this.createPredictionProgressStream(predictionId, pollEveryMs);

    // 轮询结果
    const startPollAt = Date.now();
    while (true) {
      const result = await this.atlasFetchJson<{ data: any }>(
        `/api/v1/model/prediction/${predictionId}`,
        { method: 'GET' }
      );
      const status = String(result?.data?.status ?? 'processing') as AtlasCloudPredictionStatus;
      if (status === 'completed' || status === 'succeeded') {
        const outputs = Array.isArray(result?.data?.outputs) ? result.data.outputs : [];
        const mediaUrls = outputs.filter((u: any): u is string => typeof u === 'string' && u.length > 0);
        return {
          mediaUrls,
          metadata: {
            model: modelKey,
            provider: this.provider,
            upstream,
            predictionId,
            raw: result?.data,
          },
          progress,
        };
      }
      if (status === 'failed' || status === 'timeout') {
        const errMsg = result?.data?.error || 'Generation failed';
        throw new Error(`AtlasCloud 图像生成失败: ${errMsg}`);
      }
      if (maxWaitMs != null && Date.now() - startPollAt >= maxWaitMs) {
        // 连通性测试等场景：不必等生成完成，只要确认 prediction 可创建且可轮询即可
        return {
          mediaUrls: [],
          metadata: {
            model: modelKey,
            provider: this.provider,
            upstream,
            predictionId,
            status,
            raw: result?.data,
          },
          progress,
        };
      }
      await sleep(pollEveryMs);
    }
  }

  private async generateVideoViaPrediction(
    modelKey: string,
    params: GenerateParams
  ): Promise<GenerateResult> {
    const upstream = this.resolveUpstreamModel(modelKey);
    const body = this.buildGenerateBody(upstream, params);

    const create = await this.atlasFetchJson<{ data: { id: string } }>(
      '/api/v1/model/generateVideo',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );

    const predictionId = create?.data?.id ?? (create as any)?.id;
    if (!predictionId) {
      throw new Error('AtlasCloud generateVideo 未返回 prediction id');
    }

    const pollEveryMs = Math.max(
      500,
      Number((params.parameters as any)?.poll_interval_ms ?? 2000)
    );
    const maxWaitMsRaw = (params.parameters as any)?.max_wait_ms;
    const maxWaitMs = maxWaitMsRaw != null ? Math.max(0, Number(maxWaitMsRaw)) : null;

    const progress =
      params.enableProgress === false
        ? undefined
        : this.createPredictionProgressStream(predictionId, pollEveryMs);

    const startPollAt = Date.now();
    while (true) {
      const result = await this.atlasFetchJson<{ data: any }>(
        `/api/v1/model/prediction/${predictionId}`,
        { method: 'GET' }
      );
      const status = String(result?.data?.status ?? 'processing') as AtlasCloudPredictionStatus;
      if (status === 'completed' || status === 'succeeded') {
        const outputs = Array.isArray(result?.data?.outputs) ? result.data.outputs : [];
        const mediaUrls = outputs.filter((u: any): u is string => typeof u === 'string' && u.length > 0);
        const usage = result?.data?.usage ?? {
          completion_tokens: result?.data?.completion_tokens,
          total_tokens: result?.data?.total_tokens,
        };
        return {
          mediaUrls,
          metadata: {
            model: modelKey,
            provider: this.provider,
            upstream,
            predictionId,
            usage,
            raw: result?.data,
          },
          progress,
        };
      }
      if (status === 'failed' || status === 'timeout') {
        const errMsg = result?.data?.error || 'Generation failed';
        throw new Error(`AtlasCloud 视频生成失败: ${errMsg}`);
      }
      if (maxWaitMs != null && Date.now() - startPollAt >= maxWaitMs) {
        const usage = result?.data?.usage ?? {
          completion_tokens: result?.data?.completion_tokens,
          total_tokens: result?.data?.total_tokens,
        };
        return {
          mediaUrls: [],
          metadata: {
            model: modelKey,
            provider: this.provider,
            upstream,
            predictionId,
            usage,
            status,
            raw: result?.data,
          },
          progress,
        };
      }
      await sleep(pollEveryMs);
    }
  }

  private async generateVideoViaSedeoTask(
    modelKey: string,
    params: GenerateParams
  ): Promise<GenerateResult> {
    const upstream = this.resolveUpstreamModel(modelKey);
    const p = params.parameters ?? {};

    // 允许直接透传 content；否则用 prompt 构建 text-to-video
    const content = Array.isArray((p as any).content)
      ? (p as any).content
      : [{ type: 'text', text: params.prompt }];

    const body: Record<string, any> = {
      model: upstream,
      content,
      ...(p as any),
    };

    const create = await this.atlasFetchJson<{ data: { id: string } }>(
      '/api/v1/model/sedeo/tasks',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );

    const taskId = create?.data?.id;
    if (!taskId) {
      throw new Error('AtlasCloud Sedeo 创建任务未返回 id');
    }

    const pollEveryMs = Math.max(
      500,
      Number((params.parameters as any)?.poll_interval_ms ?? 2000)
    );

    const progress =
      params.enableProgress === false
        ? undefined
        : (async function* (self: AtlasCloudProvider): AsyncIterable<ProgressEvent> {
            yield { status: 'starting', progress: 5 };
            while (true) {
              await sleep(pollEveryMs);
              const result = await self.atlasFetchJson<{ data: any }>(
                `/api/v1/model/sedeo/tasks/${taskId}`,
                { method: 'GET' }
              );
              const status = String(result?.data?.status ?? 'processing') as AtlasCloudPredictionStatus;
              if (status === 'completed') {
                yield { status: 'succeeded' as ProgressStatus, progress: 100, output: result?.data };
                break;
              }
              if (status === 'failed' || status === 'timeout') {
                yield {
                  status: 'failed' as ProgressStatus,
                  progress: 0,
                  error: result?.data?.error || 'Generation failed',
                  output: result?.data,
                };
                break;
              }
              yield { status: 'processing', progress: 50, output: result?.data };
            }
          })(this);

    while (true) {
      const result = await this.atlasFetchJson<{ data: any }>(
        `/api/v1/model/sedeo/tasks/${taskId}`,
        { method: 'GET' }
      );
      const status = String(result?.data?.status ?? 'processing') as AtlasCloudPredictionStatus;
      if (status === 'completed') {
        const outputs = Array.isArray(result?.data?.outputs) ? result.data.outputs : [];
        const mediaUrls = outputs.filter((u: any): u is string => typeof u === 'string' && u.length > 0);
        const usage = result?.data?.usage ?? {
          completion_tokens: result?.data?.completion_tokens,
          total_tokens: result?.data?.total_tokens,
        };
        return {
          mediaUrls,
          metadata: {
            model: modelKey,
            provider: this.provider,
            upstream,
            taskId,
            usage,
            raw: result?.data,
          },
          progress,
        };
      }
      if (status === 'failed' || status === 'timeout') {
        const errMsg = result?.data?.error || 'Generation failed';
        throw new Error(`AtlasCloud 视频生成失败: ${errMsg}`);
      }
      await sleep(pollEveryMs);
    }
  }

  async generate(modelName: string, params: GenerateParams): Promise<GenerateResult> {
    if (!this.supportsModel(modelName)) {
      throw new Error(`AtlasCloud provider 不支持模型: ${modelName}`);
    }

    const start = Date.now();
    let success = true;
    let errorCode: string | undefined;
    try {
      const kind = this.resolveRouteKind(modelName);
      if (kind === 'chat') return await this.generateTextViaChatCompletions(modelName, params);
      if (kind === 'sedeo') return await this.generateVideoViaSedeoTask(modelName, params);
      if (kind === 'prediction_video') return await this.generateVideoViaPrediction(modelName, params);
      return await this.generateImageViaPrediction(modelName, params);
    } catch (e) {
      success = false;
      errorCode = 'atlascloud_error';
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

