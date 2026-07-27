/**
 * Agent Chat API - Intent Detector
 * 动态从 DB 加载所有业务节点，支持 LLM 语义路由
 */

import type { IntentResult, BusinessNodeResult } from './types';
import { runByModelKey } from '../models/run';
import { listEnabledModelKeysByScope } from '../models/provider-model-catalog';
import { RepositoryFactory } from '@mxmai/mxmdata';
// Note: PromptEngineeringConfig type used for documentation only

// ==================== Types ====================

/** 业务节点字段定义 */
export interface BusinessField {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select';
  options?: string[];
  defaultValue?: string | number | boolean;
  required?: boolean;
}

/** 业务节点定义 */
export interface BusinessNode {
  scope: string;
  type: string;
  subtype: string | null;
  name: string;
  agent_rule: string;
  keywords: string[];
  fields: BusinessField[];
  smartflow_id?: string;
  confirmTemplate: (params: Record<string, string | number | boolean>) => string;
  extractors?: Array<{ field: string; patterns: RegExp[] }>;
  defaultParams?: Record<string, string | number | boolean>;
}

// ==================== DB 动态加载 ====================

/** 内存缓存：5 分钟 TTL */
let businessNodesCache: { expiresAt: number; data: BusinessNode[] } | null = null;
const BUSINESS_NODES_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * 从 formSchema (JSON Schema) 解析出 BusinessField[]
 */
function parseFormSchemaToFields(formSchema: any): BusinessField[] {
  if (!formSchema || typeof formSchema !== 'object') return [];

  const properties = formSchema.properties as Record<string, any> | undefined;
  if (!properties) return [];

  const requiredFields = new Set(formSchema.required || []);
  const fields: BusinessField[] = [];

  for (const [key, prop] of Object.entries(properties)) {
    if (!prop || typeof prop !== 'object') continue;

    let type: BusinessField['type'] = 'string';
    if (prop.type === 'integer' || prop.type === 'number') type = 'number';
    else if (prop.type === 'boolean') type = 'boolean';
    else if (prop.enum) type = 'select';

    const field: BusinessField = {
      key,
      label: prop.title || key,
      type,
      required: requiredFields.has(key),
    };

    if (prop.enum && Array.isArray(prop.enum)) {
      field.options = prop.enum.map((e: any) => String(e));
      if (prop['x-enum-labels'] && Array.isArray(prop['x-enum-labels'])) {
        // Use labels if available
        field.options = prop['x-enum-labels'].map((l: any) => String(l));
      }
    }

    if (prop.default !== undefined) {
      field.defaultValue = prop.default;
    }

    fields.push(field);
  }

  return fields;
}

/**
 * 生成默认的 confirmTemplate（可后续优化）
 */
function generateConfirmTemplate(name: string, fields: BusinessField[]): (params: Record<string, string | number | boolean>) => string {
  return (params) => {
    const fieldDescs = fields
      .filter(f => f.required && params[f.key] !== undefined)
      .map(f => `${f.label}：${params[f.key]}`)
      .join('，');
    return `执行「${name}」任务${fieldDescs ? '（' + fieldDescs + '）' : ''}，是否继续？`;
  };
}

/**
 * 从 DB 加载所有 active 业务节点（动态，无硬编码）
 */
async function loadAllBusinessNodesFromDB(): Promise<BusinessNode[]> {
  const now = Date.now();

  if (businessNodesCache && businessNodesCache.expiresAt > now) {
    return businessNodesCache.data;
  }

  try {
    const repo = RepositoryFactory.createPromptEngineeringConfigRepository();
    const result = await repo.list({ limit: 500 });

    const nodes: BusinessNode[] = [];

    for (const row of result.items ?? []) {
      if (!row.is_active) continue;
      // 本期只处理主配置（无 subtype）
      if (row.subtype !== null) continue;

      const extra = (row.extra ?? {}) as Record<string, unknown>;

      // agent_rule 是必需，用于 LLM 匹配
      const agentRule = (extra.agent_rule as string | undefined)?.trim();
      if (!agentRule) continue; // 没有 agent_rule 跳过（不参与意图匹配）

      // keywords 可选，没有关键词时纯靠 LLM 匹配
      const keywords = normalizeAgentKeywords(extra.agent_keywords) ?? [];

      // display.taskLabel 作为名称
      const display = (extra.display as Record<string, unknown> | undefined);
      const name = (display?.taskLabel as string | undefined) || `${row.scope}/${row.type}`;

      // 从 taskTemplate.formSchema 解析 fields
      const taskTemplate = (extra.taskTemplate as Record<string, unknown> | undefined);
      const formSchema = (taskTemplate?.formSchema as any);
      const fields = parseFormSchemaToFields(formSchema);

      // 生成 extractors（简单实现：每个 string/select 字段创建一个通用 extractor）
      const extractors = fields
        .filter(f => f.type === 'string' || f.type === 'select')
        .map(f => ({
          field: f.key,
          patterns: [
            // 通用模式：尝试匹配 key 或 label
            new RegExp(`${f.label}[：:]([^\\n，,。]+)`, 'i'),
            new RegExp(`${f.key}[：:]([^\\n，,。]+)`, 'i'),
          ],
        }));

      nodes.push({
        scope: row.scope,
        type: row.type,
        subtype: row.subtype,
        name,
        agent_rule: agentRule,
        keywords,
        fields,
        smartflow_id: extra.smartflow_id as string | undefined,
        confirmTemplate: generateConfirmTemplate(name, fields),
        extractors,
      });
    }

    businessNodesCache = {
      expiresAt: now + BUSINESS_NODES_CACHE_TTL_MS,
      data: nodes,
    };

    return nodes;
  } catch (err) {
    console.error('[intent-detector] loadAllBusinessNodesFromDB failed:', err);
    return [];
  }
}

