import type { ProviderType } from '../../models/providers';
import { resolveWritingModel } from '../../core/writing/writing-model-routing';
import { runByModelKey } from '../../models/run';

export async function runWritingTask(params: {
  taskKey: string;
  prompt: string;
  providerOverride?: string;
  extraParams?: Record<string, unknown>;
}): Promise<unknown> {
  const { taskKey, prompt, providerOverride, extraParams } = params;

  // Task v2 的 taskKey = prompt_engineering_config.type（如 outlines/articles...）
  const resolved = await resolveWritingModel(taskKey, 'default');
  const provider = (providerOverride || resolved.provider) as ProviderType;
  const modelKey = resolved.modelName; // 物理模型 key（writing scope）

  const result = await runByModelKey(
    'writing',
    modelKey,
    {
      ...(extraParams || {}),
      prompt,
      outputFormat: (extraParams as any)?.outputFormat ?? 'json',
    },
    { providerOverride: provider }
  );

  return result;
}

