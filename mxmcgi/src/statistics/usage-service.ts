import type { GenerateResult, ProviderType } from '../models/providers';
import { getSupabaseClient } from '@mxmai/mxmdata';
import { inferUsageScope, resolveUsagePricingModelKey } from '../core/usage/pricing-lookup';
import { ProviderBalanceService, PRICING_ERROR_MSG } from './provider-balance-service';
import { type UsageContext, usageContextToRecord } from './usage-context';

export interface LogProviderUsageParams {
  taskId?: string;
  userId?: string;
  logicalModel?: string;
  /** cgi_tasks.task_type，用于 video 等避免误判为 scope=text */
  taskType?: string;
  result: GenerateResult;
  /**
   * 显式指定 provider（如存在覆盖）
   */
  providerOverride?: ProviderType;
  /** web / open_api 及第三方标识 */
  usageContext?: UsageContext;
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
    const { taskId, userId, logicalModel, taskType, result, providerOverride, usageContext } = params;

    try {
      const metadata = (result.metadata || {}) as Record<string, unknown>;
      const provider = (metadata.provider || providerOverride) as ProviderType | undefined;

      if (!provider) {
        throw new Error('服务价格报错，请联系管理人员');
      }

      const scope = inferUsageScope(metadata, { taskType, logicalModel });
      const modelKey = await resolveUsagePricingModelKey(provider, metadata, logicalModel, scope);

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
      let durationRaw =
        metadata.duration ??
        metadata.duration_sec ??
        metadata.seconds ??
        undefined;
      if (scope === 'video' && (durationRaw == null || Number(durationRaw) <= 0) && taskId) {
        try {
          const { taskExecutor } = await import('../task/task-executor');
          const snap = await taskExecutor.getTaskManager().getTask(taskId, true);
          const rp = snap?.task?.requestParams as Record<string, unknown> | undefined;
          const inner = rp?.params as Record<string, unknown> | undefined;
          durationRaw =
            inner?.duration ??
            inner?.total_duration_seconds ??
            inner?.chunk_seconds ??
            rp?.duration;
        } catch {
          // ignore
        }
      }
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

      Object.assign(payload, usageContextToRecord(usageContext));

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
      // 订阅类 provider（如 maxplan）不参与按量扣费
      const SUBSCRIPTION_PROVIDERS = new Set(['maxplan']);
      let costUsd = 0;
      if (!SUBSCRIPTION_PROVIDERS.has(provider)) {
        costUsd = await ProviderBalanceService.deductFromUsage({
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
      }
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

  static inferScopePublic(
    modelKey: string,
    metadata: Record<string, any>,
    taskType?: string
  ): string {
    return inferUsageScope(metadata, { logicalModel: modelKey, taskType });
  }
}

