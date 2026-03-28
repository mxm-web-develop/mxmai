/**
 * Deer Provider
 *
 * 统一封装对 DeerAPI 的调用：
 * - OpenAI chat/completions（deepseek-r1, gpt-5.2, qwen3-235b-a22b, qwen3-30b-a3b 等）
 * - Anthropic Messages（claude-4.5-sonnet）
 *
 * 注意：本实现从原来的 `src/core/providers/deer.provider.ts` 迁移到 `src/models/deerapi/provider.ts`，
 * 以保证 provider 逻辑与模型层归档在一起。
 */

import {
  ModelProvider,
  ProviderType,
  GenerateParams,
  GenerateResult,
  StreamChunk,
  StreamStatus,
  ProgressEvent,
  ProgressStatus,
  ProviderBillingInfo,
  ProviderUsageSummary,
  recordStats,
  getProviderStats,
  getDeerProviderKeys,
} from '../providers';
import { DeerAPIClient, DeerAPIChatMessage } from '../deerapi/client';
import {
  isModelEnabled,
  getByProviderAndModelKey,
  getUpstreamModel,
} from '../provider-model-catalog';
import { requireUpstreamPhysicalId } from '../physical-model-id';
import { ProviderBalanceService } from '../../statistics/provider-balance-service';

export class DeerProvider implements ModelProvider {
  readonly provider: ProviderType = 'deer';
  readonly name = 'DeerAPI';

  /**
   * Deer 上游物理模型 ID：以 provider_models 为准；Runway 特例可仅配 model_key。
   */
  private getModelName(modelName: string): string {
    if (this.runwayVideoModels.includes(modelName)) {
      return getUpstreamModel('deer', modelName) ?? modelName;
    }
    return requireUpstreamPhysicalId('deer', modelName);
  }

  /** Runway 视频（可走独立 API，未入库时仍允许 model_key=runway） */
  private readonly runwayVideoModels: string[] = ['runway'];

  constructor(
    private readonly injectApiKey?: string,
    private readonly injectBaseUrl?: string,
    private readonly injectGroup?: string
  ) {}

  /** 判断是否为 DeerAPI 速率限制类错误（可尝试切换下一条 Key） */
  private isDeerRateLimitError(e: unknown): boolean {
    const msg = e instanceof Error ? e.message : String(e);
    const lower = msg.toLowerCase();
    return (
      lower.includes('429') ||
      lower.includes('too many requests') ||
      msg.includes('1302') ||
      msg.includes('速率限制') ||
      msg.includes('rix_api_error')
    );
  }

