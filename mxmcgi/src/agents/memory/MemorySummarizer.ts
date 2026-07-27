/**
 * Memory Summarizer
 * 对话摘要生成器，用于将对话历史压缩为记忆片段
 */

import { runByModelKey } from '../../models/run';
import type { ConversationSummary, MemoryType } from './types';

export class MemorySummarizer {
  private defaultModel: string;

  constructor(defaultModel?: string) {
    this.defaultModel = defaultModel || 'GLM-5-Turbo';
  }

  /**
   * 生成对话摘要
   */
  async summarizeConversation(
    messages: Array<{ role: string; content: string }>,
    options?: { model?: string; context?: { user_preferences?: string[] } }
  ): Promise<ConversationSummary> {
    if (messages.length === 0) {
      return {
        summary: '',
        importance: 0,
        keywords: [],
        memory_type: 'context',
      };
    }

    const model = options?.model || this.defaultModel;

    // 构建摘要 prompt
    const conversationText = messages
      .map((m) => `[${m.role === 'user' ? '用户' : '助手'}]: ${m.content}`)
      .join('\n');

    const summaryPrompt = `你是一个对话摘要助手。请分析以下对话，生成一段简短的记忆摘要。

对话历史:
${conversationText}

请生成一段记忆摘要，包含:
1. 用户的主要需求或问题
2. 关键决策或答案
3. 相关偏好或事实信息（如果有）

要求:
- 摘要不超过100字
- 用第一人称"我"表述
- 只输出JSON格式，不要有其他内容

格式:
{
  "summary": "摘要内容",
  "importance": 1-10,
  "keywords": ["关键词1", "关键词2", "关键词3"],
  "memory_type": "summary|preference|fact|context"
}

请分析这段对话并生成JSON:`;

    try {
      const result = await runByModelKey('text', model, {
        prompt: summaryPrompt,
        outputFormat: 'json',
      }) as { text?: string } | string;

      const text = typeof result === 'string' ? result : result?.text || '';

      // 解析 JSON
      const parsed = this.parseSummaryResult(text);

      return {
        summary: parsed.summary,
        importance: Math.min(Math.max(parsed.importance, 1), 10),
        keywords: parsed.keywords,
        memory_type: this.inferMemoryType(messages, parsed),
      };
    } catch (error) {
      console.error('[MemorySummarizer] Failed to generate summary:', error);
      // Fallback: 简单拼接最后几条消息
      return {
        summary: messages.slice(-3).map((m) => m.content).join(' ').slice(0, 100),
        importance: 3,
        keywords: [],
        memory_type: 'context',
      };
    }
  }

  /**
   * 解析 LLM 返回的摘要结果
   */
  private parseSummaryResult(text: string): {
    summary: string;
    importance: number;
    keywords: string[];
    memory_type: MemoryType;
  } {
    try {
      // 尝试提取 JSON
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          summary: parsed.summary || '',
          importance: parsed.importance || 5,
          keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
          memory_type: ['summary', 'preference', 'fact', 'context'].includes(parsed.memory_type)
            ? parsed.memory_type
            : 'summary',
        };
      }
    } catch {
      // 解析失败，使用默认值
    }

    // 默认值
    return {
      summary: text.slice(0, 100),
      importance: 5,
      keywords: [],
      memory_type: 'summary',
    };
  }

  /**
   * 根据对话内容推断记忆类型
   */
  private inferMemoryType(
    messages: Array<{ role: string; content: string }>,
    parsed: { summary: string; importance: number; keywords: string[]; memory_type: MemoryType }
  ): MemoryType {
    const content = messages.map((m) => m.content).join('');

    // 检测偏好
    const preferenceKeywords = ['喜欢', '想要', '偏好', '希望', '倾向', '比较喜欢', '不喜欢'];
    if (preferenceKeywords.some((kw) => content.includes(kw))) {
      return 'preference';
    }

    // 检测事实
    const factKeywords = ['我的', '我是', '我在', '我有', '名字', '公司', '产品', '品牌', '职业'];
    if (factKeywords.some((kw) => content.includes(kw))) {
      return 'fact';
    }

    // 检测决策
    const decisionKeywords = ['决定了', '选择', '采用', '确定', '就这样', '行', '好的'];
    if (decisionKeywords.some((kw) => content.includes(kw))) {
      return 'summary';
    }

    // 默认
    return parsed.memory_type || 'context';
  }

  /**
   * 计算对话重要性评分
   */
  calculateImportance(messages: Array<{ role: string; content: string }>): number {
    let score = 3; // 基础分

    // 检测是否包含决策
    if (this.containsDecision(messages)) score += 3;

    // 检测偏好
    if (this.containsPreference(messages)) score += 2;

    // 检测事实信息
    if (this.containsFact(messages)) score += 2;

    // 对话轮数
    if (messages.length > 5) score += 2;

    return Math.min(score, 10);
  }

  private containsDecision(messages: Array<{ role: string; content: string }>): boolean {
    const decisionKeywords = ['决定了', '选择', '采用', '确定', '就这样', '行', '好的', '开始', '执行'];
    const content = messages.map((m) => m.content).join('');
    return decisionKeywords.some((kw) => content.includes(kw));
  }

  private containsPreference(messages: Array<{ role: string; content: string }>): boolean {
    const preferenceKeywords = ['喜欢', '想要', '偏好', '希望', '倾向', '比较喜欢', '不喜欢', '不要'];
    const content = messages.map((m) => m.content).join('');
    return preferenceKeywords.some((kw) => content.includes(kw));
  }

  private containsFact(messages: Array<{ role: string; content: string }>): boolean {
    const factKeywords = ['我的', '我是', '我在', '我有', '名字', '公司', '产品', '品牌'];
    const content = messages.map((m) => m.content).join('');
    return factKeywords.some((kw) => content.includes(kw));
  }
}
