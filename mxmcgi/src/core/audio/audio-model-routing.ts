/**
 * Audio 业务模型路由
 * 优先查 audio_scope_config（精确 task_key + sub_type）
 * 找不到则 fallback 到 task_key + 'default'
 */

import type { ProviderType } from '../providers';
import { RepositoryFactory } from '@mxmai/mxmdata';

export async function resolveAudioModel(
  taskKey: string,
  subType?: string
): Promise<{ modelName: string; provider: ProviderType; fromDb: boolean }> {
  const effectiveSubType = (!subType || subType === 'undefined') ? 'default' : subType;

  try {
    const repo = RepositoryFactory.createAudioScopeConfigRepository();

    let cfg = await repo.findConfig('audio', taskKey, effectiveSubType);
    console.log(`[AudioModelRouting] findConfig('audio', '${taskKey}', '${effectiveSubType}') =>`, cfg ? `found model=${cfg.model}, provider=${cfg.provider}` : 'NOT FOUND');

    if (!cfg && effectiveSubType !== 'default') {
      cfg = await repo.findConfig('audio', taskKey, 'default');
      console.log(`[AudioModelRouting] fallback findConfig('audio', '${taskKey}', 'default') =>`, cfg ? `found model=${cfg.model}, provider=${cfg.provider}` : 'NOT FOUND');
    }

    if (cfg && cfg.enabled) {
      return {
        modelName: cfg.model,
        provider: (cfg.provider as ProviderType) || 'minimax',
        fromDb: true,
      };
    }
  } catch (e) {
    console.warn('[AudioModelRouting] 查询 audio_scope_config 失败:', e);
  }

  throw new Error(
    `未配置音频业务模型: audio-${taskKey}-${effectiveSubType}。请在 Admin 配置该业务的模型路由。`
  );
}
