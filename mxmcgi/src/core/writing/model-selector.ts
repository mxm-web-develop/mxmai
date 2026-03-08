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

import { providerFactory, getResolvedRouting, type ProviderType } from '../../models/providers';
import { WRITING_MODEL_SELECTION, type TaskType } from './wtconfigs/writing-models';

export type { TaskType };

const MODEL_SELECTION = WRITING_MODEL_SELECTION;

/**
 * 检查模型是否可用
 */
function isModelAvailable(modelName: string): boolean {
  try {
    const provider = providerFactory.getProviderForModel(modelName);
    return !!provider;
  } catch (error) {
    return false;
  }
}

/**
 * 根据任务类型选择模型（仅返回模型名，兼容旧调用）
 * @param taskType 任务类型
 * @returns 模型名称
 */
export function selectModel(taskType: TaskType): string {
  const candidates = MODEL_SELECTION[taskType];

  for (const model of candidates) {
    if (isModelAvailable(model)) {
      console.log(`[ModelSelector] 为任务类型 "${taskType}" 选择模型: ${model}`);
      return model;
    }
  }

  console.warn(`[ModelSelector] 警告：任务类型 "${taskType}" 的所有候选模型都不可用，使用默认: ${candidates[0]}`);
  return candidates[0];
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
 * 大纲任务统一用 writing-outlines 做路由 key，使 Admin 的「大纲模型」配置生效（与 applyto 无关）
 */
export function selectModelWithRouting(
  businessKey: string,
  taskType: TaskType,
  preferredProvider?: ProviderType
): ResolvedModel {
  const routingKey = taskType === 'outline' ? 'writing-outlines' : businessKey;
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
  const modelName = selectModel(taskType);
  const prov = providerFactory.getProviderForModel(modelName, preferredProvider);
  return {
    provider: prov.provider,
    model: modelName,
    modelName,
    fromRouting: false,
  };
}

/**
 * 获取指定任务类型的候选模型列表
 */
export function getCandidateModels(taskType: TaskType): string[] {
  return [...MODEL_SELECTION[taskType]];
}

