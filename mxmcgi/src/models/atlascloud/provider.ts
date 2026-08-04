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
import { throwMappedFetchError } from '../../core/utils/format-node-fetch-error';
import { mapUpstreamError } from '../../errors';
import {
  isSeedance20Upstream,
  resolveSeedanceVideoMode,
  buildSeedanceVideoRequestBody,
  normalizeSeedanceBaseUpstream,
  type SeedanceVideoMode,
} from './seedance-video';
import {
  bodyHasAtlasReferenceAssets,
  ensureAtlasReferenceUrlsInBody,
  ensureAtlasVideoReferenceUrlsInBody,
} from './upload-media';
import { normalizeAtlasVideoGenerateBody } from './video-body-normalize';
import { buildAtlasChatCompletionsBody } from './chat-body';

type AtlasCloudPredictionStatus = 'created' | 'processing' | 'completed' | 'succeeded' | 'failed' | 'timeout';

function formatAtlasPollTimeout(maxWaitMs: number): string {
  if (maxWaitMs >= 60_000) {
    const mins = Math.round(maxWaitMs / 60_000);
    return `${mins} 分钟`;
  }
  return `${Math.round(maxWaitMs / 1000)} 秒`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * GET prediction 的 JSON 可能是 { data: { ... } } 或网关再包一层 { data: { data: { ... } } }。
 * 若内层为 object，优先用内层作为业务 payload（与控制台「任务详情」字段对齐）。
 */
function resolveAtlasPredictionPayload(result: unknown): Record<string, unknown> | null {
  if (!result || typeof result !== 'object') return null;
  const r = result as Record<string, unknown>;
  const top = r.data;
  if (top && typeof top === 'object' && !Array.isArray(top)) {
    const inner = (top as Record<string, unknown>).data;
    if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
      return inner as Record<string, unknown>;
    }
    return top as Record<string, unknown>;
  }
  // 少数网关/代理可能直接返回 prediction 本体（无 data 包裹）
  if (typeof r.status === 'string' || Array.isArray(r.outputs)) {
    return r;
  }
  return null;
}

function isAtlasPredictionSucceeded(statusRaw: string): boolean {
  const s = statusRaw.trim().toLowerCase();
  return (
    s === 'completed' ||
    s === 'succeeded' ||
    s === 'success' ||
    s === 'done' ||
    s === 'complete'
  );
}

/** 从 prediction payload 解析产出 URL（string[]、{url}[]、单字段别名） */
function extractAtlasOutputUrlsFromPayload(data: Record<string, unknown> | null | undefined): string[] {
  if (!data) return [];
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v !== 'string') return;
    const t = v.trim();
    if (!t) return;
    if (t.startsWith('http://') || t.startsWith('https://') || t.startsWith('data:')) out.push(t);
  };
  const raw = data.outputs;
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === 'string') push(item);
      else if (item && typeof item === 'object') {
        const o = item as Record<string, unknown>;
        push(o.url ?? o.output_url ?? o.image_url ?? o.href ?? o.uri);
      }
    }
  }
  for (const k of ['output_url', 'outputUrl', 'image_url', 'imageUrl', 'video_url', 'videoUrl', 'result_url', 'resultUrl', 'video', 'image'] as const) {
    push(data[k]);
  }
  const more = data.output_urls ?? data.outputUrls;
  if (Array.isArray(more)) {
    for (const item of more) push(item);
  }
  return [...new Set(out)];
}

