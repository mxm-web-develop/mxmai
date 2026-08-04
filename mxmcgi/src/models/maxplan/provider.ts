/**
 * Maxplan Provider - MiniMax TokenPlan 包月订阅（国内 api.minimaxi.com）
 *
 * 模态由 Admin「物理模型」provider_models 决定，便于后期换模型：
 * - scope=graph / modality=image  → POST /v1/image_generation
 * - scope=audio / modality=audio → POST /v1/t2a_v2（可用 protocol=text_to_speech 走旧接口）
 * - scope=music / protocol=music_generation → POST /v1/music_generation
 * - scope=writing|text|default 等 → POST /v1/text/chatcompletion_v2
 *
 * API Key 仅来自 Admin provider=maxplan 的 Key（getFirstProviderKey），不走模型级环境变量。
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
import {
  getByProviderAndModelKey,
  getUpstreamModel,
  isModelEnabled,
} from '../provider-model-catalog';
import { requireUpstreamPhysicalId } from '../physical-model-id';
import type { ProviderModel } from '@mxmai/mxmdata';
import { resolveTtsInputText, resolveTtsSubtitleApiParams } from '../../tasks/audio-tts-params';
import {
  ProviderContentPolicyError,
  extractHitWordsFromUpstreamJson,
} from '../../tasks/provider-content-policy';
import { Agent, fetch as undiciFetch } from 'undici';
import { throwMappedFetchError } from '../../core/utils/format-node-fetch-error';
import { mapUpstreamError } from '../../errors';

type MaxplanModality = 'text' | 'image' | 'audio' | 'music';

function assertTtsUsageReasonable(text: string, extra: Record<string, unknown> | undefined): void {
  const usage = extra?.usage_characters;
  if (typeof usage !== 'number' || !Number.isFinite(usage)) return;
  const inputLen = text.length;
  if (inputLen < 200) return;
  if (usage < inputLen * 0.35) {
    throw new Error(
      `Maxplan TTS 合成用量异常偏少（input≈${inputLen} 字，usage_characters=${usage}），疑似执行参数被截断`
    );
  }
}

/** MiniMax input_sensitive_type / output_sensitive_type（官方枚举，不含具体命中词） */
const MINIMAX_SENSITIVE_TYPE_LABEL: Record<number, string> = {
  1: '严重违规',
  2: '色情',
  3: '广告',
  4: '违禁',
  5: '谩骂',
  6: '暴恐',
  7: '其他',
};

function formatMiniMaxSensitiveHint(json: Record<string, unknown>): string {
  const parts: string[] = [];
  const inSens = json.input_sensitive === true;
  const outSens = json.output_sensitive === true;
  const inType = Number(json.input_sensitive_type);
  const outType = Number(json.output_sensitive_type);
  if (inSens || (Number.isFinite(inType) && inType > 0)) {
    const label = MINIMAX_SENSITIVE_TYPE_LABEL[inType] ?? (inType > 0 ? `类型${inType}` : '未分类');
    parts.push(`输入涉敏·${label}`);
  }
  if (outSens || (Number.isFinite(outType) && outType > 0)) {
    const label = MINIMAX_SENSITIVE_TYPE_LABEL[outType] ?? (outType > 0 ? `类型${outType}` : '未分类');
    parts.push(`输出涉敏·${label}`);
  }
  const hitWords = extractHitWordsFromUpstreamJson(json);
  if (hitWords.length > 0) {
    parts.push(`命中：${hitWords.slice(0, 8).join('、')}`);
  }
  if (parts.length === 0) return '';
  if (hitWords.length === 0) {
    return `${parts.join('；')}（上游不返回具体敏感词，仅类型）`;
  }
  return parts.join('；');
}

export function formatMiniMaxBusinessError(json: Record<string, unknown>, label: string): string {
  const base = json.base_resp as { status_code?: number; status_msg?: string } | undefined;
  const code = base?.status_code != null ? Number(base.status_code) : undefined;
  const msg = String(base?.status_msg ?? '').trim();
  const hint = formatMiniMaxSensitiveHint(json);
  const head = `Maxplan ${label} 业务失败: status_code=${code ?? '?'}${msg ? ` ${msg}` : ''}`.trim();
  if (!hint) return head;
  return `${head} · ${hint}`;
}