function normalizeAgentKeywords(value: unknown): string[] | null {
  if (Array.isArray(value)) {
    const normalized = value
      .map((k) => (typeof k === 'string' ? k.trim() : ''))
      .filter((k) => k.length > 0);
    return normalized.length > 0 ? normalized : null;
  }
  return null;
}

// ==================== 关键词匹配 ====================

interface NodeMatch {
  node: BusinessNode;
  score: number;
  matchedKeywords: string[];
}

/**
 * 关键词快速匹配，返回所有匹配节点（按得分降序）
 */
function matchByKeywords(message: string, nodes: BusinessNode[]): NodeMatch[] {
  const lowerMsg = message.toLowerCase();
  const results: NodeMatch[] = [];

  for (const node of nodes) {
    let score = 0;
    const matchedKeywords: string[] = [];

    for (const keyword of node.keywords) {
      if (keyword && lowerMsg.includes(keyword.toLowerCase())) {
        score += keyword.length; // 更长的关键词权重更高
        matchedKeywords.push(keyword);
      }
    }

    if (score > 0) {
      results.push({ node, score, matchedKeywords });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}

// ==================== LLM 语义路由 ====================

function getDefaultTextModel(): string {
  const models = listEnabledModelKeysByScope('text');
  const fastModel = models.find(m =>
    m.toLowerCase().includes('mini') ||
    m.toLowerCase().includes('fast') ||
    m.toLowerCase().includes('quick')
  );
  return fastModel || models[0] || 'GLM-5-Turbo';
}

interface LLMScoreResult {
  winnerIndex: number;
  scores: number[];
}

/**
 * 用 LLM 对多个候选节点打分，选出最匹配的一个
 * 提示：参考截屏中用户提到的 agent路由规则 + agent关键词 评分方式
 */
async function scoreNodesByLLM(
  message: string,
  candidates: BusinessNode[]
): Promise<LLMScoreResult | null> {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return { winnerIndex: 0, scores: [1.0] };

  try {
    const modelKey = getDefaultTextModel();

    const nodeList = candidates
      .map((n, i) => `[${i}] ${n.scope}/${n.type} - ${n.name}\n  路由规则: ${n.agent_rule}\n  关键词: ${n.keywords.join(', ') || '无'}`)
      .join('\n\n');

    const prompt = `用户消息：「${message}」

请从以下候选业务节点中选择最匹配的一个，并给出每个节点的相似度评分（0-1之间，越高越匹配）。

候选节点：
${nodeList}

评分要求：
1. 仔细阅读每个节点的"路由规则"（描述何时触发）和"关键词"
2. 判断用户消息与哪个节点最相关
3. 考虑关键词匹配程度和语义相关性

输出格式（必须为有效 JSON）：
{
  "scores": [0.85, 0.30, ...],  // 每个候选的评分，按候选顺序
  "winnerIndex": 0  // 最高分候选的索引
}`;

    const result = await runByModelKey(
      'text',
      modelKey,
      { prompt, outputFormat: 'json' },
      { providerOverride: 'openrouter' }
    ) as { text?: string };

    const raw = result?.text;
    if (!raw) return null;

    // 解析 JSON
    let parsed: LLMScoreResult;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // 尝试从 markdown 代码块提取
      const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[1].trim());
        } catch {
          return null;
        }
      } else {
        return null;
      }
    }

    // 校验 winnerIndex
    if (parsed.winnerIndex < 0 || parsed.winnerIndex >= candidates.length) {
      parsed.winnerIndex = 0;
    }

    return parsed;
  } catch (err) {
    console.error('[scoreNodesByLLM] LLM 调用失败:', err);
    return null;
  }
}

// ==================== 参数提取 ====================

