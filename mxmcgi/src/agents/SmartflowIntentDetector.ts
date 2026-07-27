/**
 * Smartflow Intent Detector
 * 检测复杂意图，自动触发 Smartflow 工作流
 */

import { RepositoryFactory } from '@mxmai/mxmdata';

export interface SmartflowTrigger {
  smartflow_id: string;
  input_data: Record<string, any>;
  matched_node?: string;
  confidence: number;
}

interface SmartflowConfig {
  scope: string;
  type: string;
  smartflow_id: string;
  keywords: string[];
  agent_rule?: string;
  extractParams?: (message: string) => Record<string, any>;
}

/** SmartflowIntentDetector 缓存 */
let smartflowConfigCache: { expiresAt: number; configs: SmartflowConfig[] } | null = null;
const SMARTFLOW_CACHE_TTL_MS = 5 * 60 * 1000; // 5分钟

export class SmartflowIntentDetector {
  private repo = RepositoryFactory.createPromptEngineeringConfigRepository();

  /**
   * 加载所有配置了 smartflow_id 的业务节点
   */
  private async loadSmartflowConfigs(): Promise<SmartflowConfig[]> {
    const now = Date.now();

    if (smartflowConfigCache && smartflowConfigCache.expiresAt > now) {
      return smartflowConfigCache.configs;
    }

    try {
      const result = await this.repo.list({ limit: 500 });
      const configs: SmartflowConfig[] = [];

      for (const row of result.items ?? []) {
        if (!row.is_active) continue;
        if (row.subtype !== null) continue; // 本期只处理主配置

        const extra = (row.extra ?? {}) as Record<string, unknown>;
        const smartflowId = extra.smartflow_id as string | undefined;

        if (!smartflowId) continue; // 没有配置 smartflow_id，跳过

        // 从 extra 中获取 keywords（可选）
        const keywords = (extra.smartflow_keywords as string[] | undefined) || [];

        // 从 extra 中获取 agent_rule（用于 LLM 匹配）
        const agentRule = extra.agent_rule as string | undefined;

        configs.push({
          scope: row.scope,
          type: row.type,
          smartflow_id: smartflowId,
          keywords,
          agent_rule: agentRule,
        });
      }

      smartflowConfigCache = {
        expiresAt: now + SMARTFLOW_CACHE_TTL_MS,
        configs,
      };

      return configs;
    } catch (err) {
      console.error('[SmartflowIntentDetector] Failed to load configs:', err);
      return [];
    }
  }

  /**
   * 检测是否需要触发 Smartflow
   */
  async detect(
    message: string,
    context?: {
      conversationHistory?: Array<{ role: string; content: string }>;
      businessNode?: { nodeType?: string; nodeName?: string };
    }
  ): Promise<SmartflowTrigger | null> {
    const configs = await this.loadSmartflowConfigs();
    const lowerMsg = message.toLowerCase();

    // 1. 关键词快速匹配
    for (const config of configs) {
      const matched = config.keywords.some((kw) => lowerMsg.includes(kw.toLowerCase()));
      if (matched) {
        return {
          smartflow_id: config.smartflow_id,
          input_data: this.extractParams(message, config),
          matched_node: `${config.scope}/${config.type}`,
          confidence: 0.9,
        };
      }
    }

    // 2. 业务节点名称匹配（如果已知业务节点）
    if (context?.businessNode?.nodeType) {
      const nodeType = context.businessNode.nodeType;
      const matchedConfig = configs.find(
        (c) => `${c.scope}/${c.type}` === nodeType || c.type === nodeType
      );
      if (matchedConfig) {
        return {
          smartflow_id: matchedConfig.smartflow_id,
          input_data: this.extractParams(message, matchedConfig),
          matched_node: `${matchedConfig.scope}/${matchedConfig.type}`,
          confidence: 0.95,
        };
      }
    }

    return null;
  }

  /**
   * 从消息中提取参数
   */
  private extractParams(message: string, _config: SmartflowConfig): Record<string, any> {
    const params: Record<string, any> = { original_message: message };

    // TODO: 根据配置动态提取参数
    // 当前版本先简单传递原始消息，后续可扩展 extractors

    return params;
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    smartflowConfigCache = null;
  }
}