function assertMiniMaxBaseResp(json: Record<string, unknown>, label: string): void {
  const base = json.base_resp as { status_code?: number; status_msg?: string } | undefined;
  if (base?.status_code != null && Number(base.status_code) !== 0) {
    const code = Number(base.status_code);
    const message = formatMiniMaxBusinessError(json, label);
    // 1026/1027：结构化抛出，便于管道按命中词清洗重试
    if (code === 1026 || code === 1027) {
      throw new ProviderContentPolicyError(message, {
        hitWords: extractHitWordsFromUpstreamJson(json),
        statusCode: code,
        sensitiveType:
          Number(json.input_sensitive_type) ||
          Number(json.output_sensitive_type) ||
          undefined,
        upstreamJson: json,
      });
    }
    throw new Error(message);
  }
}

/** 从 chatcompletion_v2 message 提取可用正文（剥离 M 系列 thinking 标签） */
export function extractMaxplanChatText(message: Record<string, unknown> | undefined): string {
  if (!message) return '';
  const parts: string[] = [];
  const content = message.content;
  if (typeof content === 'string' && content.trim()) {
    parts.push(content);
  } else if (Array.isArray(content)) {
    for (const block of content) {
      if (typeof block === 'string' && block.trim()) parts.push(block);
      else if (block && typeof block === 'object' && typeof (block as { text?: string }).text === 'string') {
        parts.push((block as { text: string }).text);
      }
    }
  }
  let text = parts.join('\n').trim();
  // M2/M3 thinking 块：剥离后只保留块外正文
  text = text
    .replace(/[\s\S]*?<\/think>/gi, '')
    .replace(/[\s\S]*?<\/redacted_thinking>/gi, '')
    .trim();
  // reasoning_content / thinking 仅过程，禁止当正文、禁止落库回退
  return text;
}

/** 从上游 raw 去掉思维链字段，避免写入任务 metadata / MinIO */
export function stripReasoningFromUpstreamRaw(json: unknown): unknown {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return json;
  try {
    const cloned = JSON.parse(JSON.stringify(json)) as Record<string, unknown>;
    const choices = cloned.choices;
    if (Array.isArray(choices)) {
      for (const ch of choices) {
        if (!ch || typeof ch !== 'object') continue;
        const msg = (ch as { message?: Record<string, unknown> }).message;
        if (!msg || typeof msg !== 'object') continue;
        delete msg.reasoning_content;
        delete msg.reasoning_details;
        delete msg.thinking;
        if (typeof msg.content === 'string') {
          msg.content = extractMaxplanChatText(msg);
        }
      }
    }
    return cloned;
  } catch {
    return json;
  }
}

function isThinkingDisabled(params: Record<string, unknown>): boolean {
  const t = params.thinking;
  if (t && typeof t === 'object' && !Array.isArray(t)) {
    return String((t as { type?: unknown }).type ?? '').toLowerCase() === 'disabled';
  }
  return false;
}

function hexToDataUri(hex: string, mime = 'audio/mpeg'): string {
  const clean = hex.replace(/\s/g, '');
  const buf = Buffer.from(clean, 'hex');
  return `data:${mime};base64,${buf.toString('base64')}`;
}

function mimeFromAudioFormat(format: unknown): string {
  const f = String(format ?? 'mp3').toLowerCase();
  if (f === 'wav') return 'audio/wav';
  if (f === 'pcm') return 'audio/pcm';
  if (f === 'flac') return 'audio/flac';
  return 'audio/mpeg';
}

export class MaxplanProvider implements ModelProvider {
  readonly provider: ProviderType = 'maxplan';
  readonly name = 'Maxplan';

  constructor(private readonly injectApiKey?: string, private readonly injectBaseUrl?: string) {}

  private async getApiKey(): Promise<string> {
    const key = this.injectApiKey ?? (await getFirstProviderKey('maxplan'));
    if (!key?.trim()) {
      throw new Error('Admin 中 provider=maxplan 的 API Key 未配置');
    }
    return key.trim();
  }

  private getBaseUrl(): string {
    const base = this.injectBaseUrl || 'https://api.minimaxi.com';
    return String(base).replace(/\/+$/, '');
  }

  private getCatalogRow(modelKey: string): ProviderModel | null {
    return getByProviderAndModelKey('maxplan', modelKey);
  }

  private resolveUpstreamModel(modelKey: string): string {
    return requireUpstreamPhysicalId('maxplan', modelKey);
  }