function extractParamsFromMessage(
  message: string,
  node: BusinessNode
): Record<string, string | number | boolean> {
  const params: Record<string, string | number | boolean> = {};

  if (!node.extractors) return params;

  for (const extractor of node.extractors) {
    for (const pattern of extractor.patterns) {
      const match = message.match(pattern);
      if (match && match[1]) {
        params[extractor.field] = match[1].trim();
        break;
      }
    }
  }

  return params;
}

// ==================== 通用意图模式 ====================

interface IntentPattern {
  intent: string;
  keywords: string[];
  weight: number;
}

const GENERAL_PATTERNS: IntentPattern[] = [
  { intent: 'greeting', keywords: ['你好', 'hello', 'hi', '嗨', '您好', 'hey', '早上好', '晚上好', '午安'], weight: 1.0 },
  { intent: 'weather', keywords: ['天气', 'weather', '温度', '下雨', '晴天', '气温'], weight: 0.9 },
  { intent: 'search', keywords: ['搜索', '查找', '找一下', 'search', '帮我找', '查一下', '有没有'], weight: 0.8 },
  { intent: 'code', keywords: ['代码', 'code', '编程', '写程序', '函数', 'class', '写个', '开发'], weight: 0.9 },
  { intent: 'translate', keywords: ['翻译', 'translate', '英文', '中文', '译成', '翻译成'], weight: 0.85 },
  { intent: 'summary', keywords: ['总结', 'summarize', '概括', '要点', '汇总', '摘要'], weight: 0.8 },
  { intent: 'question', keywords: ['什么是', '怎么', '如何', '为什么', 'who', 'what', 'how', 'why', '？', '?'], weight: 0.7 },
  { intent: 'help', keywords: ['帮助', 'help', '帮忙', '你能做什么', '功能', '有什么'], weight: 0.8 },
];

// ==================== 主入口 ====================

function getNodeKey(node: BusinessNode): string {
  return `${node.scope}/${node.type}`;
}

/**
 * 检测消息意图（动态版）
 * 1. 关键词快速匹配 → 得到候选列表
 * 2. 候选 > 1 时，用 LLM 语义打分选最优
 * 3. 候选 = 1 时，直接使用
 * 4. 候选 = 0 时，尝试纯 LLM 匹配
 */
export async function detectIntentEnhanced(message: string): Promise<IntentResult> {
  // 1. 从 DB 加载所有业务节点
  const allNodes = await loadAllBusinessNodesFromDB();

  // 2. 关键词快速匹配
  const keywordMatches = matchByKeywords(message, allNodes);

  let bestNode: BusinessNode | null = null;

  if (keywordMatches.length === 1) {
    // 唯一匹配，直接使用
    bestNode = keywordMatches[0].node;
  } else if (keywordMatches.length > 1) {
    // 多个候选 → LLM 语义打分
    const candidates = keywordMatches.map(m => m.node);
    const llmResult = await scoreNodesByLLM(message, candidates);
    if (llmResult) {
      bestNode = candidates[llmResult.winnerIndex];
    } else {
      // LLM 失败，fallback 到得分最高的关键词匹配
      bestNode = keywordMatches[0].node;
    }
  } else {
    // 无关键词匹配 → 尝试纯 LLM 匹配
    bestNode = await detectByLLMOnly(message, allNodes);
  }

  if (bestNode) {
    const extractedParams = extractParamsFromMessage(message, bestNode);
    const allParams = { ...bestNode.defaultParams, ...extractedParams };
    const missingFields = bestNode.fields
      .filter(f => f.required && !allParams[f.key])
      .map(f => f.key);

    const coverage = 1 - missingFields.length / Math.max(1, bestNode.fields.filter(f => f.required).length);
    let confidenceLevel: 'high' | 'medium' | 'low';
    if (coverage >= 0.75 && missingFields.length <= 1) {
      confidenceLevel = 'high';
    } else if (coverage >= 0.4) {
      confidenceLevel = 'medium';
    } else {
      confidenceLevel = 'low';
    }

    const businessNode: BusinessNodeResult = {
      nodeType: getNodeKey(bestNode),
      nodeName: bestNode.name,
      matchedKeywords: keywordMatches.find(m => m.node === bestNode)?.matchedKeywords || [],
      extractedParams: allParams,
      missingFields,
      confidenceLevel,
      matchSource: keywordMatches.length > 0 ? 'keyword' : 'llm',
      smartflow_id: bestNode.smartflow_id,
    };

    return {
      intent: getNodeKey(bestNode),
      confidence: Math.min(0.5 + coverage * 0.5, 1.0),
      businessNode,
      params: allParams,
    };
  }

  // 3. 无业务节点匹配 → 通用模式
  return detectGeneralIntent(message);
}

