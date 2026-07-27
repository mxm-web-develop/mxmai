/**
 * Music 业务模型路由
 * 优先查 music_scope_config（精确 task_key + sub_type）
 * 找不到则 fallback 到 task_key + 'default'
 */

import type { ProviderType } from '../providers';
import { RepositoryFactory } from '@mxmai/mxmdata';

export async function resolveMusicModel(
  taskKey: string,
  subType?: string
): Promise<{ modelName: string; provider: ProviderType; fromDb: boolean }> {
  const effectiveSubType = (!subType || subType === 'undefined') ? 'default' : subType;

  try {
    const repo = RepositoryFactory.createMusicScopeConfigRepository();

    let cfg = await repo.findConfig('music', taskKey, effectiveSubType);
    console.log(`[MusicModelRouting] findConfig('music', '${taskKey}', '${effectiveSubType}') =>`, cfg ? `found model=${cfg.model}, provider=${cfg.provider}` : 'NOT FOUND');

    if (!cfg && effectiveSubType !== 'default') {
      cfg = await repo.findConfig('music', taskKey, 'default');
      console.log(`[MusicModelRouting] fallback findConfig('music', '${taskKey}', 'default') =>`, cfg ? `found model=${cfg.model}, provider=${cfg.provider}` : 'NOT FOUND');
    }

    if (cfg && cfg.enabled) {
      return {
        modelName: cfg.model,
        provider: (cfg.provider as ProviderType) || 'minimax',
        fromDb: true,
      };
    }
  } catch (e) {
    console.warn('[MusicModelRouting] 查询 music_scope_config 失败:', e);
  }

  throw new Error(
    `未配置音乐业务模型: music-${taskKey}-${effectiveSubType}。请在 Admin 配置该业务的模型路由。`
  );
}