  /** 由 DB provider_models 的 scope / modality / protocol 决定调用哪条上游 API */
  private resolveModality(modelKey: string): MaxplanModality {
    const row = this.getCatalogRow(modelKey);
    if (row) {
      const protocol = String(row.protocol ?? '').toLowerCase();
      if (protocol === 'image_generation' || protocol === 'image') return 'image';
      if (protocol === 'music_generation' || protocol === 'music') return 'music';
      if (protocol === 't2a_v2' || protocol === 'text_to_speech' || protocol === 'tts') {
        return 'audio';
      }
      if (protocol === 'chatcompletion_v2' || protocol === 'chat') return 'text';

      const modality = String(row.modality ?? '').toLowerCase();
      const scope = String(row.scope ?? '').toLowerCase();
      if (modality === 'image' || scope === 'graph') return 'image';
      if (modality === 'music' || scope === 'music') return 'music';
      if (modality === 'audio' || scope === 'audio') return 'audio';
      if (
        modality === 'text' ||
        ['writing', 'text', 'default', 'outline'].includes(scope)
      ) {
        return 'text';
      }
    }

    const upstream = getUpstreamModel('maxplan', modelKey) ?? modelKey;
    if (/^music-/i.test(upstream) || /^music-/i.test(modelKey)) return 'music';
    if (/^speech-/i.test(upstream) || /speech|tts|t2a/i.test(modelKey)) return 'audio';
    if (/^image-/i.test(upstream) || /image/i.test(modelKey)) return 'image';
    return 'text';
  }

  private resolveAudioProtocol(modelKey: string): 't2a_v2' | 'text_to_speech' {
    const row = this.getCatalogRow(modelKey);
    const protocol = String(row?.protocol ?? '').toLowerCase();
    if (protocol === 'text_to_speech' || protocol === 'tts') return 'text_to_speech';
    return 't2a_v2';
  }

  private mergeDefaultParameters(
    modelKey: string,
    raw: Record<string, unknown>,
  ): Record<string, unknown> {
    const defaults = {
      ...((this.getCatalogRow(modelKey)?.default_parameters ?? {}) as Record<string, unknown>),
    };
    // thinking / reasoning_split 须由业务 generateParams.parameters 显性传入，勿从 catalog 隐式继承
    delete defaults.thinking;
    delete defaults.reasoning_split;
    return { ...defaults, ...raw };
  }

  /**
   * M3：同步 max_completion_tokens。
   * thinking 须由业务 generateParams.parameters（或调用方）显性传入，此处不偷偷默认。
   * 若已开 thinking 且未设 reasoning_split，则补 true，防思考混进 content；思维链永不作为成稿。
   */
  private normalizeTextRequestParams(
    upstreamModel: string,
    raw: Record<string, unknown>,
  ): Record<string, unknown> {
    if (!/MiniMax-M3/i.test(upstreamModel)) return raw;
    const out = { ...raw };
    const maxOut =
      typeof out.max_completion_tokens === 'number'
        ? out.max_completion_tokens
        : typeof out.max_tokens === 'number'
          ? out.max_tokens
          : undefined;
    if (maxOut != null && maxOut > 0) {
      out.max_completion_tokens = maxOut;
    }
    if (out.thinking !== undefined && out.reasoning_split === undefined) {
      out.reasoning_split = true;
    }
    return out;
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
    return {
      provider: 'maxplan',
      supported: false,
      billingMode: 'subscription',
      billingNote: 'OAuth 包月，不参与按量余额扣费',
    };
  }

