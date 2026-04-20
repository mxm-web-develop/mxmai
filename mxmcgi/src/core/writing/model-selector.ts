/**
 * 模型选择器
 * 根据任务类型自动选择最适合的 LLM 模型
 *
 * 【任务类型说明】
 * - outline：生成大纲。用户选择「写大纲」或写作类型为 outlines 时使用；需要模型逻辑性强、结构化输出好（章节/节点 JSON）。
 * - paragraph：按段落展开。有大纲时，按大纲的每个章节/段落逐段生成正文；可能多段并行，优先流畅、速度。
 * - full：一次性生成整篇。无大纲时（如分镜脚本不传 outlines）整篇内容一次生成；需要综合能力强、单次生成长文本。
 *
 * 【配置来源】优先按业务 key 从 model-routing 解析 (provider, model)；未命中时用 WRITING_MODEL_SELECTION。
 */

import { getResolvedRouting, type ProviderType } from '../../models/providers';
import { WRITING_MODEL_SELECTION, type TaskType } from './wtconfigs/writing-models';

export type { TaskType };

const MODEL_SELECTION = WRITING_MODEL_SELECTION;

/**
 * 兼容旧调用：过去按 taskType 在代码内选择候选模型。
 * 纯动态模式下不再允许静态候选兜底；请在 Admin/DB 配置对应业务 key 的模型路由。
 */
export function selectModel(taskType: TaskType): string {
  const candidates = MODEL_SELECTION[taskType] ?? [];
  throw new Error(
    `[ModelSelector] 纯动态模式下禁止 selectModel(taskType=${taskType}) 静态选模` +
      (candidates.length ? `，历史候选: ${candidates.join(', ')}` : '') +
      `。请在 Admin 配置模型路由（model_routing_overrides）`
  );
}

export interface ResolvedModel {
  provider: ProviderType;
  model: string;
  modelName: string;
  fromRouting: boolean;
}

/**
 * 按业务 key 解析 provider + 模型，未命中路由时回退到按任务类型选模型
 * 用于四步流程：业务接口 → 解析 Admin 配置的 provider/model → 提示词 → 调用模型
 * 大纲任务：
 * - 当 businessKey 显式为 `outline-*` 时使用 Admin 的 outline-* 路由
 * - 否则回退到 writing-outlines（兼容旧逻辑）
 */
export function selectModelWithRouting(
  businessKey: string,
  taskType: TaskType,
  preferredProvider?: ProviderType
): ResolvedModel {
  // outline 任务默认仍走 writing-outlines，但当 businessKey 明确为 outline-* 时，使用显式路由key。
  const routingKey =
    taskType === 'outline'
      ? businessKey.startsWith('outline-')
        ? businessKey
        : 'writing-outlines'
      : businessKey;
  const resolved = getResolvedRouting(routingKey, preferredProvider);
  if (resolved.fromRouting) {
    console.log(`[ModelSelector] 业务 key "${businessKey}" 使用路由: provider=${resolved.provider}, model=${resolved.model}`);
    return {
      provider: resolved.provider,
      model: resolved.model,
      modelName: resolved.model,
      fromRouting: true,
    };
  }
  // 纯动态模式：不再允许代码内候选模型兜底（必须在 Admin/DB 配置路由）
  const fallbackCandidates = MODEL_SELECTION[taskType];
  throw new Error(
    `[ModelSelector] 未配置模型路由: routingKey=${routingKey}（taskType=${taskType}）` +
      (fallbackCandidates?.length ? `，历史候选: ${fallbackCandidates.join(', ')}` : '')
  );
}

/**
 * 获取指定任务类型的候选模型列表
 */
export function getCandidateModels(taskType: TaskType): string[] {
  return [...MODEL_SELECTION[taskType]];
}

