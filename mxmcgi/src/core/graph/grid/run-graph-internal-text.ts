/**
 * Graph 宫格内部 text 调用（Planner 等）：进程内路由 + 扣费，关联 parentTaskId
 */
import { resolveTextModel } from '../../text/text-model-routing';
import { runByModelKey } from '../../../models/run';
import { UsageService } from '../../usage/usage-service';
import { BillingService } from '../../billing/billing-service';
import { resolveUsageContextFromTaskMetadata } from '../../../statistics/usage-context';
import { taskExecutor } from '../../../task/task-executor';
import type { ProviderType } from '../../providers/types';

export interface RunGraphInternalTextArgs {
  taskKey: string;
  subtype?: string | null;
  prompt: string;
  userId?: string;
  parentTaskId?: string;
  caller?: string;
}

export interface RunGraphInternalTextResult {
  text: string;
  costUsd: number;
}

export async function runGraphInternalText(
  args: RunGraphInternalTextArgs
): Promise<RunGraphInternalTextResult> {
  const { taskKey, subtype, prompt, userId, parentTaskId, caller } = args;
  const resolved = await resolveTextModel(taskKey, subtype ?? 'internal');
  const physicalModelKey = resolved.modelName;
  const provider = resolved.provider as ProviderType;

  const result = await runByModelKey(
    'text',
    physicalModelKey,
    {
      prompt,
      outputFormat: 'json' as const,
      useConfiguredPrompt: true,
    },
    { providerOverride: provider }
  );

  const taskId = parentTaskId ?? `grid-internal-${Date.now()}`;

  let usageContext = parentTaskId ? { parentTaskId } : undefined;
  if (parentTaskId) {
    try {
      const snap = await taskExecutor.getTaskManager().getTask(parentTaskId, true);
      usageContext = {
        ...resolveUsageContextFromTaskMetadata(snap?.task?.metadata as Record<string, unknown>),
        parentTaskId,
      };
    } catch {
      // keep parentTaskId only
    }
  }

  const { costUsd } = await UsageService.logProviderUsage({
    taskId,
    userId,
    logicalModel: `text-${taskKey}`,
    result,
    providerOverride: provider,
    usageContext,
  });

  const usage = result.metadata?.usage as Record<string, unknown> | undefined;
  if (userId) {
    try {
      await BillingService.consumeForTask({
        taskId,
        userId,
        provider,
        modelKey: physicalModelKey,
        scope: 'text',
        inputTokens: Number(usage?.prompt_tokens ?? usage?.input_tokens ?? 0),
        outputTokens: Number(usage?.completion_tokens ?? usage?.output_tokens ?? 0),
        requestCount: 1,
        providerCostUsd: costUsd,
        publishedSlug: usageContext?.publishedSlug,
        publishedApiId: usageContext?.publishedApiId,
        openApiCallerId: usageContext?.callerUserId,
      });
    } catch (e) {
      console.warn('[runGraphInternalText] billing failed:', e instanceof Error ? e.message : e);
    }
  }

  let text = (result as { text?: string }).text;
  if (!text && typeof result.metadata?.text === 'string') text = result.metadata.text;
  return { text: (text ?? '').trim(), costUsd };
}