  private async postJson(
    path: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const apiKey = await this.getApiKey();
    const baseUrl = this.getBaseUrl();
    const url = `${baseUrl}${path}`;
    const timeoutMs = Number(process.env.MAXPLAN_FETCH_TIMEOUT_MS || 900_000);
    // 529 overloaded 常见：默认多试几次；可用 MAXPLAN_FETCH_RETRIES 覆盖
    const maxAttempts = Math.max(1, Number(process.env.MAXPLAN_FETCH_RETRIES || 4));

    let lastErr: unknown;
    const agent = new Agent({
      headersTimeout: timeoutMs,
      bodyTimeout: timeoutMs,
      connectTimeout: 60_000,
    });
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const resp = await undiciFetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
          dispatcher: agent,
        });
        return await this.parseMaxplanJsonResponse(resp, path);
      } catch (err) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        const retriable =
          msg.includes('fetch failed') ||
          msg.includes('ECONNRESET') ||
          msg.includes('ETIMEDOUT') ||
          msg.includes('HEADERS_TIMEOUT') ||
          msg.includes('UND_ERR_HEADERS_TIMEOUT') ||
          msg.includes('AbortError') ||
          msg.includes('timeout') ||
          /\b529\b/.test(msg) ||
          /overloaded_error|负载较高|系统繁忙|服务集群负载/i.test(msg) ||
          /\b502\b|\b503\b|\b504\b/.test(msg);
        if (!retriable || attempt >= maxAttempts) {
          throwMappedFetchError(url, err);
        }
        const backoffMs = Math.min(12_000, 1500 * attempt * attempt);
        console.warn(
          `[Maxplan] 可重试错误 attempt=${attempt}/${maxAttempts} backoff=${backoffMs}ms path=${path}: ${msg.slice(0, 180)}`
        );
        await new Promise((r) => setTimeout(r, backoffMs));
      }
    }
    throwMappedFetchError(url, lastErr);
  }

  private async parseMaxplanJsonResponse(
    resp: Response,
    path: string
  ): Promise<Record<string, unknown>> {
    const text = await resp.text().catch(() => '');
    let json: Record<string, unknown> = {};
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      if (!resp.ok) {
        throw mapUpstreamError(
          new Error(`Maxplan API 请求失败: ${resp.status} ${resp.statusText} ${text}`)
        );
      }
      throw mapUpstreamError(new Error(`Maxplan API 返回非 JSON: ${text.slice(0, 500)}`));
    }

    if (!resp.ok) {
      throw mapUpstreamError(
        new Error(`Maxplan API 请求失败: ${resp.status} ${resp.statusText} ${text}`)
      );
    }
    return json;
  }

  /**
   * 文本 - Chat Completion v2
   * POST /v1/text/chatcompletion_v2
   * MiniMax-M3：官方原生多模态，支持 messages[].content 里的 image_url / video_url parts
   * @see https://platform.minimax.io/docs/api-reference/text-openai-api
   */
  private async generateText(modelKey: string, params: GenerateParams): Promise<GenerateResult> {
    const upstreamModel = this.resolveUpstreamModel(modelKey);
    const rawParams = this.normalizeTextRequestParams(
      upstreamModel,
      this.mergeDefaultParameters(modelKey, (params.parameters ?? {}) as Record<string, unknown>),
    );
    const providedMessages = (rawParams as { messages?: unknown }).messages;

    // 与 atlascloud / openrouter 对齐：vision 走 content image_url parts，不把图塞进顶层非法字段
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
            s.startsWith('http') || s.startsWith('data:') ? s : `data:image/png;base64,${s}`,
          );
        }
      }
    }
    const MAXPLAN_CHAT_VISION_MAX = 8;
    const referenceUrls = [...new Set([...refFromParams, ...refFromReferenceImage])].slice(
      0,
      MAXPLAN_CHAT_VISION_MAX,
    );

    const cleanedParams = { ...rawParams } as Record<string, unknown>;
    for (const k of [
      'image',
      'images',
      'image_base64s',
      'image_urls',
      'image_input',
      'messages',
      'referenceImage',
      'referenceImages',
    ]) {
      delete cleanedParams[k];
    }

    let messages: unknown;
    if (Array.isArray(providedMessages)) {
      messages = providedMessages;
    } else {
      const content = buildOpenRouterImageUserMessage(params.prompt, referenceUrls);
      messages = [{ role: 'user', content }];
    }

    const body: Record<string, unknown> = {
      ...cleanedParams,
      model: upstreamModel,
      messages,
    };

    const { MANUSCRIPT_CONTINUE_USER_PROMPT } = await import('../../tasks/llm-budget-policy');
    type Attempt = {
      phase: 'initial' | 'disable_thinking_retry' | 'continue';
      finish_reason?: string | null;
      completion_tokens?: number;
      had_reasoning: boolean;
      content_chars: number;
    };
    const attempts: Attempt[] = [];
    let thinkingDisabledRetry = false;
    let continued = false;

    const runOnce = async (reqBody: Record<string, unknown>, phase: Attempt['phase']) => {
      const json = await this.postJson('/v1/text/chatcompletion_v2', reqBody);
      assertMiniMaxBaseResp(json, '文本');
      const choices = json.choices as
        | Array<{ message?: Record<string, unknown>; finish_reason?: string }>
        | undefined;
      const choice = choices?.[0];
      const message = choice?.message;
      const content = extractMaxplanChatText(message);
      const usageRaw = json.usage as
        | { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
        | undefined;
      const hadReasoning =
        typeof message?.reasoning_content === 'string' &&
        String(message.reasoning_content).trim().length > 0;
      attempts.push({
        phase,
        finish_reason: choice?.finish_reason ?? null,
        completion_tokens: Number(usageRaw?.completion_tokens ?? 0) || undefined,
        had_reasoning: hadReasoning,
        content_chars: content.length,
      });
      return { json, choice, message, content, usageRaw, hadReasoning };
    };

    let { json, choice, message, content, usageRaw, hadReasoning } = await runOnce(
      body,
      'initial'
    );

    // ① 关思考重试：空正文 +（length 或仅有 reasoning）
    if (
      !content.trim() &&
      !isThinkingDisabled(cleanedParams) &&
      (choice?.finish_reason === 'length' || hadReasoning)
    ) {
      thinkingDisabledRetry = true;
      ({ json, choice, message, content, usageRaw, hadReasoning } = await runOnce(
        {
          ...body,
          thinking: { type: 'disabled' },
          reasoning_split: true,
        },
        'disable_thinking_retry'
      ));
    }

    // ② continue：仍 length 且已有部分正文（或关思考后仍 length 且有正文）
    if (choice?.finish_reason === 'length' && content.trim()) {
      const baseMessages = Array.isArray(body.messages) ? [...(body.messages as unknown[])] : [];
      const continueBody: Record<string, unknown> = {
        ...body,
        thinking: { type: 'disabled' },
        reasoning_split: true,
        messages: [
          ...baseMessages,
          { role: 'assistant', content },
          { role: 'user', content: MANUSCRIPT_CONTINUE_USER_PROMPT },
        ],
      };
      const cont = await runOnce(continueBody, 'continue');
      if (cont.content.trim()) {
        continued = true;
        content = `${content.trim()}\n${cont.content.trim()}`.trim();
        json = cont.json;
        choice = cont.choice;
        message = cont.message;
        usageRaw = {
          prompt_tokens:
            Number(usageRaw?.prompt_tokens ?? 0) + Number(cont.usageRaw?.prompt_tokens ?? 0),
          completion_tokens:
            Number(usageRaw?.completion_tokens ?? 0) +
            Number(cont.usageRaw?.completion_tokens ?? 0),
          total_tokens:
            Number(usageRaw?.total_tokens ?? 0) + Number(cont.usageRaw?.total_tokens ?? 0),
        };
        hadReasoning = hadReasoning || cont.hadReasoning;
      }
    }

    const finishReason = choice?.finish_reason;
    const budget = {
      attempts,
      finish_reason: finishReason ?? null,
      completion_tokens: Number(usageRaw?.completion_tokens ?? 0) || undefined,
      prompt_tokens: Number(usageRaw?.prompt_tokens ?? 0) || undefined,
      total_tokens: Number(usageRaw?.total_tokens ?? 0) || undefined,
      had_reasoning: hadReasoning,
      truncated: finishReason === 'length',
      continued,
      thinking_disabled_retry: thinkingDisabledRetry,
    };

    if (!content.trim()) {
      const sensHint = formatMiniMaxSensitiveHint(json);
      const detail = [
        finishReason ? `finish_reason=${finishReason}` : null,
        hadReasoning ? '有 reasoning_content（过程，已忽略，不落库）' : null,
        thinkingDisabledRetry ? '已关思考重试' : null,
        continued ? '已 continue' : null,
      ]
        .filter(Boolean)
        .join('；');
      throw new Error(
        sensHint
          ? `Maxplan 文本返回为空（疑似内容审核拦截）· ${sensHint}`
          : `Maxplan 文本返回为空（model=${upstreamModel}${detail ? `；${detail}` : ''}）。已执行：关思考重试→continue；思考不落库。`
      );
    }

    // length 且 continue 后仍截断：有正文则接受并打 truncated，由上层 hygiene/观测处理
    const usage = {
      prompt_tokens: Number(usageRaw?.prompt_tokens ?? 0),
      completion_tokens: Number(usageRaw?.completion_tokens ?? 0),
      total_tokens: Number(usageRaw?.total_tokens ?? 0),
    };

    return {
      text: content,
      mediaUrls: content ? [content] : [],
      metadata: {
        provider: this.provider,
        model: modelKey,
        upstreamModel,
        text: content,
        usage,
        finish_reason: finishReason,
        had_reasoning: hadReasoning,
        budget,
        vision_images: referenceUrls.length,
        raw: stripReasoningFromUpstreamRaw(json),
      },
    } as GenerateResult;
  }

  /**
   * 文生图 / 参考图生图
   * POST /v1/image_generation
   */
  private async generateImage(modelKey: string, params: GenerateParams): Promise<GenerateResult> {
    const upstreamModel = this.resolveUpstreamModel(modelKey);
    const rawParams = this.mergeDefaultParameters(
      modelKey,
      (params.parameters ?? {}) as Record<string, unknown>,
    );

    const prompt = String(params.prompt ?? rawParams.prompt ?? '').trim();
    if (!prompt) {
      throw new Error('Maxplan 生图需要提供 prompt');
    }

    const aspectRatio =
      rawParams.aspect_ratio ??
      rawParams.aspectRatio ??
      (params as { aspect_ratio?: string }).aspect_ratio;

    const subjectReference =
      rawParams.subject_reference ??
      rawParams.subjectReference ??
      this.buildSubjectReference(rawParams);

    const body: Record<string, unknown> = {
      ...rawParams,
      model: upstreamModel,
      prompt,
      response_format: rawParams.response_format ?? 'url',
      n: rawParams.n ?? rawParams.num_outputs ?? 1,
    };
    if (aspectRatio) body.aspect_ratio = aspectRatio;
    if (subjectReference) body.subject_reference = subjectReference;

    const json = await this.postJson('/v1/image_generation', body);
    assertMiniMaxBaseResp(json, '生图');

    const data = json.data as
      | { image_urls?: string[]; image_base64?: string[] }
      | undefined;
    const mediaUrls: string[] = [];

    if (Array.isArray(data?.image_urls)) {
      for (const url of data.image_urls) {
        if (typeof url === 'string' && url.trim()) mediaUrls.push(url.trim());
      }
    }
    if (mediaUrls.length === 0 && Array.isArray(data?.image_base64)) {
      for (const b64 of data.image_base64) {
        if (typeof b64 === 'string' && b64.trim()) {
          mediaUrls.push(`data:image/jpeg;base64,${b64.trim()}`);
        }
      }
    }
    if (mediaUrls.length === 0) {
      throw new Error('Maxplan 生图返回为空或未包含 image_urls / image_base64');
    }

    return {
      mediaUrls,
      metadata: {
        provider: this.provider,
        model: modelKey,
        upstreamModel,
        image_count: mediaUrls.length,
        raw: json,
      },
    };
  }

  private buildSubjectReference(
    rawParams: Record<string, unknown>,
  ): Array<{ type: string; image_file: string }> | undefined {
    const refs =
      rawParams.reference_images ??
      rawParams.referenceImages ??
      rawParams.referenceImage ??
      rawParams.image_urls;
    const list = Array.isArray(refs) ? refs : refs != null ? [refs] : [];
    const urls = list
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          const o = item as Record<string, unknown>;
          return o.url ?? o.image_file ?? o.imageFile;
        }
        return null;
      })
      .filter((u): u is string => typeof u === 'string' && u.trim().length > 0);

    if (urls.length === 0) return undefined;
    const refType = String(rawParams.subject_reference_type ?? 'character');
    return urls.map((image_file) => ({ type: refType, image_file }));
  }

  /**
   * 语音合成 - 默认 t2a_v2，protocol=text_to_speech 时走旧接口
   */
  private async generateAudio(modelKey: string, params: GenerateParams): Promise<GenerateResult> {
    const protocol = this.resolveAudioProtocol(modelKey);
    if (protocol === 'text_to_speech') {
      return this.generateAudioLegacy(modelKey, params);
    }
    return this.generateAudioT2aV2(modelKey, params);
  }

  /** Task V2 / 路由层可能把 TTS 字段放在 parameters、params 或顶层，统一合并 */
  private collectAudioRawParams(modelKey: string, params: GenerateParams): Record<string, unknown> {
    const nested = (params as { params?: Record<string, unknown> }).params;
    const topLevel = params as Record<string, unknown>;
    const fromParameters = (params.parameters ?? {}) as Record<string, unknown>;
    const picked: Record<string, unknown> = {};
    for (const key of [
      'voice_setting',
      'audio_setting',
      'pronunciation_dict',
      'timbre_weights',
      'stream',
      'stream_options',
      'language_boost',
      'output_format',
      'voice_modify',
      'subtitle_enable',
      'subtitle_type',
      'text',
      'voice_id',
      'voiceId',
    ]) {
      if (topLevel[key] !== undefined) picked[key] = topLevel[key];
      if (nested?.[key] !== undefined) picked[key] = nested[key];
    }
    return this.mergeDefaultParameters(modelKey, { ...fromParameters, ...picked });
  }

  private async generateAudioT2aV2(
    modelKey: string,
    params: GenerateParams,
  ): Promise<GenerateResult> {
    const upstreamModel = this.resolveUpstreamModel(modelKey);
    const rawParams = this.collectAudioRawParams(modelKey, params);

    const text = resolveTtsInputText(params as Record<string, unknown>);
    if (!text) {
      throw new Error('Maxplan TTS 需要提供 prompt 或 parameters.text');
    }

    const voiceId =
      rawParams.voice_id ??
      rawParams.voiceId ??
      (rawParams.voice_setting as { voice_id?: string } | undefined)?.voice_id ??
      'female-shaonv';

    const voiceSetting =
      rawParams.voice_setting ??
      ({
        voice_id: voiceId,
        speed: 1,
        vol: 1,
        pitch: 0,
      } as Record<string, unknown>);

    const body: Record<string, unknown> = {
      ...rawParams,
      model: upstreamModel,
      text,
      stream: false,
      voice_setting: voiceSetting,
    };
    // MiniMax 字幕：默认开启 sentence；仅当 params.subtitle_enable===false 时关闭
    const subtitle = resolveTtsSubtitleApiParams(upstreamModel, rawParams);
    if (subtitle.subtitle_enable) {
      body.subtitle_enable = true;
      if (subtitle.subtitle_type) body.subtitle_type = subtitle.subtitle_type;
    } else {
      delete body.subtitle_enable;
      delete body.subtitle_type;
    }

    const json = await this.postJson('/v1/t2a_v2', body);
    assertMiniMaxBaseResp(json, 'TTS');

    const data = json.data as { audio?: string; subtitle_file?: string } | undefined;
    const extra = json.extra_info as
      | { audio_format?: string; audio_length?: number; usage_characters?: number }
      | undefined;
    assertTtsUsageReasonable(text, extra as Record<string, unknown> | undefined);
    const mediaUrls: string[] = [];

    if (data?.audio && typeof data.audio === 'string') {
      const fmt = extra?.audio_format ?? 'mp3';
      mediaUrls.push(hexToDataUri(data.audio, mimeFromAudioFormat(fmt)));
    }

    if (mediaUrls.length === 0) {
      throw new Error('Maxplan TTS (t2a_v2) 返回为空或未包含 audio 数据');
    }

    const subtitleFile =
      typeof data?.subtitle_file === 'string' && data.subtitle_file.trim()
        ? data.subtitle_file.trim()
        : undefined;

    const usageCharacters =
      extra?.usage_characters != null && Number(extra.usage_characters) > 0
        ? Number(extra.usage_characters)
        : text.length;

    return {
      mediaUrls,
      metadata: {
        provider: this.provider,
        model: modelKey,
        upstreamModel,
        audio_seconds: extra?.audio_length != null ? Number(extra.audio_length) / 1000 : undefined,
        duration: extra?.audio_length != null ? Number(extra.audio_length) / 1000 : undefined,
        subtitle_file: subtitleFile,
        subtitle_enabled: Boolean(subtitle.subtitle_enable),
        extra_info: extra,
        // 字数 → prompt_tokens，配合 provider_pricing token_based（$/千字）计费
        usage: {
          prompt_tokens: usageCharacters,
          completion_tokens: 0,
          total_tokens: usageCharacters,
          usage_characters: usageCharacters,
        },
      },
    };
  }

  /**
   * 音乐生成 - POST /v1/music_generation（Token Plan / 包月 Key）
   */
  private async generateMusic(modelKey: string, params: GenerateParams): Promise<GenerateResult> {
    const upstreamModel = this.resolveUpstreamModel(modelKey);
    const rawParams = this.mergeDefaultParameters(
      modelKey,
      (params.parameters ?? {}) as Record<string, unknown>,
    );

    const prompt = String(params.prompt ?? rawParams.prompt ?? '').trim();
    const lyrics = String(rawParams.lyrics ?? '').trim();
    const isInstrumental = Boolean(rawParams.is_instrumental ?? rawParams.isInstrumental ?? false);

    if (!prompt && !lyrics && !isInstrumental) {
      throw new Error('Maxplan 音乐生成需要提供 prompt、lyrics 或 is_instrumental=true');
    }

    const body: Record<string, unknown> = {
      ...rawParams,
      model: upstreamModel,
      output_format: rawParams.output_format ?? 'url',
      audio_setting: rawParams.audio_setting ?? {
        sample_rate: 44100,
        bitrate: 256000,
        format: 'mp3',
      },
      is_instrumental: isInstrumental,
    };
    if (prompt) body.prompt = prompt;
    if (lyrics) {
      body.lyrics = lyrics;
      // 已由上游 text 业务生成完整歌词，禁止 MiniMax 二次改写/自动写词
      body.lyrics_optimizer = false;
    } else if (prompt) {
      body.lyrics_optimizer = rawParams.lyrics_optimizer ?? true;
    }

    const json = await this.postJson('/v1/music_generation', body);
    assertMiniMaxBaseResp(json, '音乐生成');

    const data = json.data as
      | { audio?: string; status?: number; url?: string; audio_url?: string }
      | undefined;
    const mediaUrls: string[] = [];

    const urlCandidate =
      (typeof data?.url === 'string' && data.url) ||
      (typeof data?.audio_url === 'string' && data.audio_url) ||
      (typeof json.audio_url === 'string' && json.audio_url) ||
      (typeof data?.audio === 'string' && /^https?:\/\//i.test(data.audio) ? data.audio : '');

    if (urlCandidate.trim()) {
      mediaUrls.push(urlCandidate.trim());
    } else if (data?.audio && typeof data.audio === 'string') {
      const hex = data.audio.replace(/\s/g, '');
      if (/^https?:\/\//i.test(hex)) {
        mediaUrls.push(hex);
      } else if (hex.length > 0) {
        const fmt =
          (rawParams.audio_setting as { format?: string } | undefined)?.format ??
          (body.audio_setting as { format?: string }).format ??
          'mp3';
        mediaUrls.push(hexToDataUri(hex, mimeFromAudioFormat(fmt)));
      }
    }

    if (mediaUrls.length === 0) {
      throw new Error('Maxplan 音乐生成返回为空或未包含 audio / url');
    }

    return {
      mediaUrls,
      metadata: {
        provider: this.provider,
        model: modelKey,
        upstreamModel,
        // 回显歌词/曲风描述，便于任务结果保存与前端回显
        ...(lyrics ? { lyrics } : {}),
        ...(prompt ? { musicPrompt: prompt } : {}),
        raw: json,
      },
    };
  }

  /** 旧版 TTS：POST /v1/text_to_speech */
  private async generateAudioLegacy(
    modelKey: string,
    params: GenerateParams,
  ): Promise<GenerateResult> {
    const upstreamModel = this.resolveUpstreamModel(modelKey);
    const rawParams = this.mergeDefaultParameters(
      modelKey,
      (params.parameters ?? {}) as Record<string, unknown>,
    );

    const text = resolveTtsInputText(params as Record<string, unknown>);
    if (!text) {
      throw new Error('Maxplan TTS 需要提供 prompt 或 parameters.text');
    }

    const voiceId = rawParams.voice_id ?? rawParams.voiceId ?? 'female-shaonv';
    const body: Record<string, unknown> = {
      ...rawParams,
      model: upstreamModel,
      text,
      voice_id: voiceId,
    };

    const json = await this.postJson('/v1/text_to_speech', body);
    const extra = json.extra_info as { usage_characters?: number } | undefined;
    assertTtsUsageReasonable(text, extra as Record<string, unknown> | undefined);
    const mediaUrls: string[] = [];
    const audioUrl = json.audio_url;
    if (typeof audioUrl === 'string' && audioUrl.trim()) {
      mediaUrls.push(audioUrl.trim());
    } else if (typeof json.data === 'string' && json.data.trim()) {
      mediaUrls.push(`data:audio/mpeg;base64,${json.data.trim()}`);
    }

    if (mediaUrls.length === 0) {
      throw new Error('Maxplan TTS (text_to_speech) 返回为空或未包含音频数据');
    }

    const usageCharacters =
      extra?.usage_characters != null && Number(extra.usage_characters) > 0
        ? Number(extra.usage_characters)
        : text.length;

    return {
      mediaUrls,
      metadata: {
        provider: this.provider,
        model: modelKey,
        upstreamModel,
        raw: json,
        usage: {
          prompt_tokens: usageCharacters,
          completion_tokens: 0,
          total_tokens: usageCharacters,
          usage_characters: usageCharacters,
        },
      },
    };
  }

  async generate(modelName: string, params: GenerateParams): Promise<GenerateResult> {
    if (!this.supportsModel(modelName)) {
      throw new Error(`Maxplan provider 不支持模型: ${modelName}`);
    }

    const start = Date.now();
    let success = true;
    let errorCode: string | undefined;
    try {
      const modality = this.resolveModality(modelName);
      switch (modality) {
        case 'image':
          return await this.generateImage(modelName, params);
        case 'music':
          return await this.generateMusic(modelName, params);
        case 'audio':
          return await this.generateAudio(modelName, params);
        default:
          return await this.generateText(modelName, params);
      }
    } catch (e) {
      success = false;
      errorCode = e instanceof Error ? e.message.slice(0, 120) : 'maxplan_error';
      throw e;
    } finally {
      recordStats({
        provider: this.provider,
        logicalModel: modelName,
        model_key: modelName,
        success,
        latencyMs: Date.now() - start,
        errorCode,
      });
    }
  }
}