  /**
   * 使用 Admin/数据库配置的 deer key 列表（priority 升序）依次尝试；
   * 命中 429/限流时自动切换下一条 Key。无 DB key 时与 getProviderKeys 一致回退环境变量。
   * 注入单 key（测试）时不轮换。
   */
  private async withDeerKeyRotation<T>(fn: (client: DeerAPIClient) => Promise<T>): Promise<T> {
    const url = this.injectBaseUrl || process.env.DEERAPI_BASE_URL;
    const apiGroup = this.injectGroup || process.env.DEERAPI_GROUP;
    if (!url) {
      throw new Error('DEERAPI_BASE_URL 环境变量必须设置，或通过 baseUrl 参数提供');
    }
    const keys = this.injectApiKey ? [this.injectApiKey] : await getDeerProviderKeys();
    if (!keys.length) {
      throw new Error(
        '未配置 Deer API Key：请先在 Admin「API Key 管理」中为 provider=deer 添加 Key（推荐），或配置 DEERAPI_API_KEY / DEERAPI_API_KEYS 环境变量'
      );
    }
    let lastErr: unknown;
    for (let i = 0; i < keys.length; i++) {
      const client = new DeerAPIClient({ baseUrl: url, apiKey: keys[i], group: apiGroup });
      try {
        return await fn(client);
      } catch (e) {
        lastErr = e;
        if (i < keys.length - 1 && this.isDeerRateLimitError(e)) {
          console.warn(`[DeerProvider] DeerAPI 限流/429，切换下一条 Key（${i + 2}/${keys.length}）`);
          continue;
        }
        throw e;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  supportsModel(modelName: string): boolean {
    if (isModelEnabled('deer', modelName)) return true;
    return this.runwayVideoModels.includes(modelName);
  }

  async generate(modelName: string, params: GenerateParams): Promise<GenerateResult> {
    if (!this.supportsModel(modelName)) {
      throw new Error(`Deer provider 不支持模型: ${modelName}`);
    }

    const start = Date.now();
    let success = true;
    let errorCode: string | undefined;
    try {
      return await this.withDeerKeyRotation(async (client) => {
        const deerModel = this.getModelName(modelName);
        const dbModel = getByProviderAndModelKey('deer', modelName);
        const dbModality = dbModel?.modality?.toLowerCase() ?? null;
        const dbScope = dbModel?.scope?.toLowerCase() ?? null;
        const isImageModel = dbModality === 'image' || dbScope === 'graph';
        const isTextModel =
          dbModality === 'text' ||
          dbScope === 'text' ||
          dbScope === 'default' ||
          dbScope === 'writing' ||
          dbScope === 'outline';
        const isVideoModel = dbModality === 'video' || dbScope === 'video';
        const isAudioModel = dbModality === 'audio' || dbScope === 'audio';
        const isRunwayVideoModel = this.runwayVideoModels.includes(modelName);
        const outputFormat = params.outputFormat || 'json';

        // 关键：调用上游前先检查是否配置了 provider_pricing（无则早失败，避免消耗上游余额）
        // scope 与 provider_pricing.scope 对齐：text/graph/audio/video（未命中将自动回落 scope='default'）
        const scopeForPricing =
          isImageModel ? 'graph' :
          isRunwayVideoModel ? 'video' :
          isVideoModel ? 'video' :
          isAudioModel ? 'audio' :
          isTextModel ? 'text' :
          'default';
        await ProviderBalanceService.assertPricingConfigured({
          provider: this.provider,
          model_key: modelName,
          scope: scopeForPricing,
        });

        if (isImageModel) {
          return await this.generateImage(modelName, deerModel, params, client);
        }
        if (isRunwayVideoModel) {
          return await this.generateRunwayVideo(modelName, params, client);
        }
        if (isVideoModel) {
          return await this.generateVideo(modelName, deerModel, params, client);
        }
        if (isAudioModel) {
          return await this.generateAudio(modelName, deerModel, params, client);
        }
        if (!isTextModel) {
          throw new Error(`Deer provider 无法识别模型类型: ${modelName}`);
        }
        return await this.generateText(modelName, deerModel, params, outputFormat, client);
      });
    } catch (e) {
      success = false;
      errorCode = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      recordStats({
        provider: 'deer',
        logicalModel: modelName,
        model_key: modelName,
        success,
        latencyMs: Date.now() - start,
        errorCode,
      });
    }
  }

  async getUsageSummary(window: string): Promise<ProviderUsageSummary> {
    const list = getProviderStats({ provider: 'deer', window });
    const agg = list.find((a) => a.provider === 'deer') || {
      provider: 'deer' as ProviderType,
      requestCount: 0,
      successCount: 0,
      errorRate: 0,
      avgLatencyMs: 0,
      window,
    };
    return {
      provider: 'deer',
      requestCount: agg.requestCount,
      successCount: agg.successCount,
      errorRate: agg.errorRate,
      avgLatencyMs: agg.avgLatencyMs,
      window: agg.window,
    };
  }

  async getBillingInfo(): Promise<ProviderBillingInfo> {
    return { provider: 'deer', supported: false };
  }

  /**
   * 生成音频（Suno 音乐等）
   * 说明：
   * - Suno 音乐生成是异步任务：submit -> fetch 轮询
   * - 这里通过 progress 流向 TaskExecutor 汇报进度，并在完成时返回 audio URL
   */
  private async generateAudio(
    modelName: string,
    _deerModel: string,
    params: GenerateParams,
    client: DeerAPIClient,
  ): Promise<GenerateResult> {
    if (modelName !== 'suno-music') {
      throw new Error(`Deer provider 暂不支持该音频模型: ${modelName}`);
    }

    // DeerAPI Suno music submit body：主要来自 parameters，其次从 prompt 填充 prompt 字段
    const body: Record<string, any> = {
      ...(params.parameters || {}),
    };
    if (params.prompt && !body.prompt && !body.gpt_description_prompt) {
      body.prompt = params.prompt;
    }

    // submit
    const submit = await client.submitSunoMusic(body);
    const taskId = submit.taskId;

    const progressStream = this.createSunoMusicProgressStream(taskId, client);

    return {
      mediaUrls: [],
      metadata: {
        model: modelName,
        provider: this.provider,
        taskId,
        submitRaw: submit.raw,
      },
      progress: progressStream,
    };
  }

  private async *createSunoMusicProgressStream(taskId: string, client: DeerAPIClient): AsyncIterable<ProgressEvent> {
    yield { status: 'starting', progress: 10, logs: ['Suno 音乐任务已提交，等待生成...'] };

    const maxAttempts = 180; // 约 15 分钟（5s * 180）
    const pollInterval = 5000;
    let lastProgress = 10;
    let completedButNoUrlCount = 0;

    const normalize = (s: string) => s.trim().toLowerCase();
    const isDone = (s: string) => ['completed', 'complete', 'succeeded', 'success', 'done'].includes(normalize(s));
    const isFail = (s: string) => ['failed', 'error', 'cancelled', 'canceled'].includes(normalize(s));
    const isRunning = (s: string) => ['pending', 'queued', 'running', 'in_progress', 'processing'].includes(normalize(s));

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((r) => setTimeout(r, pollInterval));

      const fetched = await client.fetchSunoTask(taskId);
      const status = fetched.status;

      if (isFail(status)) {
        yield {
          status: 'failed',
          progress: lastProgress,
          error: `Suno 任务失败: ${status}`,
        };
        return;
      }

      if (isDone(status)) {
        if (fetched.audioUrls.length === 0) {
          // DeerAPI 有时会先返回 completed，再过几秒补全 audio_url；这里多等一会儿避免误判失败
          completedButNoUrlCount += 1;
          if (completedButNoUrlCount <= 6) {
            lastProgress = Math.min(95, Math.max(lastProgress, 90));
            yield {
              status: 'processing',
              progress: lastProgress,
              logs: [`Suno 已标记完成但音频链接尚未就绪，继续等待...（${completedButNoUrlCount}/6）`],
            };
            continue;
          }

          yield {
            status: 'failed',
            progress: lastProgress,
            error: `Suno 任务已完成但未返回 audio url（taskId=${taskId}）`,
          };
          return;
        }

        // 尝试从 DeerAPI 返回的数据中推断音频时长（秒）
        let durationSec: number | undefined;
        try {
          const raw = (fetched.raw as any) || {};
          const taskInfo = raw.task || raw.data || raw;
          // DeerAPI 常见结构：clips 数组中包含 duration 字段
          const clips = (taskInfo && (taskInfo.clips || taskInfo.data || taskInfo.output)) || [];
          const firstClip = Array.isArray(clips) ? clips[0] : undefined;
          const d =
            (firstClip && (firstClip.duration || firstClip.duration_sec || firstClip.length)) ||
            taskInfo.duration ||
            taskInfo.duration_sec;
          if (typeof d === 'number' && isFinite(d) && d > 0) {
            durationSec = d;
          }
        } catch (e) {
          console.warn('[Deer Provider] 解析 Suno 音乐时长失败:', e);
        }

        yield {
          status: 'succeeded',
          progress: 100,
          logs: ['Suno 音乐生成完成'],
          output: {
            mediaUrls: fetched.audioUrls,
            metadata: {
              taskId,
              sunoStatus: status,
              ...(typeof durationSec === 'number' && durationSec > 0 ? { duration: durationSec } : {}),
            },
          },
        };
        return;
      }

      // running / unknown：缓慢抬进度，且定期 yield 以刷新 updatedAt
      if (isRunning(status) || status === 'unknown') {
        const bump = attempt < 6 ? 8 : 3;
        const next = Math.min(90, lastProgress + bump);
        const shouldYield = next > lastProgress || attempt % 6 === 0;
        if (shouldYield) {
          lastProgress = next;
          yield {
            status: 'processing',
            progress: lastProgress,
            logs: [`Suno 生成中: ${status}`],
          };
        }
        continue;
      }

      // 其他未识别状态：保守处理
      if (attempt % 6 === 0) {
        yield {
          status: 'processing',
          progress: lastProgress,
          logs: [`Suno 状态更新: ${status}`],
        };
      }
    }

    yield {
      status: 'failed',
      progress: lastProgress,
      error: 'Suno 音乐生成超时',
    };
  }

  private async generateText(
    modelName: string,
    deerModel: string,
    params: GenerateParams,
    outputFormat: 'stream' | 'json',
    client: DeerAPIClient,
  ): Promise<GenerateResult> {
    const messages: DeerAPIChatMessage[] = [];
    const systemPrompt = params.parameters?.system_prompt || params.parameters?.system_instruction;
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: params.prompt });

    const temperature = params.parameters?.temperature ?? 0.7;
    const max_tokens = params.parameters?.max_tokens ?? params.parameters?.max_output_tokens;

    const isAnthropic =
      modelName.toLowerCase().includes('claude') ||
      (getByProviderAndModelKey('deer', modelName)?.protocol ?? '').toLowerCase() === 'anthropic';

    if (outputFormat === 'stream') {
      if (isAnthropic) {
        const stream = this.createAnthropicTextStream(
          deerModel,
          messages.filter((m) => m.role !== 'system') as Array<{ role: 'user' | 'assistant'; content: string }>,
          systemPrompt,
          params,
          client,
        );

        return {
          mediaUrls: [],
          metadata: {
            model: modelName,
            provider: this.provider,
            outputFormat: 'stream',
          },
          stream,
          streamString: this.createStringStreamFromChunkStream(stream),
        };
      }

      const stream = this.createTextStream(deerModel, messages, params, client);
      return {
        mediaUrls: [],
        metadata: {
          model: modelName,
          provider: this.provider,
          outputFormat: 'stream',
        },
        stream,
        streamString: this.createStringStreamFromChunkStream(stream),
      };
    }

    // JSON 模式
    if (isAnthropic) {
      const response = await client.anthropicMessages({
        model: deerModel,
        messages: messages.filter((m) => m.role !== 'system') as Array<{ role: 'user' | 'assistant'; content: string }>,
        system: systemPrompt,
        max_tokens: max_tokens || 4096,
        temperature,
      });

      let text = '';
      if (Array.isArray(response.content)) {
        text = response.content
          .filter((item) => item && item.type === 'text' && item.text)
          .map((item) => item.text)
          .join('');
      }

      const usage = {
        prompt_tokens: response.usage?.input_tokens || 0,
        completion_tokens: response.usage?.output_tokens || 0,
        total_tokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
      };

      return {
        mediaUrls: text ? [text] : [],
        metadata: {
          model: modelName,
          provider: this.provider,
          outputFormat: 'json',
          text,
          usage,
        },
        // 兼容历史字段
        ...(text ? { text } : {}),
        ...(usage ? { usage } : {}),
      } as any;
    }

    const chatResponse = await client.chat({
      model: deerModel,
      messages,
      temperature,
      max_tokens,
      ...params.parameters,
    });

    const text = chatResponse.choices[0]?.message?.content || '';
    const usage = {
      prompt_tokens: chatResponse.usage?.prompt_tokens || 0,
      completion_tokens: chatResponse.usage?.completion_tokens || 0,
      total_tokens: chatResponse.usage?.total_tokens || 0,
    };

    return {
      mediaUrls: text ? [text] : [],
      metadata: {
        model: modelName,
        provider: this.provider,
        outputFormat: 'json',
        text,
        usage,
      },
      ...(text ? { text } : {}),
      ...(usage ? { usage } : {}),
    } as any;
  }

