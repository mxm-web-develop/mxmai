/**
 * 意图识别 Tool
 * 
 * LangChain Tool，用于从用户输入中识别业务意图
 */

import { Tool } from '@langchain/core/tools';
import { z } from 'zod';
import { BUSINESS_NODE_TEMPLATES, type BusinessNodeTemplate, type IntentMatch } from '../types';

/**
 * 意图识别 Tool
 * 
 * 输入：用户原始需求描述（中文）
 * 输出：识别到的业务节点列表（按置信度排序，取前3）
 */
export class IntentDetectionTool extends Tool {
  name = 'intent_detection';
  description = `识别用户需求的业务意图类型。输入用户的自然语言需求，返回匹配的业务节点。

适用场景：
- 用户说"帮我做..."、"生成..."、"创作..."等明确的生成需求
- 用户提到具体的产品类型（海报、视频、脚本、歌词等）
- 用户描述模糊时，返回可能的候选节点

输入格式：用户需求描述（中文）

输出格式：JSON数组，每个元素包含 nodeId, name, confidence(高/中/低), reason`;


  protected async _call(rawInput: string): Promise<string> {
    const userInput = rawInput.trim().toLowerCase();
    
    // 1. 精确关键词匹配
    const candidates: { template: BusinessNodeTemplate; score: number; reason: string }[] = [];
    
    for (const template of BUSINESS_NODE_TEMPLATES) {
      let score = 0;
      const matchedKeywords: string[] = [];
      
      for (const keyword of template.keywords) {
        const keywordLower = keyword.toLowerCase();
        if (userInput.includes(keywordLower)) {
          score += 10;
          matchedKeywords.push(keyword);
        }
      }
      
      // 额外加分：根据描述关键词匹配
      const descLower = template.description.toLowerCase();
      for (const keyword of template.keywords) {
        if (descLower.includes(keyword.toLowerCase()) && userInput.includes(keyword.toLowerCase())) {
          score += 3;
        }
      }
      
      // 高价值关键词加权
      const highValueKeywords = ['淘宝', '小红书', '抖音', '天猫', '电商', 'product', '口播', '脚本'];
      for (const kw of highValueKeywords) {
        if (userInput.includes(kw)) {
          score += 5;
        }
      }
      
      if (score > 0) {
        candidates.push({
          template,
          score,
          reason: `匹配关键词：${matchedKeywords.join('、')}（匹配度${score}分）`,
        });
      }
    }
    
    // 排序并取前3
    candidates.sort((a, b) => b.score - a.score);
    const topCandidates = candidates.slice(0, 3);
    
    if (topCandidates.length === 0) {
      // 无法识别，返回空结果
      return JSON.stringify({
        success: false,
        intent: null,
        candidates: [],
        message: '抱歉，我无法理解您的需求。您可以尝试说"帮我做海报"、"生成视频"、"写一段口播稿"等。',
      });
    }
    
    // 2. 构建意图结果
    const bestMatch = topCandidates[0];
    const confidence: IntentMatch['confidence'] =
      bestMatch.score >= 20 ? 'high' :
      bestMatch.score >= 10 ? 'medium' : 'low';
    
    const intent: IntentMatch = {
      confidence,
      nodeType: bestMatch.template.nodeType,
      subType: bestMatch.template.subType,
      template: bestMatch.template.id,
      reason: bestMatch.reason,
      confirmMessage: this.buildConfirmMessage(bestMatch.template, userInput),
    };
    
    const allCandidates = topCandidates.map(c => ({
      nodeId: c.template.id,
      name: c.template.name,
      nodeType: c.template.nodeType,
      subType: c.template.subType,
      confidence: c.score >= 20 ? '高' : c.score >= 10 ? '中' : '低',
      reason: c.reason,
    }));
    
    return JSON.stringify({
      success: true,
      intent,
      candidates: allCandidates,
    });
  }
  
  /**
   * 构建确认消息
   */
  private buildConfirmMessage(template: BusinessNodeTemplate, userInput: string): string {
    const nodeTypeNames: Record<string, string> = {
      graph: '图片生成',
      video: '视频生成',
      audio: '音频生成',
      writing: '文案创作',
    };
    
    const typeName = nodeTypeNames[template.nodeType] || template.nodeType;
    const templateName = template.name;
    
    // 根据模板特定信息构建更精确的确认消息
    if (template.id.includes('ecommerce') || template.id.includes('photograph')) {
      if (userInput.includes('淘宝') || userInput.includes('天猫') || userInput.includes('电商')) {
        return `我理解你要做的是"${templateName}"，主要针对电商平台的商品主图，对吗？`;
      }
    }
    
    if (template.id.includes('script') || template.id.includes('口播')) {
      return `我理解你要的是"${templateName}"，我来帮你生成脚本和文案，对吗？`;
    }
    
    if (template.id.includes('video')) {
      return `我理解你要做的是"${templateName}"，我来帮你生成 AI 视频，对吗？`;
    }
    
    return `我理解你要做的是"${templateName}"（${typeName}），对吗？`;
  }
}

/**
 * 获取所有可用的业务节点列表
 */
export function getAvailableNodes(): BusinessNodeTemplate[] {
  return BUSINESS_NODE_TEMPLATES;
}
