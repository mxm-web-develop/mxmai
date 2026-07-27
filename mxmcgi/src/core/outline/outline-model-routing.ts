/**
 * Outline 业务模型路由
 * 优先查 outline_scope_config（精确 task_key + sub_type）
 * 找不到则 fallback 到 task_key + 'default'
 */

import type { ProviderType } from '../providers';
import { resolveDefaultLlmProvider } from '../../config/default-llm';
import { RepositoryFactory } from '@mxmai/mxmdata';

export async function resolveOutlineModel(
  taskKey: string,
  subType?: string
): Promise<{ modelName: string; provider: ProviderType; fromDb: boolean }> {
  const effectiveSubType = (!subType || subType === 'undefined') ? 'default' : subType;

  try {
    const repo = RepositoryFactory.createOutlineScopeConfigRepository();

    let cfg = await repo.findConfig('outline', taskKey, effectiveSubType);
    console.log(`[OutlineModelRouting] findConfig('outline', '${taskKey}', '${effectiveSubType}') =>`, cfg ? `found model=${cfg.model}, provider=${cfg.provider}` : 'NOT FOUND');

    if (!cfg && effectiveSubType !== 'default') {
      cfg = await repo.findConfig('outline', taskKey, 'default');
      console.log(`[OutlineModelRouting] fallback findConfig('outline', '${taskKey}', 'default') =>`, cfg ? `found model=${cfg.model}, provider=${cfg.provider}` : 'NOT FOUND');
    }

    if (cfg && cfg.enabled) {
      return {
        modelName: cfg.model,
        provider: (cfg.provider as ProviderType) || resolveDefaultLlmProvider(),
        fromDb: true,
      };
    }
  } catch (e) {
    console.warn('[OutlineModelRouting] 查询 outline_scope_config 失败:', e);
  }

  throw new Error(
    `未配置大纲业务模型: outline-${taskKey}-${effectiveSubType}。请在 Admin 配置该业务的模型路由。`
  );
}
