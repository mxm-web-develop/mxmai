import type { GenerateResult, ProviderType } from '../models/providers';
import { getSupabaseClient } from '@mxmai/mxmdata';
import { ProviderBalanceService, PRICING_ERROR_MSG } from './provider-balance-service';

export interface LogProviderUsageParams {
  taskId?: string;
  userId?: string;
  logicalModel?: string;
  result: GenerateResult;
  /**
   * 显式指定 provider（如存在覆盖）
   */
  providerOverride?: ProviderType;
}

type UsageLike =
  | {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
      input_tokens?: number;
      output_tokens?: number;
    }
  | undefined;

export class UsageService {
  /**
   * 将一次模型调用的 usage 写入 provider_usage_records 表
   *
   * - 文本类：从 metadata.usage / result 中解析 token 用量
   * - 媒体类：从 mediaUrls 数量、metadata.duration 等推算
   */
  static async logProviderUsage(params: LogProviderUsageParams): Promise<{ costUsd: number }> {
    const { taskId, userId, logicalModel, result, providerOverride } = params;

    try {
      const metadata = result.metadata || {};
      const provider = (metadata.provider || providerOverride) as ProviderType | undefined;
      const modelKey = (metadata.model || logicalModel || 'unknown') as string;

      if (!provider) {
        throw new Error('服务价格报错，请联系管理人员');
      }

      // 推断 scope（写作 / 图像 / 音频 / 视频 / 文本）
      const scope = this.inferScope(logicalModel || modelKey, metadata);

      // 解析 usage
      const usage: UsageLike =
        (metadata.usage as UsageLike) ||
        // 向后兼容：部分 Provider 可能直接把 usage 挂在 result 上
        ((result as any).usage as UsageLike);

      let inputTokens = 0;
      let outputTokens = 0;
      let totalTokens = 0;

      if (usage) {
        // Deer / OpenAI 兼容字段
        const promptTokens =
          (usage as any).prompt_tokens ??
          (usage as any).input_tokens ??
          usage.prompt_tokens ??
          usage.input_tokens ??
          0;
        const completionTokens =
          (usage as any).completion_tokens ??
          (usage as any).output_tokens ??
          usage.completion_tokens ??
          usage.output_tokens ??
          0;
        const total =
          (usage as any).total_tokens ??
          usage.total_tokens ??
          (promptTokens && completionTokens ? promptTokens + completionTokens : 0);

        inputTokens = Number(promptTokens) || 0;
        outputTokens = Number(completionTokens) || 0;
        totalTokens = Number(total) || inputTokens + outputTokens;
      }

      // 图片张数、音频/视频时长等
      const mediaUrls = Array.isArray(result.mediaUrls) ? result.mediaUrls : [];
      const imageCount =
        scope === 'graph' || scope === 'image'
          ? mediaUrls.filter((u: any) => typeof u === 'string' && u.length > 0).length
          : 0;

      // 音频/视频时长优先从 metadata.duration / duration_sec 中取
      let audioSeconds = 0;
      let videoSeconds = 0;
      const durationRaw =
        (metadata as any).duration ??
        (metadata as any).duration_sec ??
        (metadata as any).seconds ??
        undefined;
      const duration = typeof durationRaw === 'number' ? durationRaw : Number(durationRaw) || 0;
      if (duration > 0) {
        if (scope === 'audio' || scope === 'music') {
          audioSeconds = duration;
        } else if (scope === 'video') {
          videoSeconds = duration;
        }
      }

      const supabase = getSupabaseClient();
      const payload: Record<string, any> = {
        provider,
        scope,
        model_key: modelKey,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
        image_count: imageCount,
        audio_seconds: audioSeconds,
        video_seconds: videoSeconds,
        request_count: 1,
        raw_usage: usage || null,
      };

      if (taskId) {
        payload.task_id = taskId;
      }
      if (userId) {
        payload.user_id = userId;
      }

      const { error } = await supabase.from('provider_usage_records').insert(payload);
      if (error) {
        console.warn('[UsageService] 写入 provider_usage_records 失败:', {
          code: error.code,
          message: error.message,
          details: error.details,
          provider,
          scope,
          modelKey,
          taskId,
        });
        throw new Error('服务价格报错，请联系管理人员');
      }
      if (process.env.NODE_ENV !== 'production') {
        console.log('[UsageService] ✅ 已记录 Provider Usage:', {
          provider,
          scope,
          modelKey,
          taskId,
          userId,
          inputTokens,
          outputTokens,
          totalTokens,
          imageCount,
          audioSeconds,
          videoSeconds,
        });
      }
      // 按 provider_pricing 计算成本并从 provider_balances 扣减（无定价/余额不足时抛错截断）
      const costUsd = await ProviderBalanceService.deductFromUsage({
        provider,
        model_key: modelKey,
        scope,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
        image_count: imageCount,
        audio_seconds: audioSeconds,
        video_seconds: videoSeconds,
        request_count: 1,
      });
      return { costUsd };
    } catch (err) {
      if (err instanceof Error && (err.message === PRICING_ERROR_MSG || err.message.startsWith('无定价记录') || err.message.startsWith('Provider 余额不足'))) {
        throw err;
      }
      const meta = result?.metadata || {};
      console.warn('[UsageService] 记录 Provider Usage 出错:', {
        err: err instanceof Error ? err.message : String(err),
        provider: meta.provider || providerOverride,
        modelKey: meta.model || logicalModel,
      });
      throw new Error(err instanceof Error ? err.message : '服务价格报错，请联系管理人员');
    }
  }

  static inferScopePublic(modelKey: string, metadata: Record<string, any>): string {
    return this.inferScope(modelKey, metadata);
  }

  private static inferScope(modelKey: string, metadata: Record<string, any>): string {
    // 优先从 logical model 前缀推断
    if (modelKey.startsWith('writing-')) return 'writing';
    if (modelKey.startsWith('outline-')) return 'outline';
    if (modelKey.startsWith('graph-') || modelKey.startsWith('image-')) return 'graph';
    if (modelKey.startsWith('audio-')) return 'audio';
    if (modelKey.startsWith('music-')) return 'music';
    if (modelKey.startsWith('video-')) return 'video';
    if (modelKey.startsWith('text-')) return 'text';

    const taskType = metadata.taskType || metadata.task_type;
    if (typeof taskType === 'string') {
      if (taskType === 'writing') return 'writing';
      if (taskType === 'outline') return 'outline';
      if (taskType === 'graph') return 'graph';
      if (taskType === 'audio') return 'audio';
      if (taskType === 'music') return 'music';
      if (taskType === 'video') return 'video';
      if (taskType === 'text') return 'text';
    }

    return 'text';
  }
}

