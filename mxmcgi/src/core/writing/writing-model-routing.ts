/**
 * Writing 业务模型路由
 * 优先查 writing_scope_config（精确 task_key + sub_type）
 * 找不到则 fallback 到 task_key + 'default'
 * model 字段直接存物理模型，无需二次映射
 */

import type { ProviderType } from '../providers';
import { resolveDefaultLlmProvider } from '../../config/default-llm';
import { RepositoryFactory } from '@mxmai/mxmdata';

export async function resolveWritingModel(
  taskKey: string,
  subType?: string
): Promise<{ modelName: string; provider: ProviderType; fromDb: boolean }> {
  const effectiveSubType = (!subType || subType === 'undefined') ? 'default' : subType;

  try {
    const repo = RepositoryFactory.createWritingScopeConfigRepository();

    let cfg = await repo.findConfig('writing', taskKey, effectiveSubType);

    if (!cfg && effectiveSubType !== 'default') {
      cfg = await repo.findConfig('writing', taskKey, 'default');
    }

    if (cfg && cfg.enabled) {
      return {
        modelName: cfg.model,
        provider: (cfg.provider as ProviderType) || resolveDefaultLlmProvider(),
        fromDb: true,
      };
    }
  } catch (e) {
    console.warn('[WritingModelRouting] 查询 writing_scope_config 失败:', e);
  }

  throw new Error(
    `未配置写作业务模型: writing-${taskKey}-${effectiveSubType}。请在 Admin 配置该业务的模型路由。`
  );
}