  private async *createTextStream(
    deerModel: string,
    messages: DeerAPIChatMessage[],
    params: GenerateParams,
    client: DeerAPIClient,
  ): AsyncGenerator<StreamChunk, void, unknown> {
    const enableCollection = params.enableCollection !== false;
    let collection = '';

    const stream = client.chatStream({
      model: deerModel,
      messages,
      temperature: params.parameters?.temperature,
      max_tokens: params.parameters?.max_tokens ?? params.parameters?.max_output_tokens,
      ...params.parameters,
    });

    for await (const chunk of stream) {
      if (enableCollection) collection += chunk;
      yield {
        chunk,
        status: 'streaming' as StreamStatus,
        collection,
      };
    }

    yield {
      chunk: '',
      status: 'completed' as StreamStatus,
      collection,
    };
  }

  private async *createAnthropicTextStream(
    deerModel: string,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    system: string | undefined,
    params: GenerateParams,
    client: DeerAPIClient,
  ): AsyncGenerator<StreamChunk, void, unknown> {
    const enableCollection = params.enableCollection !== false;
    let collection = '';

    const maxTokensParam = params.parameters?.max_tokens ?? params.parameters?.max_output_tokens;
    const max_tokens = maxTokensParam || 4096;

    const stream = client.anthropicMessagesStream({
      model: deerModel,
      messages,
      system,
      temperature: params.parameters?.temperature,
      max_tokens,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        const text = event.delta?.text || event.content_block_delta?.text || '';
        if (text) {
          if (enableCollection) collection += text;
          yield {
            chunk: text,
            status: 'streaming' as StreamStatus,
            collection,
          };
        }
      }
    }

    yield {
      chunk: '',
      status: 'completed' as StreamStatus,
      collection,
    };
  }

  private async *createStringStreamFromChunkStream(
    chunkStream: AsyncIterable<StreamChunk>,
  ): AsyncIterable<string> {
    for await (const item of chunkStream) {
      if (item.chunk) yield item.chunk;
    }
  }

