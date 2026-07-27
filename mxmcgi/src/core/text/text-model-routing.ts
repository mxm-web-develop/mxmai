/**
 * Text 业务模型路由
 * 优先查 text_scope_config（精确 task_key + sub_type）
 * 找不到则 fallback 到 task_key + 'default'
 */

import type { ProviderType } from '../providers';
import { resolveDefaultLlmProvider } from '../../config/default-llm';
import { RepositoryFactory } from '@mxmai/mxmdata';
import { ConfigurationError } from '../../tasks/errors';

export async function resolveTextModel(
  taskKey: string,
  subType?: string
): Promise<{ modelName: string; provider: ProviderType; fromDb: boolean }> {
  const effectiveSubType = (!subType || subType === 'undefined') ? 'default' : subType;

  try {
    const repo = RepositoryFactory.createTextScopeConfigRepository();

    let cfg = await repo.findConfig('text', taskKey, effectiveSubType);
    console.log(`[TextModelRouting] findConfig('text', '${taskKey}', '${effectiveSubType}') =>`, cfg ? `found model=${cfg.model}, provider=${cfg.provider}` : 'NOT FOUND');

    if (!cfg && effectiveSubType !== 'default') {
      cfg = await repo.findConfig('text', taskKey, 'default');
      console.log(`[TextModelRouting] fallback findConfig('text', '${taskKey}', 'default') =>`, cfg ? `found model=${cfg.model}, provider=${cfg.provider}` : 'NOT FOUND');
    }

    if (cfg && cfg.enabled) {
      return {
        modelName: cfg.model,
        provider: (cfg.provider as ProviderType) || resolveDefaultLlmProvider(),
        fromDb: true,
      };
    }
  } catch (e) {
    console.warn('[TextModelRouting] 查询 text_scope_config 失败:', e);
  }

  throw new ConfigurationError(
    `未配置 Text 业务模型: text-${taskKey}-${effectiveSubType}。请在 Admin「模型与定价」保存该业务的 provider/model（写入 text_scope_config）。`
  );
}