/**
 * 纯 LLM 业务节点匹配（无关键词命中时）
 */
async function detectByLLMOnly(message: string, nodes: BusinessNode[]): Promise<BusinessNode | null> {
  if (nodes.length === 0) return null;

  try {
    const modelKey = getDefaultTextModel();

    const nodeList = nodes
      .map((n, i) => `[${i}] ${n.scope}/${n.type} - ${n.name}\n  路由规则: ${n.agent_rule}\n  关键词: ${n.keywords.join(', ') || '无'}`)
      .join('\n\n');

    const prompt = `用户消息：「${message}」

请从以下已注册业务节点中选择最匹配的一个。如果都不匹配，返回 unmatched。

已注册业务节点：
${nodeList}

输出格式（必须为有效 JSON）：
{
  "matched": true或false,
  "nodeType": "匹配的 scope/type，如 graph/photograph，不匹配时可不返回",
  "confidence": 0到1之间的数值
}`;

    const result = await runByModelKey(
      'text',
      modelKey,
      { prompt, outputFormat: 'json' },
      { providerOverride: 'openrouter' }
    ) as { text?: string };

    const raw = result?.text;
    if (!raw) return null;

    let parsed: { matched: boolean; nodeType?: string; confidence?: number };
    try {
      parsed = JSON.parse(raw);
    } catch {
      const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[1].trim());
        } catch {
          return null;
        }
      } else {
        return null;
      }
    }

    if (parsed.matched && parsed.nodeType) {
      const matched = nodes.find(n => getNodeKey(n) === parsed.nodeType);
      return matched || null;
    }

    return null;
  } catch (err) {
    console.error('[detectByLLMOnly] LLM 调用失败:', err);
    return null;
  }
}

/**
 * 通用意图检测（无业务节点匹配时）
 */
function detectGeneralIntent(message: string): IntentResult {
  const lowerMessage = message.toLowerCase().trim();

  const scores: Map<string, number> = new Map();

  for (const pattern of GENERAL_PATTERNS) {
    for (const keyword of pattern.keywords) {
      if (lowerMessage.includes(keyword.toLowerCase())) {
        const currentScore = scores.get(pattern.intent) || 0;
        scores.set(pattern.intent, currentScore + pattern.weight);
      }
    }
  }

  let bestIntent = 'general';
  let bestScore = 0;

  for (const [intent, score] of scores) {
    if (score > bestScore) {
      bestScore = score;
      bestIntent = intent;
    }
  }

  if (bestScore === 0) {
    return { intent: 'general', confidence: 0.5 };
  }

  return {
    intent: bestIntent,
    confidence: Math.min(bestScore / 2, 1.0),
  };
}

// ==================== 辅助函数（兼容旧接口） ====================

/**
 * @deprecated 请使用 detectIntentEnhanced
 */
export function detectIntent(message: string): IntentResult {
  // 同步版本仅做关键词匹配，不支持动态加载和 LLM
  // 保留向后兼容
  return detectGeneralIntent(message);
}

export function getSystemPromptForIntent(intent: string): string {
  const prompts: Record<string, string> = {
    greeting: '你是一个友好的 AI 助手，请用轻松的方式与用户交流。',
    weather: '你是一个天气助手，请根据用户询问提供准确的天气信息。',
    search: '你是一个搜索助手，请根据用户的搜索需求提供相关信息。',
    code: '你是一个编程助手，请提供清晰、正确的代码示例和解释。',
    translate: '你是一个翻译助手，请提供准确，自然的翻译结果。',
    summary: '你是一个文本总结助手，请简洁地概括要点。',
    question: '你是一个知识问答助手，请准确回答用户的问题。',
    help: '你是一个 AI 助手，可以帮助用户完成图像生成、视频制作、音乐创作、文案写作等任务。请询问用户想做什么。',
    general: '你是一个智能 AI 助手，请与用户友好地交流，并尽可能帮助用户解决问题。',
  };

  return prompts[intent] || prompts['general'];
}

export function getBusinessNode(nodeType: string): BusinessNode | undefined {
  // 同步接口，从缓存查找（缓存5分钟刷新）
  const cached = businessNodesCache?.data;
  if (cached) {
    return cached.find(n => getNodeKey(n) === nodeType);
  }
  return undefined;
}

export function getNodeNameByKey(nodeKey: string): string {
  const node = getBusinessNode(nodeKey);
  return node?.name || nodeKey;
}

export function getNextFieldToAsk(
  _nodeType: string,
  _currentParams: Record<string, string | number | boolean>
): BusinessField | null {
  // 同步接口，保留向后兼容（实际逻辑在 detectIntentEnhanced 返回的 missingFields 中）
  return null;
}

export function getBusinessNodes(): Promise<BusinessNode[]> {
  return loadAllBusinessNodesFromDB();
}
