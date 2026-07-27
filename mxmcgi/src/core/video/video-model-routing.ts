/**
 * Video 业务模型路由
 * 优先查 video_scope_config（精确 task_key + sub_type）
 * 找不到则 fallback 到 task_key + 'default'
 */

import type { ProviderType } from '../providers';
import { RepositoryFactory } from '@mxmai/mxmdata';
import { isAutocutTaskKey } from './video-business-category';

export async function resolveVideoModel(
  taskKey: string,
  subType?: string
): Promise<{ modelName: string; provider: ProviderType; fromDb: boolean }> {
  const effectiveSubType = (!subType || subType === 'undefined') ? 'default' : subType;

  // 内部剪辑渲染编排器：不走外部视频模型
  if (isAutocutTaskKey(taskKey) && effectiveSubType === 'render') {
    return {
      modelName: 'video-edit-dispatcher',
      provider: 'internal',
      fromDb: false,
    };
  }

  try {
    const repo = RepositoryFactory.createVideoScopeConfigRepository();

    let cfg = await repo.findConfig('video', taskKey, effectiveSubType);
    console.log(`[VideoModelRouting] findConfig('video', '${taskKey}', '${effectiveSubType}') =>`, cfg ? `found model=${cfg.model}, provider=${cfg.provider}` : 'NOT FOUND');

    if (!cfg && effectiveSubType !== 'default') {
      cfg = await repo.findConfig('video', taskKey, 'default');
      console.log(`[VideoModelRouting] fallback findConfig('video', '${taskKey}', 'default') =>`, cfg ? `found model=${cfg.model}, provider=${cfg.provider}` : 'NOT FOUND');
    }

    if (cfg && cfg.enabled) {
      return {
        modelName: cfg.model,
        provider: (cfg.provider as ProviderType) || 'atlascloud',
        fromDb: true,
      };
    }
  } catch (e) {
    console.warn('[VideoModelRouting] 查询 video_scope_config 失败:', e);
  }

  throw new Error(
    `未配置视频业务模型: video-${taskKey}-${effectiveSubType}。请在 Admin 配置该业务的模型路由。`
  );
}
