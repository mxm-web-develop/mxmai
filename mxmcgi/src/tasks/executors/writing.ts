import type { ProviderType } from '../../models/providers';
import { getResolvedRouting } from '../../models/providers';
import { runByModelKey } from '../../models/run';

export async function runWritingTask(params: {
  taskKey: string;
  prompt: string;
  providerOverride?: string;
  extraParams?: Record<string, unknown>;
}): Promise<unknown> {
  const { taskKey, prompt, providerOverride, extraParams } = params;

  // Task v2 的 taskKey = prompt_engineering_config.type（如 outlines/articles...）
  // 现有路由表使用 writing-xxx 作为业务逻辑模型名（如 writing-outlines）
  const routingKey = taskKey.startsWith('writing-') ? taskKey : `writing-${taskKey}`;
  const resolved = getResolvedRouting(routingKey);
  const provider = (providerOverride || resolved.provider) as ProviderType;
  const modelKey = resolved.model; // 物理模型 key（writing scope）

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

