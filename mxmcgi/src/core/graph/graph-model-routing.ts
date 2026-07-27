import type { ProviderType } from '../providers';
import { RepositoryFactory } from '@mxmai/mxmdata';

/** DB `graph_scope_config.task_key`：与任务定义 `scope=graph` 的 taskKey 一致，不限于三条固定业务线 */
export type GraphTaskKey = string;

export interface GraphModelRoutingEntry {
  provider: ProviderType;
  model: string;
}

/**
 * 解析 Graph 业务模型路由
 * 优先查 graph_scope_config（精确 task_key + sub_type）
 * 找不到则 fallback 到 task_key + 'default'
 */
export async function resolveGraphModel(
  graphTaskKey: GraphTaskKey,
  subType: string,
  preferredProvider?: ProviderType
): Promise<{ modelName: string; provider: ProviderType; fromDb: boolean }> {
  const key = `graph-${graphTaskKey}-${subType}`;

  // 规范化 subType：空/undefined → 'default'
  const effectiveSubType = (!subType || subType === 'undefined') ? 'default' : subType;

  try {
    const repo = RepositoryFactory.createGraphScopeConfigRepository();

    // 精确查询
    let cfg = await repo.findConfig('graph', graphTaskKey, effectiveSubType);
    console.log(`[GraphModelRouting] findConfig('graph', '${graphTaskKey}', '${effectiveSubType}') =>`, cfg ? `found model=${cfg.model}, provider=${cfg.provider}` : 'NOT FOUND');

    // fallback: subType 非 'default' 时查 'default' 兜底
    if (!cfg && effectiveSubType !== 'default') {
      cfg = await repo.findConfig('graph', graphTaskKey, 'default');
      console.log(`[GraphModelRouting] fallback findConfig('graph', '${graphTaskKey}', 'default') =>`, cfg ? `found model=${cfg.model}, provider=${cfg.provider}` : 'NOT FOUND');
    }

    if (cfg && cfg.enabled) {
      return {
        modelName: cfg.model,
        provider: (preferredProvider ?? (cfg.provider as ProviderType)) || 'qhai',
        fromDb: true,
      };
    }
  } catch (e) {
    console.warn('[GraphModelRouting] 查询 graph_scope_config 失败:', e);
  }

  throw new Error(
    `未配置图像业务模型: ${key}（graphTaskKey=${graphTaskKey}, subType=${effectiveSubType}）。请在 Admin 配置该业务的模型路由。`
  );
}