function atlasPredictionDebugSnippet(data: Record<string, unknown> | null | undefined): string {
  try {
    const s = JSON.stringify(data ?? null);
    return s.length > 900 ? `${s.slice(0, 900)}…` : s;
  } catch {
    return String(data);
  }
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
  private resolveRouteKind(
    modelKey: string,
  ): 'chat' | 'sedeo' | 'prediction_image' | 'prediction_video' | 'prediction_audio' {
    const row = getByProviderAndModelKey('atlascloud', modelKey) as any;
    const protocol = String(row?.protocol ?? '').toLowerCase();
    if (protocol) {
      if (protocol.includes('openai') || protocol.includes('chat')) return 'chat';
      if (protocol.includes('sedeo') || protocol.includes('video_task')) return 'sedeo';
      if (
        protocol.includes('generate_audio') ||
        protocol.includes('prediction_audio') ||
        protocol.includes('music') ||
        protocol.includes('chirp')
      ) {
        return 'prediction_audio';
      }
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
    const key = modelKey.toLowerCase();

    // Suno / 文生音乐：generateAudio + prediction 轮询
    if (
      scope === 'music' ||
      modality === 'music' ||
      upstream.includes('suno/') ||
      upstream.includes('chirp') ||
      key.includes('suno/') ||
      key.includes('chirp')
    ) {
      return 'prediction_audio';
    }

    // 图像模型：优先于 /gpt- 兜底判断（gpt-image-2 的 upstream 是 openai/gpt-image-2/text-to-image，会误匹配 /gpt-）
    if (scope === 'image' || modality === 'image' || upstream.includes('image') || upstream.includes('text-to-image')) {
      return 'prediction_image';
    }

    // LLM：OpenAI Chat Completions 兼容（例如 openai/gpt-oss-120b）
    if (scope === 'text' || scope === 'writing' || scope === 'default') return 'chat';
    if (modality === 'text') return 'chat';
    if (upstream.includes('openai/') || upstream.includes('/gpt-') || upstream.includes('anthropic/') || upstream.includes('google/gemini')) {
      return 'chat';
    }
    if (key.includes('claude') || key.includes('gemini') || key.includes('gpt-oss')) return 'chat';

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
    const url = `${baseUrl}${path}`;
    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...(init.headers ?? {}),
        },
      });
    } catch (e) {
      throwMappedFetchError(url, e);
    }
    const text = await res.text();
    let json: any;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }
    if (!res.ok) {
      const detail =
        typeof json === 'object' && json
          ? JSON.stringify(json).slice(0, 800)
          : String(text).slice(0, 800);
      const msg =
        (json && (json.message || json.error || json.raw)) ||
        `HTTP ${res.status}`;
      throw mapUpstreamError(
        new Error(`AtlasCloud API 请求失败: ${path} (${res.status}) ${msg} · ${detail}`)
      );
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

    const body: Record<string, any> = {
      model: upstreamModel,
      ...(inputObj ?? {}),
      ...rawParams,
      ...(prompt != null ? { prompt } : {}),
    };

    // Graph 等调用方把参考图放在 GenerateParams 顶层（与 Deer 对齐）；此前仅展开 parameters，导致 Atlas 请求体缺 image/images
    const top = params as Record<string, any>;
    const passthrough = ['image', 'images', 'image_base64s', 'image_urls', 'image_input'] as const;
    for (const k of passthrough) {
      if (top[k] != null) body[k] = top[k];
    }

    const us = String(upstreamModel || '');
    if (us.includes('/edit')) {
      if (Array.isArray(body.image) && body.image.length > 0 && typeof body.image[0] === 'string') {
        if (!Array.isArray(body.images) || body.images.length === 0) {
          body.images = [...(body.image as string[])];
        }
        body.image = (body.image as string[])[0];
      }
      if (body.image == null && Array.isArray(body.images) && body.images.length > 0) {
        body.image = body.images[0];
      }
      if (body.image == null && Array.isArray(body.image_input) && body.image_input.length > 0) {
        const first = body.image_input[0];
        if (typeof first === 'string') body.image = first;
      }
    }

    normalizeAtlasVideoGenerateBody(body, upstreamModel);

    return body;
  }

  private async generateTextViaChatCompletions(
    modelKey: string,
    params: GenerateParams
  ): Promise<GenerateResult> {
    const apiKey = await this.getApiKey();
    const upstreamModel = this.resolveUpstreamModel(modelKey);
    const baseUrl = this.getChatBaseUrl();

    // 与 OpenRouter 对齐：vision 走 messages[].content image_url parts；
    // 禁止把 parameters.image / images 原样塞进 chat/completions（Atlas 会 400）。
    const { collectOpenRouterReferenceImageUrls, buildOpenRouterImageUserMessage } = await import(
      '../openrouter/image-chat'
    );
    const refFromParams = collectOpenRouterReferenceImageUrls(params as any);
    const refFromReferenceImage: string[] = [];
    const refArr = (params as { referenceImage?: unknown }).referenceImage;
    if (Array.isArray(refArr)) {
      for (const row of refArr) {
        const c =
          row && typeof row === 'object' ? (row as { content?: string }).content : undefined;
        if (typeof c === 'string' && c.trim()) {
          const s = c.trim();
          refFromReferenceImage.push(
            s.startsWith('http') || s.startsWith('data:') ? s : `data:image/png;base64,${s}`
          );
        }
      }
    }
    // 控制 vision 张数，避免超大 body 触发网关/上游 400
    const ATLAS_CHAT_VISION_MAX = 8;
    const referenceUrls = [...new Set([...refFromParams, ...refFromReferenceImage])].slice(
      0,
      ATLAS_CHAT_VISION_MAX
    );

    const userContent = buildOpenRouterImageUserMessage(params.prompt, referenceUrls);
    // system_prompt 等须进 messages，不可顶层透传（Admin 连通性测试无 system 故能过；warp/业务会 400）
    const { body } = buildAtlasChatCompletionsBody({
      upstreamModel,
      userContent,
      parameters: (params.parameters ?? {}) as Record<string, unknown>,
    });

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
      const bodyKeys = Object.keys(body).join(',');
      throw new Error(
        `AtlasCloud LLM 请求失败: ${resp.status} ${resp.statusText} ${text}` +
          ` · model=${upstreamModel} bodyKeys=${bodyKeys}`
      );
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
        visionImageCount: referenceUrls.length,
        raw: json,
      },
      ...(content ? { text: content } : {}),
      ...(usage ? { usage } : {}),
    } as any;
  }

  /**
   * generateImage/VideoViaPrediction 已在本函数内同步轮询到终态时使用：
   * 勿再挂「二次 prediction 轮询」progress，否则 TaskExecutor 在未 await 时会提前返回空结果，
   * 而 Atlas 侧已扣费 → 自动剪辑误判「未返回视频 URL」并重试烧费。
   */
  private createCompletedPredictionProgressStream(
    payload: Record<string, unknown>,
    mediaUrls: string[]
  ): AsyncIterable<ProgressEvent> {
    return (async function* (): AsyncIterable<ProgressEvent> {
      yield {
        status: 'succeeded' as ProgressStatus,
        progress: 100,
        output: {
          ...payload,
          mediaUrls,
          outputs: Array.isArray(payload.outputs) ? payload.outputs : mediaUrls,
        },
      };
    })();
  }

  /**
   * 检测参数中是否包含图片输入（用于动态切换 text-to-image vs edit 模式）
   */
  private hasImageInput(params: GenerateParams): boolean {
    const p = (params.parameters ?? {}) as any;
    const top = params as any;
    return !!(
      p.image_input ||
      p.image_urls ||
      p.image_base64s ||
      p.image ||
      p.images ||
      top.image_input ||
      top.image_urls ||
      top.image_base64s ||
      top.image ||
      top.images
    );
  }

  /**
   * 动态切换 upstream model 的后缀：text-to-image <-> edit
   * AtlasCloud 部分模型（如 gpt-image-2、nano-banana-2）同一个物理模型支持两种模式，
   * 由是否传入图片输入决定走哪个具体 endpoint。
   */
  private resolveUpstreamModelWithEditSupport(
    modelKey: string,
    params: GenerateParams
  ): string {
    const base = this.resolveUpstreamModel(modelKey);
    if (!this.hasImageInput(params)) return base;

    // 已明确配置了 edit 协议或 upstream_model 直接包含 /edit，直接返回
    const row = getByProviderAndModelKey('atlascloud', modelKey) as any;
    const protocol = String(row?.protocol ?? '').toLowerCase();
    const upstream = String(row?.upstream_model ?? '').toLowerCase();
    if (protocol.includes('edit') || upstream.includes('/edit')) return base;

    // 动态替换后缀：/text-to-image -> /edit
    if (base.endsWith('/text-to-image')) {
      return base.replace(/\/text-to-image$/, '/edit');
    }
    // 其他未知后缀默认加 /edit
    if (!base.endsWith('/edit')) {
      return base + '/edit';
    }
    return base;
  }

  private buildSeedanceVideoBody(
    modelKey: string,
    params: GenerateParams,
  ): { body: Record<string, any>; mode: SeedanceVideoMode; upstream: string } {
    const base = this.resolveUpstreamModel(modelKey);
    const flat = this.buildGenerateBody(base, params);
    const modeInput = {
      ...flat,
      prompt: flat.prompt ?? params.prompt,
    };
    const mode = resolveSeedanceVideoMode(modeInput);
    const body = buildSeedanceVideoRequestBody(base, mode, flat) as Record<string, any>;
    const upstream = String(body.model ?? base);
    console.log(
      `[AtlasCloud] Seedance 2.0 route: modelKey=${modelKey}, mode=${mode}, upstream=${upstream}`,
    );
    return { body, mode, upstream };
  }

  private async generateImageViaPrediction(
    modelKey: string,
    params: GenerateParams
  ): Promise<GenerateResult> {
    const upstream = this.resolveUpstreamModelWithEditSupport(modelKey, params);
    const body = this.buildGenerateBody(upstream, params);
    if (bodyHasAtlasReferenceAssets(body)) {
      const apiKey = await this.getApiKey();
      await ensureAtlasReferenceUrlsInBody(body, {
        apiKey,
        baseUrl: this.getBaseUrl(),
      });
    } else if (upstream.includes('/edit')) {
      throw new Error(
        'AtlasCloud 图编辑模式缺少有效参考图（images/image）。请确认参考图已上传且非空 base64/内网地址。'
      );
    }
    console.log(
      `[AtlasCloud] generateImageViaPrediction: modelKey=${modelKey}, upstream=${upstream}, hasImage=${Boolean(body.image || body.images)}, body.keys=${Object.keys(body).join(',')}`
    );

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
    const envImageMax = Number(process.env.ATLASCLOUD_IMAGE_MAX_WAIT_MS || 45 * 60 * 1000);
    const maxWaitMs =
      maxWaitMsRaw != null
        ? Math.max(0, Number(maxWaitMsRaw))
        : Number.isFinite(envImageMax) && envImageMax > 0
          ? envImageMax
          : 45 * 60 * 1000;

    // 轮询结果（同步等到终态后再返回；progress 用一次性 completed，避免二次轮询）
    const startPollAt = Date.now();
    while (true) {
      const result = await this.atlasFetchJson<{ data: any }>(
        `/api/v1/model/prediction/${predictionId}`,
        { method: 'GET' }
      );
      const payload = resolveAtlasPredictionPayload(result);
      const status = String(payload?.status ?? 'processing') as AtlasCloudPredictionStatus;
      if (isAtlasPredictionSucceeded(status)) {
        const mediaUrls = extractAtlasOutputUrlsFromPayload(payload);
        if (mediaUrls.length === 0) {
          throw new Error(
            `AtlasCloud 图像预测已完成（status=${status}）但未解析到输出 URL；请核对 outputs 格式。payload=${atlasPredictionDebugSnippet(payload)}`
          );
        }
        const rawPayload = (payload ?? result?.data ?? {}) as Record<string, unknown>;
        return {
          mediaUrls,
          metadata: {
            model: modelKey,
            provider: this.provider,
            upstream,
            predictionId,
            raw: payload ?? result?.data,
          },
          progress:
            params.enableProgress === false
              ? undefined
              : this.createCompletedPredictionProgressStream(rawPayload, mediaUrls),
        };
      }
      if (status === 'failed' || status === 'timeout') {
        const errMsg = (payload?.error as string) || result?.data?.error || 'Generation failed';
        throw new Error(`AtlasCloud 图像生成失败: ${errMsg}`);
      }
      if (Date.now() - startPollAt >= maxWaitMs) {
        throw new Error(
          `AtlasCloud 图像生成超时（${formatAtlasPollTimeout(maxWaitMs)}）: predictionId=${predictionId}, status=${status}` +
            (status === 'processing'
              ? '。任务已创建但仍在排队/生成，可增大 max_wait_ms 或 ATLASCLOUD_IMAGE_MAX_WAIT_MS 后重试'
              : '')
        );
      }
      await sleep(pollEveryMs);
    }
  }

  private async generateVideoViaPrediction(
    modelKey: string,
    params: GenerateParams
  ): Promise<GenerateResult> {
    const baseUpstream = this.resolveUpstreamModel(modelKey);
    const useSeedance = isSeedance20Upstream(baseUpstream);
    const { body, mode, upstream } = useSeedance
      ? this.buildSeedanceVideoBody(modelKey, params)
      : {
          body: this.buildGenerateBody(baseUpstream, params),
          mode: 'text-to-video' as SeedanceVideoMode,
          upstream: baseUpstream,
        };

    normalizeAtlasVideoGenerateBody(body, upstream, { force: true });

    if (bodyHasAtlasReferenceAssets(body)) {
      const apiKey = await this.getApiKey();
      const userId =
        typeof (params.parameters as Record<string, unknown> | undefined)?.userId === 'string'
          ? String((params.parameters as Record<string, unknown>).userId)
          : typeof (params as Record<string, unknown>).userId === 'string'
            ? String((params as Record<string, unknown>).userId)
            : undefined;
      await ensureAtlasVideoReferenceUrlsInBody(body, {
        apiKey,
        baseUrl: this.getBaseUrl(),
        userId,
      });
    }

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
    const envVideoMax = Number(process.env.ATLASCLOUD_VIDEO_MAX_WAIT_MS || 45 * 60 * 1000);
    const maxWaitMs =
      maxWaitMsRaw != null
        ? Math.max(0, Number(maxWaitMsRaw))
        : Number.isFinite(envVideoMax) && envVideoMax > 0
          ? envVideoMax
          : 45 * 60 * 1000;

    const startPollAt = Date.now();
    while (true) {
      const result = await this.atlasFetchJson<{ data: any }>(
        `/api/v1/model/prediction/${predictionId}`,
        { method: 'GET' }
      );
      const payload = resolveAtlasPredictionPayload(result);
      const status = String(payload?.status ?? 'processing') as AtlasCloudPredictionStatus;
      if (isAtlasPredictionSucceeded(status)) {
        const mediaUrls = extractAtlasOutputUrlsFromPayload(payload);
        if (mediaUrls.length === 0) {
          throw new Error(
            `AtlasCloud 视频预测已完成（status=${status}）但未解析到输出 URL；请核对 outputs 格式。payload=${atlasPredictionDebugSnippet(payload)}`
          );
        }
        const usage = payload?.usage ?? {
          completion_tokens: payload?.completion_tokens,
          total_tokens: payload?.total_tokens,
        };
        const rawPayload = (payload ?? result?.data ?? {}) as Record<string, unknown>;
        return {
          mediaUrls,
          metadata: {
            model: modelKey,
            provider: this.provider,
            upstream,
            predictionId,
            ...(useSeedance ? { seedanceMode: mode } : {}),
            usage,
            raw: payload ?? result?.data,
          },
          progress:
            params.enableProgress === false
              ? undefined
              : this.createCompletedPredictionProgressStream(rawPayload, mediaUrls),
        };
      }
      if (status === 'failed' || status === 'timeout') {
        const errMsg = (payload?.error as string) || result?.data?.error || 'Generation failed';
        throw new Error(`AtlasCloud 视频生成失败: ${errMsg}`);
      }
      if (Date.now() - startPollAt >= maxWaitMs) {
        throw new Error(
          `AtlasCloud 视频生成超时（${formatAtlasPollTimeout(maxWaitMs)}）: predictionId=${predictionId}, status=${status}` +
            (status === 'processing' || status === 'created'
              ? '。任务仍在排队/生成中，可增大 max_wait_ms 或 ATLASCLOUD_VIDEO_MAX_WAIT_MS 后重试'
              : '') +
            `；payload=${atlasPredictionDebugSnippet(payload)}`
        );
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
              const payload = resolveAtlasPredictionPayload(result);
              const status = String(payload?.status ?? 'processing') as AtlasCloudPredictionStatus;
              if (isAtlasPredictionSucceeded(status)) {
                yield { status: 'succeeded' as ProgressStatus, progress: 100, output: payload ?? result?.data };
                break;
              }
              if (status === 'failed' || status === 'timeout') {
                yield {
                  status: 'failed' as ProgressStatus,
                  progress: 0,
                  error: (payload?.error as string) || result?.data?.error || 'Generation failed',
                  output: payload ?? result?.data,
                };
                break;
              }
              yield { status: 'processing', progress: 50, output: payload ?? result?.data };
            }
          })(this);

    while (true) {
      const result = await this.atlasFetchJson<{ data: any }>(
        `/api/v1/model/sedeo/tasks/${taskId}`,
        { method: 'GET' }
      );
      const payload = resolveAtlasPredictionPayload(result);
      const status = String(payload?.status ?? 'processing') as AtlasCloudPredictionStatus;
      if (isAtlasPredictionSucceeded(status)) {
        const mediaUrls = extractAtlasOutputUrlsFromPayload(payload);
        if (mediaUrls.length === 0) {
          throw new Error(
            `AtlasCloud Sedeo 任务已完成（status=${status}）但未解析到输出 URL。payload=${atlasPredictionDebugSnippet(payload)}`
          );
        }
        const usage = payload?.usage ?? {
          completion_tokens: payload?.completion_tokens,
          total_tokens: payload?.total_tokens,
        };
        return {
          mediaUrls,
          metadata: {
            model: modelKey,
            provider: this.provider,
            upstream,
            taskId,
            usage,
            raw: payload ?? result?.data,
          },
          progress,
        };
      }
      if (status === 'failed' || status === 'timeout') {
        const errMsg = (payload?.error as string) || result?.data?.error || 'Generation failed';
        throw new Error(`AtlasCloud 视频生成失败: ${errMsg}`);
      }
      await sleep(pollEveryMs);
    }
  }

  /**
   * Suno Chirp 等文生音乐：POST /api/v1/model/generateAudio → prediction 轮询
   * @see https://www.atlascloud.ai/models/suno/chirp-v4
   */
  private async generateAudioViaPrediction(
    modelKey: string,
    params: GenerateParams,
  ): Promise<GenerateResult> {
    const upstream = this.resolveUpstreamModel(modelKey);
    const body = this.buildGenerateBody(upstream, params);
    const raw = (params.parameters ?? {}) as Record<string, unknown>;
    if (body.make_instrumental == null && (raw.is_instrumental != null || raw.isInstrumental != null)) {
      body.make_instrumental = Boolean(raw.is_instrumental ?? raw.isInstrumental);
    }
    if (body.lyrics == null && typeof raw.lyrics === 'string' && raw.lyrics.trim()) {
      body.lyrics = raw.lyrics.trim();
    }

    console.log(
      `[AtlasCloud] generateAudioViaPrediction: modelKey=${modelKey}, upstream=${upstream}, body.keys=${Object.keys(body).join(',')}`,
    );

    const create = await this.atlasFetchJson<{ data: { id: string } }>('/api/v1/model/generateAudio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const predictionId = create?.data?.id ?? (create as { id?: string }).id;
    if (!predictionId) {
      throw new Error('AtlasCloud generateAudio 未返回 prediction id');
    }

    const pollEveryMs = Math.max(
      500,
      Number((params.parameters as { poll_interval_ms?: number } | undefined)?.poll_interval_ms ?? 3000),
    );
    const maxWaitMsRaw = (params.parameters as { max_wait_ms?: number } | undefined)?.max_wait_ms;
    const envMax = Number(process.env.ATLASCLOUD_AUDIO_MAX_WAIT_MS || 20 * 60 * 1000);
    const maxWaitMs =
      maxWaitMsRaw != null
        ? Math.max(0, Number(maxWaitMsRaw))
        : Number.isFinite(envMax) && envMax > 0
          ? envMax
          : 20 * 60 * 1000;

    const startPollAt = Date.now();
    while (true) {
      const result = await this.atlasFetchJson<{ data: unknown }>(
        `/api/v1/model/prediction/${predictionId}`,
        { method: 'GET' },
      );
      const payload = resolveAtlasPredictionPayload(result);
      const status = String(payload?.status ?? 'processing') as AtlasCloudPredictionStatus;
      if (isAtlasPredictionSucceeded(status)) {
        const mediaUrls = extractAtlasOutputUrlsFromPayload(payload);
        if (mediaUrls.length === 0) {
          throw new Error(
            `AtlasCloud 音乐预测已完成（status=${status}）但未解析到音频 URL。payload=${atlasPredictionDebugSnippet(payload)}`,
          );
        }
        const rawPayload = (payload ?? result?.data ?? {}) as Record<string, unknown>;
        return {
          mediaUrls,
          metadata: {
            model: modelKey,
            provider: this.provider,
            upstream,
            predictionId,
            usage: payload?.usage,
            raw: payload ?? result?.data,
          },
          progress:
            params.enableProgress === false
              ? undefined
              : this.createCompletedPredictionProgressStream(rawPayload, mediaUrls),
        };
      }
      if (status === 'failed' || status === 'timeout') {
        const errMsg =
          (payload?.error as string) ||
          (result?.data as { error?: string } | undefined)?.error ||
          'Generation failed';
        throw new Error(`AtlasCloud 音乐生成失败: ${errMsg}`);
      }
      if (Date.now() - startPollAt > maxWaitMs) {
        throw new Error(
          `AtlasCloud 音乐生成超时（>${formatAtlasPollTimeout(maxWaitMs)}），predictionId=${predictionId}`,
        );
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
      if (kind === 'prediction_audio') return await this.generateAudioViaPrediction(modelName, params);
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

