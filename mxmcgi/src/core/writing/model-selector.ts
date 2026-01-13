/**
 * 模型选择器
 * 根据任务类型自动选择最适合的 LLM 模型
 */

import { providerFactory } from '../providers';

/**
 * 模型选择配置（按优先级排序）
 */
const MODEL_SELECTION = {
  outline: [
    'claude-4.5-sonnet',  // 逻辑性强，结构化能力好
    'gemini-3-pro',       // 综合能力强
    'gpt-5-2',           // 备选
  ],
  paragraph: [
    'gpt-5-nano',        // 流畅性强，速度快
    'gemini-2-5-flash',  // 快速响应
    'qwen3-30b',         // 备选
  ],
  full: [
    'claude-4.5-sonnet', // 综合能力最强
    'gemini-3-pro',      // 备选
    'gpt-5-2',           // 备选
  ],
} as const;

export type TaskType = 'outline' | 'paragraph' | 'full';

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
 * 根据任务类型选择模型
 * @param taskType 任务类型
 * @returns 模型名称
 */
export function selectModel(taskType: TaskType): string {
  const candidates = MODEL_SELECTION[taskType];
  
  // 遍历候选模型，选择第一个可用的
  for (const model of candidates) {
    if (isModelAvailable(model)) {
      console.log(`[ModelSelector] 为任务类型 "${taskType}" 选择模型: ${model}`);
      return model;
    }
  }
  
  // 如果都不可用，使用第一个候选模型（让调用方处理错误）
  console.warn(`[ModelSelector] 警告：任务类型 "${taskType}" 的所有候选模型都不可用，使用默认: ${candidates[0]}`);
  return candidates[0];
}

/**
 * 获取指定任务类型的候选模型列表
 */
export function getCandidateModels(taskType: TaskType): string[] {
  return MODEL_SELECTION[taskType];
}

