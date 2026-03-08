/**
 * Writing 模块使用的 LLM 模型配置
 * 与 model-routing 中的 writing-* 路由、routes/writing 的 MODEL_MAP 对齐。
 * 数组顺序 = 调用优先级（selectModel 取第一个可用）。
 */

export type TaskType = 'outline' | 'paragraph' | 'full';

export interface WritingModelSelection {
  /** 大纲生成：逻辑性强、结构化输出好 */
  outline: readonly string[];
  /** 段落展开：流畅、速度快，可多段并行 */
  paragraph: readonly string[];
  /** 整篇生成：综合能力强、长文本 */
  full: readonly string[];
}

/** 按任务类型的候选模型列表（顺序即优先级） */
export const WRITING_MODEL_SELECTION: WritingModelSelection = {
  outline: [
    'claude-4.5-sonnet',
    'gemini-3-pro',
    'gpt-5-2',
    'gpt-5-nano',
  ],
  paragraph: [
    'gpt-5-nano',
    'qwen3-30b',
    'claude-4.5-sonnet',
    'gemini-2-5-flash',
    'gpt-5-2',
  ],
  full: [
    'claude-4.5-sonnet',
    'gemini-3-pro',
    'gpt-5-2',
    'gpt-5-nano',
  ],
} as const;
