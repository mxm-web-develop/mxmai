import type { ProviderType } from '../providers';
import { RepositoryFactory } from '@mxmai/mxmdata';

export type GraphType = 'photograph' | 'design' | 'painting';

export interface GraphModelRoutingEntry {
  provider: ProviderType;
  model: string;
}

// 默认业务 → 模型 映射（仅当 DB graph_model_config 无配置时使用，无兜底，未配置则报错）
export const DEFAULT_GRAPH_MODEL_ROUTING: Record<string, GraphModelRoutingEntry> = {
  // 摄影（统一 nano-banana-2，需在 provider_pricing 配置对应定价）
  'graph-photograph-portrait': { provider: 'deer', model: 'nano-banana-2' },
  'graph-photograph-landscape': { provider: 'deer', model: 'nano-banana-2' },
  'graph-photograph-cinematic': { provider: 'deer', model: 'nano-banana-2' },
  'graph-photograph-commercial': { provider: 'deer', model: 'nano-banana-2' },
  'graph-photograph-documentary': { provider: 'deer', model: 'nano-banana-2' },

  // 设计
  'graph-design-3d': { provider: 'deer', model: 'nano-banana-2' },
  'graph-design-manual': { provider: 'deer', model: 'nano-banana-2' },
  'graph-design-poster': { provider: 'deer', model: 'nano-banana-2-pro' },
  'graph-design-icon': { provider: 'deer', model: 'nano-banana' },
  'graph-design-coverImage': { provider: 'deer', model: 'nano-banana-2-pro' },
  'graph-design-ui-design': { provider: 'deer', model: 'nano-banana-2' },

  // 绘画
  'graph-painting-illustration': { provider: 'deer', model: 'nano-banana-2' },
  'graph-painting-comic': { provider: 'deer', model: 'nano-banana-2' },
  'graph-painting-conceptArt': { provider: 'deer', model: 'nano-banana-2-pro' },
  'graph-painting-cartoon': { provider: 'deer', model: 'nano-banana-2' },
};

export async function resolveGraphModel(
  graphType: GraphType,
  subType: string,
  preferredProvider?: ProviderType
): Promise<{ modelName: string; provider: ProviderType; fromDb: boolean }> {
  const key = `graph-${graphType}-${subType}`;

  // 1. 优先尝试从 DB 读取 graph_model_config
  try {
    const repo = RepositoryFactory.createGraphModelConfigRepository();
    const cfg = await repo.findConfig('graph', graphType, subType);
    if (cfg && cfg.enabled) {
      return {
        modelName: cfg.logical_model,
        provider: (preferredProvider ?? (cfg.provider as ProviderType)) || 'deer',
        fromDb: true,
      };
    }
  } catch (e) {
    console.warn('[GraphModelRouting] 读取 graph_model_config 失败，使用默认配置:', e);
  }

  // 2. 使用默认映射（无兜底，未配置则直接报错）
  const def = DEFAULT_GRAPH_MODEL_ROUTING[key];
  if (def) {
    return {
      modelName: def.model,
      provider: preferredProvider ?? def.provider,
      fromDb: false,
    };
  }

  throw new Error(
    `未配置图像业务模型: ${key}（graphType=${graphType}, subType=${subType}）。请在 graph_model_config 表中配置该业务，或扩展 DEFAULT_GRAPH_MODEL_ROUTING，不允许使用兜底模型。`
  );
}