  /**
   * 生成图像
   * - nano-banana / nano-banana-pro: 使用 Gemini generateContent 接口（DeerAPI、Google 均支持）
   * - flux 系列模型: 使用 Replicate 兼容的预测接口（异步轮询）
   * 参考文档：
   * - Gemini: https://apidoc.deerapi.com/guide-to-calling-gemini-image
   * - Flux: https://api.deerapi.com/doc
   */
  private async generateImage(
    modelName: string,
    deerModel: string,
    params: GenerateParams,
    client: DeerAPIClient,
  ): Promise<GenerateResult> {
    try {
      // 判断使用哪种接口
      const isGeminiModel =
        modelName === 'nano-banana' ||
        modelName === 'nano-banana-pro' ||
        modelName === 'nano-banana-2' ||
        modelName === 'nano-banana-2-pro';
      const isFluxModel = modelName.startsWith('flux-');
      const isSeedreamModel = modelName === 'seedream-4' || modelName === 'seedream-5';

      if (isGeminiModel) {
        return await this.generateImageWithGemini(modelName, deerModel, params, client);
      } else if (isFluxModel) {
        return await this.generateImageWithReplicate(modelName, deerModel, params, client);
      } else if (isSeedreamModel) {
        return await this.generateImageWithSeedream(modelName, deerModel, params, client);
      } else {
        throw new Error(`DeerAPI 暂不支持模型 ${modelName} 的图像生成`);
      }
    } catch (error) {
      throw new Error(`Deer provider 图像生成失败 (${modelName}): ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 使用 Gemini generateContent 接口生成图像（nano-banana / nano-banana-pro）
   * 上游模型名来自 provider_models.upstream_model（或 Runway 特例）
   */
  private async generateImageWithGemini(
    modelName: string,
    deerModel: string,
    params: GenerateParams,
    client: DeerAPIClient,
  ): Promise<GenerateResult> {
    const geminiModel = deerModel || 'gemini-3-pro-image';

    // 处理图片输入（Base64 格式）
    const imageInputs: Array<{ mime_type: string; data: string }> = [];
    
    // 处理单张图片（image）
    if (params.parameters?.image) {
      const imageValue = params.parameters.image;
      let base64Data = '';
      let mimeType = 'image/jpeg';

      if (imageValue.startsWith('data:')) {
        // data URI 格式：data:image/jpeg;base64,xxx
        const [header, data] = imageValue.split(',');
        base64Data = data;
        const mimeMatch = header.match(/data:([^;]+)/);
        if (mimeMatch) {
          mimeType = mimeMatch[1];
        }
      } else if (imageValue.startsWith('http://') || imageValue.startsWith('https://')) {
        // URL 格式，需要先下载并转换为 Base64
        // 这里简化处理，假设已经是 Base64 字符串
        throw new Error('DeerAPI Gemini 接口暂不支持直接使用图片 URL，请先转换为 Base64');
      } else {
        // 假设是纯 Base64 字符串
        base64Data = imageValue;
      }

      imageInputs.push({ mime_type: mimeType, data: base64Data });
    }

    // 处理多张图片（image_base64s）
    if (params.parameters?.image_base64s && Array.isArray(params.parameters.image_base64s)) {
      for (const base64 of params.parameters.image_base64s) {
        // 假设都是 JPEG 格式，实际应该根据数据判断
        let cleanBase64 = base64;
        let mimeType = 'image/jpeg';

        if (base64.startsWith('data:')) {
          const [header, data] = base64.split(',');
          cleanBase64 = data;
          const mimeMatch = header.match(/data:([^;]+)/);
          if (mimeMatch) {
            mimeType = mimeMatch[1];
          }
        }

        imageInputs.push({ mime_type: mimeType, data: cleanBase64 });
      }
    }

    // 处理 image_urls（需要先下载转换为 Base64，这里简化处理）
    if (params.parameters?.image_urls && Array.isArray(params.parameters.image_urls)) {
      console.warn('⚠️  DeerAPI Gemini 接口暂不支持直接使用图片 URL，请先转换为 Base64');
      // 可以在这里添加下载并转换为 Base64 的逻辑
    }

    // 获取宽高比和图片尺寸
    const aspectRatio = params.parameters?.aspect_ratio || params.parameters?.aspectRatio;
    const imageSize = params.parameters?.image_size || params.parameters?.imageSize;

    // 调用 Gemini generateContent 接口
    const response = await client.generateContent({
      model: geminiModel,
      prompt: params.prompt,
      imageInputs: imageInputs.length > 0 ? imageInputs : undefined,
      aspectRatio,
      imageSize: imageSize as '1K' | '2K' | '4K' | undefined,
      responseModalities: ['IMAGE'], // 强制只返回图片，避免只返回文本
    });

    // 从响应中提取图像数据
    // 注意：Gemini API 可能使用驼峰命名（inlineData）或下划线命名（inline_data）
    const imageUrls: string[] = [];
    
    // 调试：打印响应结构（不包含 Base64 数据）
    if (process.env.DEBUG_DEERAPI || process.env.NODE_ENV !== 'production') {
      // 创建一个安全的响应副本，移除 Base64 数据
      // 使用递归函数处理所有嵌套结构
      const sanitizeBase64 = (obj: any): any => {
        if (obj === null || obj === undefined) {
          return obj;
        }
        
        if (typeof obj === 'string') {
          // 检测 Data URI（优先检测，因为更明确）
          if (obj.startsWith('data:') && obj.includes('base64,')) {
            const base64Part = obj.split('base64,')[1];
            return `[Data URI，Base64长度: ${base64Part?.length || 0} 字符]`;
          }
          // 检测 Base64 数据（长字符串且符合 Base64 字符模式）
          // Base64 字符串通常长度 > 100，且只包含 Base64 字符（A-Z, a-z, 0-9, +, /, =）
          // 对于图片数据，Base64 字符串通常非常长（> 1000 字符）
          if (obj.length > 100) {
            // 检查前 500 个字符是否都是 Base64 字符
            const sample = obj.substring(0, Math.min(500, obj.length));
            // Base64 字符集：A-Z, a-z, 0-9, +, /, =, 可能包含换行符（但通常会被去除）
            const base64Pattern = /^[A-Za-z0-9+/=\s]*$/;
            if (base64Pattern.test(sample)) {
              // 去除空白后检查
              const trimmed = sample.replace(/\s/g, '');
              // 如果去除空白后仍然很长（> 100），且整个字符串很长（> 500），很可能是 Base64 数据
              if (trimmed.length > 100 && obj.length > 500) {
                return `[Base64数据，长度: ${obj.length} 字符]`;
              }
              // 对于中等长度的字符串，如果符合 Base64 模式且长度是 4 的倍数，也可能是 Base64
              if (trimmed.length > 50 && (trimmed.length % 4 === 0 || trimmed.endsWith('=') || trimmed.endsWith('==') || trimmed.endsWith('==='))) {
                return `[Base64数据，长度: ${obj.length} 字符]`;
              }
            }
          }
          return obj;
        }
        
        if (Array.isArray(obj)) {
          return obj.map(item => sanitizeBase64(item));
        }
        
        if (typeof obj === 'object') {
          const sanitized: any = {};
          for (const [key, value] of Object.entries(obj)) {
            sanitized[key] = sanitizeBase64(value);
          }
          return sanitized;
        }
        
        return obj;
      };
      
      const safeResponse = sanitizeBase64(response);
      console.log('[DeerProvider] generateContent 响应结构:', JSON.stringify(safeResponse, null, 2));
    }
    
    // 方法1：尝试标准的 candidates[0].content.parts 结构
    if (response.candidates && Array.isArray(response.candidates) && response.candidates.length > 0) {
      const candidate = response.candidates[0];
      
      // 检查 finishReason，如果是 NO_IMAGE，说明模型拒绝生成图片
      if (candidate.finishReason === 'NO_IMAGE' || candidate.finishReason === 'SAFETY' || candidate.finishReason === 'RECITATION') {
        const reason = candidate.finishReason;
        const reasonMessage = reason === 'NO_IMAGE' 
          ? '模型未生成图片（可能是 prompt 太复杂或不符合模型能力）'
          : reason === 'SAFETY'
          ? '内容被安全策略拦截'
          : '内容被拒绝';
        
        throw new Error(`DeerAPI 图像生成失败: ${reasonMessage} (finishReason: ${reason})。提示：九宫格 prompt 可能过于复杂，建议简化 prompt 或使用其他模型。`);
      }
      
      const content = candidate.content || candidate.content;
      
      if (content) {
        const parts = content.parts || content.parts || [];
        
        for (const part of parts) {
          if (!part) continue;
          
          // 尝试多种可能的字段名格式（下划线、驼峰、混合）
          const inlineData = part.inline_data || part.inlineData || (part as any).inline_data || (part as any).inlineData;
          
          if (inlineData) {
            const mimeType = inlineData.mime_type || inlineData.mimeType || inlineData.mime_type || 'image/png';
            const data = inlineData.data;
            
            if (data && typeof data === 'string' && data.length > 0) {
              // 转换为 data URI 格式，方便前端使用
              const dataUri = `data:${mimeType};base64,${data}`;
              imageUrls.push(dataUri);
            }
          }
        }
      }
    }

    // 方法2：如果还是没有找到，尝试其他可能的响应格式（OpenAI 兼容格式）
    if (imageUrls.length === 0) {
      if ((response as any).data && Array.isArray((response as any).data)) {
        for (const item of (response as any).data) {
          if (item.url) {
            imageUrls.push(item.url);
          } else if (item.b64_json) {
            imageUrls.push(`data:image/png;base64,${item.b64_json}`);
          }
        }
      }
    }

    // 方法3：尝试直接访问可能的字段
    if (imageUrls.length === 0) {
      // 打印完整响应以便调试
      const responseStr = JSON.stringify(response, null, 2);
      console.error('[DeerProvider] 未找到图像数据，完整响应:', responseStr);
      
      // 尝试递归查找所有包含 "data" 的字段
      const findImageData = (obj: any, depth = 0): string[] => {
        if (depth > 5) return []; // 防止无限递归
        if (!obj || typeof obj !== 'object') return [];
        
        const results: string[] = [];
        
        for (const key in obj) {
          const value = obj[key];
          
          // 如果找到 data 字段且是字符串（可能是 Base64）
          if (key.toLowerCase().includes('data') && typeof value === 'string' && value.length > 100) {
            // 检查是否是 Base64 字符串
            if (/^[A-Za-z0-9+/=]+$/.test(value)) {
              const mimeType = obj.mime_type || obj.mimeType || 'image/png';
              results.push(`data:${mimeType};base64,${value}`);
            }
          }
          
          // 递归查找
          if (typeof value === 'object' && value !== null) {
            results.push(...findImageData(value, depth + 1));
          }
        }
        
        return results;
      };
      
      const foundImages = findImageData(response);
      if (foundImages.length > 0) {
        imageUrls.push(...foundImages);
      }
    }

    if (imageUrls.length === 0) {
      throw new Error('DeerAPI 图像生成成功但未返回图像数据。');
    }

    return {
      mediaUrls: imageUrls,
      metadata: {
        model: modelName,
        provider: this.provider,
        outputFormat: 'json',
      },
    };
  }

  /**
   * 使用 DeerAPI Flux 专用接口生成图像（flux 系列模型）
   * 参考文档：https://apidoc.deerapi.com/image/flux/create
   */
  private async generateImageWithReplicate(
    modelName: string,
    deerModel: string,
    params: GenerateParams,
    client: DeerAPIClient,
  ): Promise<GenerateResult> {
    // 构建 Flux 接口的请求参数
    const fluxRequest: {
      model: string;
      prompt: string;
      aspect_ratio?: string;
      output_format?: 'png' | 'jpg' | 'webp';
      seed?: number;
      safety_tolerance?: number;
      prompt_upsampling?: boolean;
      width?: number;
      height?: number;
      steps?: number;
      guidance?: number;
      input_image?: string;
      input_image_2?: string;
      input_image_3?: string;
      input_image_4?: string;
    } = {
      model: deerModel,
      prompt: params.prompt,
    };

    // 处理 aspect_ratio
    if (params.parameters?.aspect_ratio) {
      fluxRequest.aspect_ratio = params.parameters.aspect_ratio;
    }

    // 处理 image_size：转换为 width 和 height
    // 根据 image_size 和 aspect_ratio 计算具体的 width 和 height
    if (params.parameters?.image_size) {
      const imageSize = params.parameters.image_size;
      const aspectRatio = params.parameters.aspect_ratio || '1:1';
      
      // 定义不同尺寸的基础值
      const sizeMap: Record<string, number> = {
        '1K': 1024,
        '2K': 2048,
        '4K': 4096,
      };
      
      const baseSize = sizeMap[imageSize] || 1024;
      
      // 根据宽高比计算 width 和 height
      const [widthRatio, heightRatio] = aspectRatio.split(':').map(Number);
      const ratio = widthRatio / heightRatio;
      
      if (ratio >= 1) {
        // 横向或正方形
        fluxRequest.width = baseSize;
        fluxRequest.height = Math.round(baseSize / ratio);
      } else {
        // 纵向
        fluxRequest.width = Math.round(baseSize * ratio);
        fluxRequest.height = baseSize;
      }
    }

    // 处理 output_format
    if (params.parameters?.output_format) {
      fluxRequest.output_format = params.parameters.output_format as 'png' | 'jpg' | 'webp';
    }

    // 处理其他参数
    if (params.parameters?.seed !== undefined) {
      fluxRequest.seed = params.parameters.seed;
    }
    if (params.parameters?.safety_tolerance !== undefined) {
      fluxRequest.safety_tolerance = params.parameters.safety_tolerance;
    }
    if (params.parameters?.prompt_upsampling !== undefined) {
      fluxRequest.prompt_upsampling = params.parameters.prompt_upsampling;
    }
    if (params.parameters?.width !== undefined) {
      fluxRequest.width = params.parameters.width;
    }
    if (params.parameters?.height !== undefined) {
      fluxRequest.height = params.parameters.height;
    }
    if (params.parameters?.steps !== undefined) {
      fluxRequest.steps = params.parameters.steps;
    }
    if (params.parameters?.guidance !== undefined) {
      fluxRequest.guidance = params.parameters.guidance;
    }

    // 处理图片输入（用于图片编辑）
    if (params.parameters?.input_image) {
      fluxRequest.input_image = params.parameters.input_image;
    }
    if (params.parameters?.input_image_2) {
      fluxRequest.input_image_2 = params.parameters.input_image_2;
    }
    if (params.parameters?.input_image_3) {
      fluxRequest.input_image_3 = params.parameters.input_image_3;
    }
    if (params.parameters?.input_image_4) {
      fluxRequest.input_image_4 = params.parameters.input_image_4;
    }

    // 创建 Flux 任务
    const prediction = await client.createFluxPrediction(fluxRequest);

    // 如果启用进度监控，返回进度流
    if (params.enableProgress !== false) {
      const progressStream = this.createFluxProgressStream(prediction.id, client);
      return {
        mediaUrls: [],
        metadata: {
          model: modelName,
          provider: this.provider,
          outputFormat: 'json',
          taskId: prediction.id,
        },
        progress: progressStream,
      };
    }

    // 如果不启用进度监控，直接轮询直到完成
    let finalResult = await client.getFluxResult(prediction.id);
    
    // 防御性检查
    if (!finalResult || !finalResult.status) {
      throw new Error(`DeerAPI Flux 查询结果格式异常，缺少 status 字段。响应: ${JSON.stringify(finalResult)}`);
    }

    // 状态可能是 "Ready", "Processing", "Failed" 等
    const statusLower = finalResult.status.toLowerCase();
    while (statusLower === 'processing' || statusLower === 'starting') {
      await new Promise(resolve => setTimeout(resolve, 1000));
      finalResult = await client.getFluxResult(prediction.id);
      
      // 再次检查
      if (!finalResult || !finalResult.status) {
        throw new Error(`DeerAPI Flux 查询结果格式异常，缺少 status 字段。响应: ${JSON.stringify(finalResult)}`);
      }
      const newStatusLower = finalResult.status.toLowerCase();
      if (newStatusLower === 'ready' || newStatusLower === 'failed') {
        break;
      }
    }

    const finalStatusLower = finalResult.status.toLowerCase();
    if (finalStatusLower === 'failed' || finalResult.error) {
      throw new Error(`DeerAPI Flux 任务失败: ${JSON.stringify(finalResult.error || '未知错误')}`);
    }

    // 提取输出图片 URL（从 result.sample 字段）
    const mediaUrls: string[] = [];
    if (finalResult.result?.sample) {
      mediaUrls.push(finalResult.result.sample);
    }

    if (mediaUrls.length === 0) {
      throw new Error(`DeerAPI Flux 任务完成但未返回图像数据。状态: ${finalResult.status}, 响应: ${JSON.stringify(finalResult)}`);
    }

    return {
      mediaUrls,
      metadata: {
        model: modelName,
        provider: this.provider,
        outputFormat: 'json',
      },
    };
  }

  /**
   * 创建 Flux 任务的进度流
   * 使用 DeerAPI 的 /flux/v1/get_result 接口查询任务状态
   */
  private async *createFluxProgressStream(
    taskId: string,
    client: DeerAPIClient,
  ): AsyncIterable<ProgressEvent> {
    yield {
      status: 'starting',
      progress: 10,
    };

    let lastStatus = 'starting';
    let lastProgress = 10;

    while (true) {
      try {
        await new Promise(resolve => setTimeout(resolve, 1000)); // 每秒轮询一次

        const result = await client.getFluxResult(taskId);

        // 防御性检查：确保 status 存在
        if (!result || result.status === undefined || result.status === null) {
          console.error('[DeerProvider] Flux 查询结果缺少 status 字段:', JSON.stringify(result));
          yield {
            status: 'failed',
            error: `DeerAPI 返回的响应格式异常，缺少 status 字段。响应: ${JSON.stringify(result)}`,
          };
          break;
        }

        // 更新进度（根据状态估算）
        // DeerAPI 状态：Ready, Processing, Failed 等
        let currentProgress = lastProgress;
        const statusLower = result.status.toLowerCase();
        if (statusLower === 'processing' || result.status === 'Processing') {
          currentProgress = Math.min(lastProgress + 10, 90);
        } else if (statusLower === 'ready' || result.status === 'Ready') {
          currentProgress = 100;
        } else if (statusLower === 'failed' || result.status === 'Failed') {
          currentProgress = lastProgress; // 失败时不更新进度
        } else {
          // 其他状态（如 starting），逐步增加进度
          currentProgress = Math.min(lastProgress + 5, 30);
        }

        // 如果状态变化或进度变化，发送进度事件
        if (result.status !== lastStatus || currentProgress !== lastProgress) {
          // 将 DeerAPI Flux 状态映射到 ProgressStatus
          let progressStatus: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled' = 'processing';
          let outputUrls: string[] | undefined = undefined;
          
          if (statusLower === 'ready') {
            progressStatus = 'succeeded';
            // 任务完成，提取图片 URL
            if (result.result?.sample) {
              outputUrls = [result.result.sample];
            }
          } else if (statusLower === 'failed') {
            progressStatus = 'failed';
          } else if (statusLower === 'processing') {
            progressStatus = 'processing';
          } else {
            progressStatus = 'starting';
          }

          yield {
            status: progressStatus,
            progress: currentProgress,
            logs: [],
            output: outputUrls, // 如果任务完成，包含图片 URL
          };
          lastStatus = result.status;
          lastProgress = currentProgress;
        }

        // 如果完成或失败，退出循环
        if (statusLower === 'ready' || statusLower === 'failed') {
          if (statusLower === 'ready') {
            // 任务完成，提取图片 URL 并发送完成事件
            const imageUrls: string[] = [];
            if (result.result?.sample) {
              imageUrls.push(result.result.sample);
            }
            
            // 发送完成事件，包含输出图片 URL（通过 output 字段传递）
            yield {
              status: 'succeeded',
              progress: 100,
              output: imageUrls.length > 0 ? imageUrls : undefined,
            };
          } else if (statusLower === 'failed') {
            yield {
              status: 'failed',
              error: JSON.stringify(result.error || '未知错误'),
            };
          }
          break;
        }
      } catch (error) {
        yield {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        };
        break;
      }
    }
  }

  /**
   * 使用 DeerAPI Seedream 专用接口生成图像（seedream-4 / seedream-5）
   * 端点：POST /v1/images/generations
   * 参考文档：https://apidoc.deerapi.com/seededit-image-generation-331149260e0
   */
  private async generateImageWithSeedream(
    modelName: string,
    deerModel: string,
    params: GenerateParams,
    client: DeerAPIClient,
  ): Promise<GenerateResult> {
    // 构建 Seedream 接口的请求参数
    const seedreamRequest: {
      model: string;
      prompt: string;
      response_format?: 'url' | 'b64_json';
      size?: '1k' | '2k' | '4k';
      watermark?: boolean;
      n?: number;
      guidance_scale?: number;
      image?: string | string[];
    } = {
      model: deerModel,
      prompt: params.prompt,
    };

    // 处理 size：将 '1K'/'2K'/'4K' 转换为 '1k'/'2k'/'4k'
    if (params.parameters?.size) {
      const sizeValue = params.parameters.size;
      if (typeof sizeValue === 'string') {
        seedreamRequest.size = sizeValue.toLowerCase() as '1k' | '2k' | '4k';
      }
    }

    // 处理 response_format
    if (params.parameters?.response_format) {
      seedreamRequest.response_format = params.parameters.response_format as 'url' | 'b64_json';
    } else {
      // 默认使用 url
      seedreamRequest.response_format = 'url';
    }

    // 处理 watermark
    if (params.parameters?.watermark !== undefined) {
      seedreamRequest.watermark = Boolean(params.parameters.watermark);
    }

    // 处理 n（生成图片数量）
    if (params.parameters?.n !== undefined) {
      seedreamRequest.n = Number(params.parameters.n);
    } else if (params.parameters?.num_outputs !== undefined) {
      seedreamRequest.n = Number(params.parameters.num_outputs);
    } else if (params.parameters?.max_images !== undefined) {
      seedreamRequest.n = Number(params.parameters.max_images);
    }

    // 处理 guidance_scale
    if (params.parameters?.guidance_scale !== undefined) {
      seedreamRequest.guidance_scale = Number(params.parameters.guidance_scale);
    }

    // 处理 image（参考图片）
    if (params.parameters?.image) {
      const imageValue = params.parameters.image;
      if (Array.isArray(imageValue)) {
        seedreamRequest.image = imageValue;
      } else if (typeof imageValue === 'string') {
        seedreamRequest.image = [imageValue];
      }
    } else if (params.parameters?.image_input) {
      const imageInput = params.parameters.image_input;
      if (Array.isArray(imageInput)) {
        seedreamRequest.image = imageInput;
      } else if (typeof imageInput === 'string') {
        seedreamRequest.image = [imageInput];
      }
    } else if (params.parameters?.image_urls && Array.isArray(params.parameters.image_urls)) {
      seedreamRequest.image = params.parameters.image_urls;
    }

    // 调用 Seedream 接口
    console.log(`[DeerProvider] 准备调用 Seedream 接口，模型: ${deerModel}, 参考图数量: ${seedreamRequest.image ? (Array.isArray(seedreamRequest.image) ? seedreamRequest.image.length : 1) : 0}`);
    const response = await client.createSeedreamImageGeneration(seedreamRequest);

    // 提取图片 URL 或 Base64（兼容 data/images/output/result 等返回形态）
    const imageUrls: string[] = [];
    const pushMaybe = (item: any) => {
      if (!item) return;
      if (typeof item === 'string' && (item.startsWith('http://') || item.startsWith('https://'))) {
        imageUrls.push(item);
        return;
      }
      const obj = item as Record<string, any>;
      if (typeof obj.url === 'string') imageUrls.push(obj.url);
      else if (typeof obj.image_url === 'string') imageUrls.push(obj.image_url);
      else if (typeof obj.output_url === 'string') imageUrls.push(obj.output_url);
      else if (typeof obj?.image?.url === 'string') imageUrls.push(obj.image.url);
      else if (typeof obj?.result?.url === 'string') imageUrls.push(obj.result.url);
      else if (typeof obj.b64_json === 'string') imageUrls.push(`data:image/png;base64,${obj.b64_json}`);
      else if (typeof obj.base64 === 'string') imageUrls.push(`data:image/png;base64,${obj.base64}`);
      else if (typeof obj.b64 === 'string') imageUrls.push(`data:image/png;base64,${obj.b64}`);
      else if (typeof obj.image_base64 === 'string') imageUrls.push(`data:image/png;base64,${obj.image_base64}`);
    };
    const candidates = [
      response?.data,
      response?.images,
      response?.output,
      response?.result,
      response?.result?.data,
      response?.result?.images,
      response?.choices,
    ];
    for (const c of candidates) {
      if (Array.isArray(c)) c.forEach(pushMaybe);
      else pushMaybe(c);
    }

    if (imageUrls.length === 0) {
      const keys = Object.keys((response || {}) as Record<string, unknown>).join(', ');
      throw new Error(`DeerAPI Seedream 图像生成成功但未返回图像数据（keys: ${keys || 'none'}）。响应: ${JSON.stringify(response)}`);
    }

    return {
      mediaUrls: imageUrls,
      metadata: {
        model: modelName,
        provider: this.provider,
        outputFormat: 'json',
        usage: response.usage,
      },
    };
  }

  /**
   * 生成视频（异步任务）
   */
  private async generateVideo(
    modelName: string,
    deerModel: string,
    params: GenerateParams,
    client: DeerAPIClient,
  ): Promise<GenerateResult> {
    const prompt = params.prompt;
    if (!prompt) {
      throw new Error('prompt 参数是必需的');
    }

    // 从 parameters 中提取视频生成参数
    const videoParams = params.parameters || {};
    // model 参数由路由决定（sora-2 / sora-2-pro / sora-2-all / sora-2-pro-all），不需要用户传递
    const model = deerModel as 'sora-2' | 'sora-2-pro' | 'sora-2-all' | 'sora-2-pro-all';

    // 官方格式支持秒数：4 / 8 / 12，自研格式支持：10 / 15 / 25
    // 确保 seconds 是字符串类型
    let seconds: '4' | '8' | '12' | '10' | '15' | '25' | undefined;
    if (videoParams.seconds) {
      seconds = String(videoParams.seconds) as '4' | '8' | '12' | '10' | '15' | '25';
    }
    
    const size = (videoParams.size as '720x1280' | '1280x720' | '1024x1792' | '1792x1024' | undefined) || '1280x720';
    let input_referenceRaw = videoParams.input_reference as string | undefined;
    const character_url = videoParams.character_url as string | undefined;
    const character_timestamps = videoParams.character_timestamps as string | undefined;

    // 文档要求 input_reference 为图片数据（multipart 文件）。URL 需先拉取为 Buffer，base64 直接解码
    let input_reference: Buffer | string | undefined;
    if (input_referenceRaw) {
      if (/^https?:\/\//i.test(input_referenceRaw)) {
        try {
          const res = await fetch(input_referenceRaw);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const ab = await res.arrayBuffer();
          input_reference = Buffer.from(ab);
          console.log(`[Deer Provider] input_reference 从 URL 拉取成功, 大小: ${(input_reference.length / 1024).toFixed(2)} KB`);
        } catch (e) {
          console.warn('[Deer Provider] input_reference URL 拉取失败，将不传参考图:', e);
          input_reference = undefined;
        }
      } else {
        input_reference = input_referenceRaw.startsWith('data:')
          ? Buffer.from(input_referenceRaw.replace(/^data:image\/\w+;base64,/, ''), 'base64')
          : Buffer.from(input_referenceRaw, 'base64');
      }
    }

    // 调试日志
    console.log(`[Deer Provider] 视频生成参数:`);
    console.log(`   model: ${model}`);
    console.log(`   seconds: ${seconds} (类型: ${typeof seconds})`);
    console.log(`   size: ${size}`);
    console.log(`   input_reference: ${input_reference ? `已提供 (${(input_reference.length / 1024).toFixed(2)} KB)` : '未提供'}`);
    console.log(`   character_url: ${character_url || '未提供'}`);
    console.log(`   character_timestamps: ${character_timestamps || '未提供'}`);

    // 创建视频生成任务（文档：multipart/form-data，prompt/model/size/seconds/input_reference/character_*）
    const videoTask = await client.createVideo({
      prompt,
      model,
      seconds,
      size,
      input_reference: input_reference as Buffer | undefined,
      character_url,
      character_timestamps,
    });

    // 创建进度流（轮询任务状态）
    const progressStream = this.createVideoProgressStream(videoTask.id, client);

    return {
      mediaUrls: [], // 初始为空，完成后会更新
      metadata: {
        model: modelName,
        provider: this.provider,
        taskId: videoTask.id,
        status: videoTask.status,
        progress: videoTask.progress,
      },
      progress: progressStream,
    };
  }

  /**
   * 创建视频生成进度流
   */
  private async *createVideoProgressStream(videoId: string, client: DeerAPIClient): AsyncIterable<ProgressEvent> {
    // 视频生成平均 5–15 分钟，高峰期可能 1–3 小时，使用较长轮询避免误判超时
    // 180 次 * 60 秒 = 10800 秒 = 3 小时
    const maxAttempts = 180; // 最多轮询 180 次（约 3 小时）
    const pollInterval = 60000; // 每 60 秒（1 分钟）轮询一次

    let attempt = 0;
    let lastProgress = 0;

    while (attempt < maxAttempts) {
      try {
        const status = await client.getVideoStatusUnified(videoId);

        // 更新进度
        const currentProgress = status.progress || 0;
        if (currentProgress > lastProgress) {
          yield {
            status: 'processing' as ProgressStatus,
            progress: currentProgress,
            logs: [`视频生成中: ${currentProgress}%`],
          };
          lastProgress = currentProgress;
        }

        // 检查状态
        if (status.status === 'completed') {
          console.log(`[Deer Provider] ✅ 检测到视频任务已完成 (${videoId})`);
          console.log(`[Deer Provider] 状态详情:`, JSON.stringify(status, null, 2));
          
          // 优先使用 /v1/videos/{id} 或逆向响应中的 video_url
          if (status.video_url && typeof status.video_url === 'string') {
            console.log(`[Deer Provider] ✅ 视频 URL 已获取: ${status.video_url.substring(0, 80)}...`);
            yield {
              status: 'succeeded' as ProgressStatus,
              progress: 100,
              logs: ['视频生成完成'],
              output: {
                mediaUrls: [status.video_url],
                metadata: {
                  videoId,
                  videoUrl: status.video_url,
                },
              },
            };
            console.log(`[Deer Provider] ✅ 已发送 succeeded 事件，包含 video_url`);
            return;
          }

          // 没有拿到 video_url，只标记任务成功，不附带 URL
          console.warn(`[Deer Provider] ⚠️  视频任务完成，但未返回 video_url`);
          console.warn(`[Deer Provider] 完整状态对象:`, JSON.stringify(status, null, 2));
          yield {
            status: 'succeeded' as ProgressStatus,
            progress: 100,
            logs: ['视频生成完成，但未返回视频 URL'],
          };
          return;
        }

        if (status.status === 'failed') {
          yield {
            status: 'failed' as ProgressStatus,
            progress: status.progress || 0,
            error: status.error ? JSON.stringify(status.error) : '视频生成失败',
          };
          return;
        }

        // 继续轮询
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        attempt++;
      } catch (error) {
        console.error(`[Deer Provider] ❌ 查询视频状态失败 (${videoId}):`, error);
        console.error(`[Deer Provider] 错误详情:`, error instanceof Error ? error.stack : String(error));
        console.error(`[Deer Provider] 当前轮询次数: ${attempt}/${maxAttempts}, 最后进度: ${lastProgress}%`);
        yield {
          status: 'failed' as ProgressStatus,
          progress: lastProgress,
          error: error instanceof Error ? error.message : String(error),
        };
        return;
      }
    }

    // 超时
    yield {
      status: 'failed' as ProgressStatus,
      progress: lastProgress,
      error: '视频生成超时',
    };
  }

  /**
   * 生成 Runway 视频（通过 DeerAPI 调用 Runway API）
   * 支持统一接口，根据参数自动选择调用方式
   */
  private async generateRunwayVideo(
    modelName: string,
    params: GenerateParams,
    client: DeerAPIClient,
  ): Promise<GenerateResult> {
    const videoParams = params.parameters || {};

    // 根据模型类型或 mode 参数自动选择接口
    let taskId: string;
    let mode: string;
    
    // 统一接口：根据 parameters.mode 或参数自动判断
    if (modelName !== 'runway') {
      throw new Error(`不支持的 Runway 模型: ${modelName}`);
    }

    const detectedMode = videoParams.mode as string;
    
    // 优先检查是否有 promptImage（图片转视频）
    // 必须优先于其他判断，避免错误地回退到文本转视频
    // 即使同时提供了 prompt 和 promptImage，也应该使用图片转视频
    let requestedDuration: number | undefined;

    if (videoParams.promptImage || detectedMode === 'image-to-video') {
      // Image to Video
      mode = 'image-to-video';
      const promptImage = videoParams.promptImage as string;
      if (!promptImage) {
        throw new Error('promptImage 参数是必需的（图片转视频）');
      }

      // promptText 是可选的，如果没有提供 prompt，则不传递 promptText
      const promptText = params.prompt && params.prompt.trim() !== '' 
        ? params.prompt 
        : undefined;

      // 记录传入的 duration 参数
      const durationParam = videoParams.duration as number | undefined;
      console.log(`[Deer Provider] 接收到的 duration 参数: ${durationParam} (类型: ${typeof durationParam})`);
      
      // duration 必须是 5, 6, 7, 8, 9, 10 之一，如果不在范围内则使用默认值 10
      const validDuration = durationParam && [5, 6, 7, 8, 9, 10].includes(durationParam) 
        ? (durationParam as 5 | 6 | 7 | 8 | 9 | 10)
        : undefined;
      requestedDuration = validDuration ?? durationParam;
      
      const runwayTask = await client.createRunwayImageToVideo({
        model: (videoParams.model as any) || 'gen3a_turbo', // 默认使用 gen3a_turbo（根据文档）
        promptImage,
        ratio: (videoParams.ratio as any) || '1280:720',
        promptText: promptText, // 可选，只有提供时才传递
        seed: videoParams.seed as number | undefined,
        duration: validDuration,
        watermark: videoParams.watermark as boolean | undefined,
        contentModeration: videoParams.contentModeration as any,
      });
      taskId = runwayTask.id;
      console.log(`[Deer Provider] 图片转视频任务已创建，TaskId: ${taskId}, duration: ${durationParam}`);
    } else if (detectedMode === 'video-to-video' || videoParams.videoUri) {
      // Video to Video
      mode = 'video-to-video';
      const videoUri = videoParams.videoUri as string;
      if (!videoUri) {
        throw new Error('videoUri 参数是必需的（视频转视频）');
      }

      const runwayTask = await client.createRunwayVideoToVideo({
        videoUri,
        ratio: (videoParams.ratio as any) || '1280:720',
        promptText: params.prompt,
        seed: videoParams.seed as number | undefined,
        duration: (videoParams.duration && [5, 6, 7, 8, 9, 10].includes(videoParams.duration as number))
          ? (videoParams.duration as 5 | 6 | 7 | 8 | 9 | 10)
          : undefined,
        references: videoParams.references as any,
      });
      taskId = runwayTask.id;
      requestedDuration =
        (videoParams.duration && [5, 6, 7, 8, 9, 10].includes(videoParams.duration as number))
          ? (videoParams.duration as number)
          : (videoParams.duration as number | undefined);
    } else {
      // 如果既没有 promptImage 也没有 videoUri，抛出错误
      // Runway 不支持纯文本转视频
      throw new Error('Runway 不支持纯文本转视频。必须提供 promptImage（图片转视频）或 videoUri（视频转视频）');
    }

    // 创建进度流（轮询任务状态）
    const progressStream = this.createRunwayVideoProgressStream(taskId, client);

    return {
      mediaUrls: [], // 初始为空，完成后会更新
      metadata: {
        model: modelName,
        provider: this.provider,
        taskId,
        status: 'queued',
        mode, // 记录使用的模式
        ...(typeof requestedDuration === 'number' && requestedDuration > 0
          ? { duration: requestedDuration }
          : {}),
      },
      progress: progressStream,
    };
  }

  /**
   * 创建 Runway 视频生成进度流
   */
  private async *createRunwayVideoProgressStream(taskId: string, client: DeerAPIClient): AsyncIterable<ProgressEvent> {
    const maxAttempts = 720; // 最多轮询 720 次（约 60 分钟，每 5 秒一次）
    const pollInterval = 5000; // 每 5 秒轮询一次
    const initialDelay = 15000; // 首次查询前等待 15 秒（任务创建后可能需要更长时间才能在系统中注册）

    let attempt = 0;
    let lastProgress = 0;

    // 首次查询前等待更长时间（任务创建后可能需要时间才能在系统中注册）
    console.log(`[Deer Provider] 等待 ${initialDelay}ms 后开始查询任务状态（任务可能需要时间在系统中注册）...`);
    await new Promise(resolve => setTimeout(resolve, initialDelay));

    while (attempt < maxAttempts) {
      try {
        // 使用 Runway API 查询任务状态
        console.log(`[Deer Provider] 第 ${attempt + 1} 次查询任务状态 (TaskId: ${taskId})`);
        const taskStatus = await client.getRunwayTaskStatus(taskId);
        
        // 映射 Runway 状态到我们的任务系统状态
        // Runway 状态：PENDING, RUNNING, SUCCEEDED, FAILED, CANCELLED
        // 我们的状态：queued, in_progress, completed, failed
        let status: 'queued' | 'in_progress' | 'completed' | 'failed';
        let progress = lastProgress;
        
        if (taskStatus.status === 'SUCCEEDED') {
          status = 'completed';
          progress = 100;
        } else if (taskStatus.status === 'FAILED' || taskStatus.status === 'CANCELLED') {
          status = 'failed';
          progress = Math.max(lastProgress, 0);
        } else if (taskStatus.status === 'RUNNING') {
          status = 'in_progress';
          // Runway 不提供进度百分比，我们根据时间估算（逐步增加）
          progress = Math.min(90, lastProgress + 5);
        } else if (taskStatus.status === 'PENDING') {
          status = 'queued';
          progress = Math.min(10, lastProgress + 2);
        } else {
          // 未知状态，默认为 queued
          status = 'queued';
          progress = Math.min(10, lastProgress + 2);
        }
        
        // 提取视频 URL（output 是数组，取第一个）
        let videoUrl: string | undefined;
        if (taskStatus.output) {
          if (Array.isArray(taskStatus.output) && taskStatus.output.length > 0) {
            videoUrl = taskStatus.output[0];
          } else if (typeof taskStatus.output === 'string') {
            videoUrl = taskStatus.output;
          }
        }
        
        const statusObj = {
          status,
          progress,
          video_url: videoUrl,
          error: taskStatus.error,
          createdAt: taskStatus.createdAt,
        };
        
        console.log(`[Deer Provider] 任务状态: ${taskStatus.status} -> ${status}, 进度: ${progress}%`);
        if (videoUrl) {
          console.log(`[Deer Provider] 视频 URL: ${videoUrl.substring(0, 80)}...`);
        }

        // 更新进度
        // 即使进度没有变化，也要定期 yield（每 12 次，约 1 分钟）以更新任务的 updatedAt
        // 这样可以防止任务恢复服务误判为超时
        const currentProgress = statusObj.progress || 0;
        const shouldYield = currentProgress > lastProgress || 
                           status !== (lastProgress === 0 ? 'queued' : 'in_progress') ||
                           (attempt % 12 === 0); // 每 12 次（约 1 分钟）至少 yield 一次
        
        if (shouldYield) {
          const statusText = status === 'queued' ? '排队中' : status === 'in_progress' ? '生成中' : status;
          yield {
            status: status === 'queued' ? 'starting' as ProgressStatus : 'processing' as ProgressStatus,
            progress: currentProgress,
            logs: [`Runway 视频${statusText}: ${currentProgress}%`],
          };
          if (currentProgress > lastProgress) {
            lastProgress = currentProgress;
          }
        }

        // 检查状态
        if (statusObj.status === 'completed') {
          if (statusObj.video_url && typeof statusObj.video_url === 'string') {
            console.log(`[Deer Provider] ✅ 视频生成成功！URL: ${statusObj.video_url}`);
            yield {
              status: 'succeeded' as ProgressStatus,
              progress: 100,
              logs: ['Runway 视频生成完成'],
              output: {
                mediaUrls: [statusObj.video_url],
                metadata: {
                  taskId,
                  videoUrl: statusObj.video_url,
                  createdAt: statusObj.createdAt,
                  runwayTaskId: taskId, // 保存 Runway 任务 ID
                },
              },
            };
            return;
          }

          console.warn(`[Deer Provider] ⚠️  视频生成完成，但未返回视频 URL`);
          yield {
            status: 'succeeded' as ProgressStatus,
            progress: 100,
            logs: ['Runway 视频生成完成，但未返回视频 URL'],
            output: {
              mediaUrls: [],
              metadata: {
                taskId,
                createdAt: statusObj.createdAt,
              },
            },
          };
          return;
        }

        if (statusObj.status === 'failed') {
          const errorMessage = statusObj.error 
            ? (typeof statusObj.error === 'string' 
                ? statusObj.error 
                : JSON.stringify(statusObj.error))
            : 'Runway 视频生成失败';
          console.error(`[Deer Provider] ❌ 视频生成失败: ${errorMessage}`);
          yield {
            status: 'failed' as ProgressStatus,
            progress: statusObj.progress || 0,
            error: errorMessage,
          };
          return;
        }

        // 继续轮询
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        attempt++;
      } catch (error: any) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[Deer Provider] 查询 Runway 视频状态失败 (尝试 ${attempt + 1}/${maxAttempts}):`, errorMessage);
        
        // 检查是否是 task_not_exist 错误（可能有多种格式）
        const isTaskNotExist = 
          errorMessage.includes('task_not_exist') || 
          errorMessage.includes('任务不存在') ||
          error?.code === 'TASK_NOT_EXIST' ||
          error?.status === 404;
        
        // 如果是任务不存在错误，可能是任务还未创建完成，继续重试（最多重试 20 次）
        if (isTaskNotExist && attempt < 20) {
          // 使用指数退避：前几次快速重试，后面逐渐增加间隔
          const baseDelay = attempt < 5 ? 5000 : 10000; // 前 5 次 5 秒，之后 10 秒
          const waitTime = Math.min(baseDelay * Math.pow(1.3, Math.max(0, attempt - 5)), 30000); // 最多 30 秒
          console.log(`[Deer Provider] 任务可能还未在系统中注册，等待 ${waitTime}ms 后重试 (${attempt + 1}/20)...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          attempt++;
          continue;
        }
        
        // 如果是 HTML 响应错误（说明路径不对）
        if (errorMessage.includes('HTML') || errorMessage.includes('<!DOCTYPE')) {
          console.error(`[Deer Provider] 查询路径返回了 HTML，说明路径可能不正确`);
          yield {
            status: 'failed' as ProgressStatus,
            progress: lastProgress,
            error: '查询任务状态失败：API 路径可能不正确，返回了 HTML 而不是 JSON',
          };
          return;
        }
        
        // 其他错误或重试次数过多，返回失败
        yield {
          status: 'failed' as ProgressStatus,
          progress: lastProgress,
          error: errorMessage,
        };
        return;
      }
    }

    // 超时
    yield {
      status: 'failed' as ProgressStatus,
      progress: lastProgress,
      error: 'Runway 视频生成超时',
    };
  }
}

