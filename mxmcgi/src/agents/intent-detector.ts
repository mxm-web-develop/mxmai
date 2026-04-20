/**
 * Agent Chat API - Intent Detector
 * 支持通用意图 + 业务节点识别
 */

import type { IntentResult, BusinessNodeResult } from './types';
import { runByModelKey } from '../models/run';
import { listEnabledModelKeysByScope } from '../models/provider-model-catalog';

// ==================== Types ====================

/** 业务节点字段定义 */
export interface BusinessField {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select';
  /** select 类型时可选值 */
  options?: string[];
  /** 默认值 */
  defaultValue?: string | number | boolean;
  /** 是否必填 */
  required?: boolean;
}

/** 业务节点定义 */
export interface BusinessNode {
  name: string;            // 展示名称
  agent_rule: string;      // LLM 兜底匹配用的自然语言描述规则
  keywords: string[];       // 命中关键词（与顺序无关）
  fields: BusinessField[];  // 参数字段列表
  /** 生成确认文案 */
  confirmTemplate: (params: Record<string, string | number | boolean>) => string;
  /** 从用户消息中提取参数的-pattern 列表 */
  extractors?: Array<{
    field: string;
    patterns: RegExp[];
  }>;
  /** 默认参数 */
  defaultParams?: Record<string, string | number | boolean>;
}

// ==================== Business Node Registry ====================

export const businessNodes: Record<string, BusinessNode> = {
  'graph/photograph': {
    name: '淘宝女装摄影',
    agent_rule: '当用户想要生成电商产品图片、模特图、商业摄影时触发，例如"生成淘宝女装图""棚拍一套""拍电商主图""做一套模特上身图""女装棚拍"等，涉及商品展示、模特拍摄、电商主图等需求',
    keywords: ['淘宝女装摄影', '棚拍', '模特图', '女装棚拍', '电商主图', '服装摄影', '模特拍摄', '女装拍摄', '淘宝棚拍', '春装棚拍', '夏装棚拍', '秋装棚拍', '冬装棚拍'],
    fields: [
      { key: 'count', label: '数量', type: 'select', options: ['2', '4', '6', '8'], defaultValue: '4', required: true },
      { key: 'ratio', label: '比例', type: 'select', options: ['3:4', '1:1', '16:9'], defaultValue: '3:4', required: true },
      { key: 'style', label: '风格', type: 'select', options: ['韩系清新', '韩系清冷', '欧美高级', '日系自然', '法式慵懒', '中性极简'], defaultValue: '韩系清新', required: true },
      { key: 'hasRef', label: '是否有参考图', type: 'boolean', defaultValue: false },
    ],
    confirmTemplate: (params) =>
      `生成 ${params.count} 张${params.ratio}淘宝女装棚拍图，风格「${params.style}」${params.hasRef === true || params.hasRef === 'true' ? '，有参考图' : '，无参考图'}，是否开始？`,
    extractors: [
      { field: 'count', patterns: [/(\d+)张/, /(\d+)张图/, /数量(\d+)/] },
      { field: 'ratio', patterns: [/(\d+:\d+)/, /比例(\d+:\d+)/] },
      {
        field: 'style',
        patterns: [/([韩欧美日法中性]+系[\w]+)/, /风格"?([^"\n，,]+)"?/],
      },
    ],
  },

  'graph/design': {
    name: '设计海报',
    agent_rule: '当用户想要制作海报、宣传图、广告图、主视觉（KV）、Banner、活动封面等平面设计作品时触发，例如"帮我做一张海报""设计活动主视觉""做个宣传图""节日海报""广告Banner"等',
    keywords: ['海报', '设计图', '宣传图', '主视觉', 'KV', 'key visual', 'Banner', 'banner', '广告图', '活动海报', '节日海报', '促销海报', '封面图', '配图'],
    fields: [
      { key: 'width', label: '宽度(px)', type: 'string', defaultValue: '1080' },
      { key: 'height', label: '高度(px)', type: 'string', defaultValue: '1920' },
      { key: 'theme', label: '主题', type: 'string', required: true },
      { key: 'style', label: '风格', type: 'select', options: ['科技感', '简约', '复古', '可爱', '高级感', '国潮', '赛博朋克'], defaultValue: '简约' },
      { key: 'hasText', label: '是否需要文字', type: 'boolean', defaultValue: true },
    ],
    confirmTemplate: (params) =>
      `生成一张${params.width}x${params.height}「${params.theme}」主题海报，风格「${params.style}」，是否开始？`,
    extractors: [
      { field: 'width', patterns: [/(\d+)x\d+/, /宽(\d+)/] },
      { field: 'height', patterns: [/\d+x(\d+)/, /高(\d+)/] },
      { field: 'theme', patterns: [/主题"?([^"\n，,]+)"?/, /做一张([^张\n]+)海报/] },
    ],
  },

  'video/generate': {
    name: '视频生成',
    agent_rule: '当用户想要生成短视频、广告视频、产品视频、种草视频、口播视频、模特展示视频等视频内容时触发，例如"生成一个短视频""做个30秒广告""拍产品视频""种草视频""口播视频""视频剪辑"等',
    keywords: ['短视频', '视频', '30秒视频', '产品视频', '种草视频', '广告视频', '宣传视频', '剪辑', '分镜', '脚本生成视频', '口播视频', '商品视频', '模特视频'],
    fields: [
      { key: 'duration', label: '时长', type: 'select', options: ['15秒', '30秒', '60秒', '90秒', '120秒'], defaultValue: '30秒', required: true },
      { key: 'content', label: '内容描述', type: 'string', required: true },
      { key: 'hasScript', label: '是否需要分镜脚本', type: 'boolean', defaultValue: true },
      { key: 'aspectRatio', label: '比例', type: 'select', options: ['9:16', '16:9', '1:1', '3:4'], defaultValue: '9:16' },
    ],
    confirmTemplate: (params) =>
      `生成一条${params.duration}「${params.content}」${params.aspectRatio}视频，${params.hasScript ? '包含分镜脚本' : '直接生成视频'}，是否开始？`,
    extractors: [
      { field: 'duration', patterns: [/(\d+)[秒秒]+/, /时长(\d+)/] },
      { field: 'content', patterns: [/做.*?([^"\n，,]+)视频/, /视频.*?([^"\n，,]+)/] },
      { field: 'aspectRatio', patterns: [/(\d+:\d+)/] },
    ],
  },

  'audio/tts': {
    name: 'TTS配音',
    agent_rule: '当用户想把文字转成语音、需要配音服务、制作口播旁白、语音合成时触发，例如"把这段文字配音""生成语音""TTS""文字转语音""朗读这段话""做个旁白"等',
    keywords: ['配音', '口播稿', '文字转语音', 'TTS', '语音合成', '录音', '配音生成', '文字配音', '旁白', '朗读'],
    fields: [
      { key: 'text', label: '配音文本', type: 'string', required: true },
      { key: 'voice', label: '音色', type: 'select', options: ['女声温柔', '女声活泼', '男声磁性', '男声沉稳', '童声'], defaultValue: '女声温柔' },
      { key: 'speed', label: '语速', type: 'select', options: ['慢', '正常', '快'], defaultValue: '正常' },
    ],
    confirmTemplate: (params) =>
      `将以下文案转为语音：${String(params.text).slice(0, 30)}...（音色：${params.voice}，语速：${params.speed}），是否开始？`,
    extractors: [
      { field: 'text', patterns: [/(.+)/] },
    ],
  },

  'audio/music': {
    name: '音乐生成',
    agent_rule: '当用户想要生成音乐、创作歌曲、制作背景音乐/BGM、作曲编曲时触发，例如"生成一段背景音乐""写首歌""做个BGM""作曲""配乐""生成音乐"等',
    keywords: ['音乐', '写首歌', '生成音乐', '作曲', '配乐', '背景音乐', 'BGM', '歌曲', '编曲'],
    fields: [
      { key: 'genre', label: '风格', type: 'select', options: ['流行', '电子', '民谣', '摇滚', '古典', '爵士', '嘻哈', '轻音乐'], defaultValue: '流行', required: true },
      { key: 'mood', label: '情绪', type: 'select', options: ['欢快', '舒缓', '悲伤', '励志', '浪漫', '神秘'], defaultValue: '舒缓', required: true },
      { key: 'duration', label: '时长', type: 'select', options: ['30秒', '60秒', '90秒', '120秒'], defaultValue: '60秒', required: true },
      { key: 'hasLyrics', label: '是否需要歌词', type: 'boolean', defaultValue: false },
    ],
    confirmTemplate: (params) =>
      `生成一段${params.duration}${params.genre}风格「${params.mood}」音乐${params.hasLyrics ? '（含歌词）' : '（纯音乐）'}，是否开始？`,
    extractors: [
      { field: 'genre', patterns: [/([\w]+)风格/, /风格"?([^"\n，,]+)"?/] },
      { field: 'mood', patterns: [/情绪"?([^"\n，,]+)"?/, /(\w+)的/] },
      { field: 'duration', patterns: [/(\d+)[秒秒]+/] },
    ],
  },

  'writing/script': {
    name: '写作脚本',
    agent_rule: '当用户需要撰写短视频脚本、口播稿、直播话术、广告文案、分镜脚本时触发，例如"写个口播脚本""帮我写分镜""直播脚本怎么写""短视频脚本""广告文案""台词"等',
    keywords: ['脚本', '分镜', '分镜脚本', '口播稿', '文案', '剧本', '短视频脚本', '直播脚本', '台词'],
    fields: [
      { key: 'type', label: '脚本类型', type: 'select', options: ['口播脚本', '分镜脚本', '直播话术', '广告文案', '产品介绍'], defaultValue: '口播脚本', required: true },
      { key: 'product', label: '产品/主题', type: 'string', required: true },
      { key: 'duration', label: '时长(秒)', type: 'string', defaultValue: '60' },
      { key: 'tone', label: '语气风格', type: 'select', options: ['专业', '亲切', '幽默', '感性', '硬核'], defaultValue: '亲切' },
    ],
    confirmTemplate: (params) =>
      `撰写一个${params.type}：主题「${params.product}」，时长约${params.duration}秒，语气「${params.tone}」，是否开始？`,
    extractors: [
      { field: 'product', patterns: [/主题"?([^"\n，,]+)"?/, /产品"?([^"\n，,]+)"?/] },
      { field: 'duration', patterns: [/(\d+)[秒秒]+/] },
    ],
  },

  'writing/article': {
    name: '文章写作',
    agent_rule: '当用户想要写文章、博客、小红书笔记、公众号推文、种草文案、评测文章、攻略等内容时触发，例如"写一篇小红书""帮我写篇文章""公众号文案""种草文""写个评测""攻略"等',
    keywords: ['文章', '写作', '文案', '博客', '小红书', '公众号', '推文', '笔记', '软文', '种草文', '评测', '攻略'],
    fields: [
      { key: 'platform', label: '平台', type: 'select', options: ['小红书', '微信公众号', '微博', '知乎', '抖音', '快手', 'B站'], defaultValue: '小红书', required: true },
      { key: 'topic', label: '主题', type: 'string', required: true },
      { key: 'length', label: '篇幅', type: 'select', options: ['短(300字内)', '中(500-800字)', '长(1000字以上)'], defaultValue: '中(500-800字)' },
      { key: 'tone', label: '文风', type: 'select', options: ['种草安利', '客观评测', '干货分享', '情感共鸣', '幽默搞笑'], defaultValue: '种草安利' },
    ],
    confirmTemplate: (params) =>
      `撰写一篇${params.platform}${params.length}「${params.topic}」主题文章，文风「${params.tone}」，是否开始？`,
    extractors: [
      { field: 'topic', patterns: [/主题"?([^"\n，,]+)"?/, /关于([^"\n，,]+)/] },
      { field: 'platform', patterns: [/小红书|微信公众号|微博|知乎|抖音|B站/] },
    ],
  },
};

// ==================== 通用意图模式 ====================

interface IntentPattern {
  intent: string;
  keywords: string[];
  weight: number;
  extractParams?: (message: string) => Record<string, string> | undefined;
}

const GENERAL_PATTERNS: IntentPattern[] = [
  {
    intent: 'greeting',
    keywords: ['你好', 'hello', 'hi', '嗨', '您好', 'hey', '早上好', '晚上好', '午安'],
    weight: 1.0,
  },
  {
    intent: 'weather',
    keywords: ['天气', 'weather', '温度', '下雨', '晴天', '气温'],
    weight: 0.9,
  },
  {
    intent: 'search',
    keywords: ['搜索', '查找', '找一下', 'search', '帮我找', '查一下', '有没有'],
    weight: 0.8,
  },
  {
    intent: 'code',
    keywords: ['代码', 'code', '编程', '写程序', '函数', 'class', '写个', '开发'],
    weight: 0.9,
  },
  {
    intent: 'translate',
    keywords: ['翻译', 'translate', '英文', '中文', '译成', '翻译成'],
    weight: 0.85,
  },
  {
    intent: 'summary',
    keywords: ['总结', 'summarize', '概括', '要点', '汇总', '摘要'],
    weight: 0.8,
  },
  {
    intent: 'question',
    keywords: ['什么是', '怎么', '如何', '为什么', 'who', 'what', 'how', 'why', '？', '?'],
    weight: 0.7,
  },
  {
    intent: 'help',
    keywords: ['帮助', 'help', '帮忙', '你能做什么', '功能', '有什么'],
    weight: 0.8,
  },
];

// ==================== 辅助函数 ====================

/**
 * 从用户消息中提取参数
 */
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

/**
 * 匹配关键词并返回命中的节点及其得分
 */
function matchBusinessNodes(message: string): Array<{ nodeType: string; node: BusinessNode; score: number; matchedKeywords: string[] }> {
  const lowerMessage = message.toLowerCase();
  const results: Array<{ nodeType: string; node: BusinessNode; score: number; matchedKeywords: string[] }> = [];

  for (const [nodeType, node] of Object.entries(businessNodes)) {
    let score = 0;
    const matchedKeywords: string[] = [];

    for (const keyword of node.keywords) {
      if (lowerMessage.includes(keyword.toLowerCase())) {
        score += keyword.length; // 更长的关键词权重更高
        matchedKeywords.push(keyword);
      }
    }

    if (score > 0) {
      results.push({ nodeType, node, score, matchedKeywords });
    }
  }

  // 按得分降序排列
  results.sort((a, b) => b.score - a.score);
  return results;
}

// ==================== 主入口 ====================

/**
 * 检测消息意图
 * @param message 用户消息
 * @returns 意图检测结果
 */
export function detectIntent(message: string): IntentResult {
  const lowerMessage = message.toLowerCase().trim();

  // 1. 先尝试匹配业务节点
  const nodeMatches = matchBusinessNodes(message);

  if (nodeMatches.length > 0) {
    const best = nodeMatches[0];

    // 提取参数
    const extractedParams = extractParamsFromMessage(message, best.node);

    // 合并默认参数
    const allParams = { ...best.node.defaultParams, ...extractedParams };

    // 计算缺失字段
    const missingFields = best.node.fields
      .filter(f => f.required && !allParams[f.key])
      .map(f => f.key);

    // 置信度判断
    let confidenceLevel: 'high' | 'medium' | 'low';
    const coverage = 1 - missingFields.length / best.node.fields.filter(f => f.required).length;
    if (coverage >= 0.75 && missingFields.length <= 1) {
      confidenceLevel = 'high';
    } else if (coverage >= 0.4) {
      confidenceLevel = 'medium';
    } else {
      confidenceLevel = 'low';
    }

    const businessNode: BusinessNodeResult = {
      nodeType: best.nodeType,
      nodeName: best.node.name,
      matchedKeywords: best.matchedKeywords,
      extractedParams: allParams,
      missingFields,
      confidenceLevel,
    };

    // 置信度 = 基础分 + 覆盖率
    const confidence = Math.min(0.5 + coverage * 0.5, 1.0);

    return {
      intent: best.nodeType,
      confidence,
      businessNode,
      params: allParams,
    };
  }

  // 2. 通用模式匹配
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

  const confidence = Math.min(bestScore / 2, 1.0);
  const matchedPattern = GENERAL_PATTERNS.find(p => p.intent === bestIntent);
  const params = matchedPattern?.extractParams?.(message);

  return {
    intent: bestIntent,
    confidence,
    params,
  };
}

/**
 * 根据意图构建系统提示词
 */
export function getSystemPromptForIntent(intent: string): string {
  // 业务节点提示词
  if (businessNodes[intent]) {
    const node = businessNodes[intent];
    return `你是一个专业的「${node.name}」任务助手。
当用户表达的需求涉及 ${node.name} 时，你应该：
1. 先确认你理解的需求是否正确（说出你理解的内容）
2. 如果缺少必要参数，向用户提问获取
3. 收集完所有必要参数后，用自然语言总结确认单
4. 获得用户确认后才执行任务
注意：始终站在用户角度，用简洁自然的语言交流。`;
  }

  const prompts: Record<string, string> = {
    greeting: '你是一个友好的 AI 助手，请用轻松的方式与用户交流。',
    weather: '你是一个天气助手，请根据用户询问提供准确的天气信息。',
    search: '你是一个搜索助手，请根据用户的搜索需求提供相关信息。',
    code: '你是一个编程助手，请提供清晰、正确的代码示例和解释。',
    translate: '你是一个翻译助手，请提供准确、自然的翻译结果。',
    summary: '你是一个文本总结助手，请简洁地概括要点。',
    question: '你是一个知识问答助手，请准确回答用户的问题。',
    help: '你是一个 AI 助手，可以帮助用户完成图像生成、视频制作、音乐创作、文案写作等任务。请询问用户想做什么。',
    general: '你是一个智能 AI 助手，请与用户友好地交流，并尽可能帮助用户解决问题。',
  };

  return prompts[intent] || prompts['general'];
}

/**
 * 根据节点类型获取节点定义
 */
export function getBusinessNode(nodeType: string): BusinessNode | undefined {
  return businessNodes[nodeType];
}

/**
 * 获取补问字段（返回下一个需要询问的字段）
 */
export function getNextFieldToAsk(
  nodeType: string,
  currentParams: Record<string, string | number | boolean>
): BusinessField | null {
  const node = businessNodes[nodeType];
  if (!node) return null;

  for (const field of node.fields) {
    if (field.required && currentParams[field.key] === undefined) {
      return field;
    }
  }

  return null;
}

// ==================== LLM 兜底业务节点匹配 ====================

function getDefaultTextModel(): string {
  const models = listEnabledModelKeysByScope('text');
  const fastModel = models.find(m =>
    m.toLowerCase().includes('mini') ||
    m.toLowerCase().includes('fast') ||
    m.toLowerCase().includes('quick')
  );
  return fastModel || models[0] || 'GLM-5-Turbo';
}

interface LLMMatchResult {
  matched: boolean;
  nodeType?: string;
  confidence?: number;
  reason?: string;
}

/**
 * 用 LLM 基于 agent_rule 描述匹配最合适的业务节点
 * 仅在关键词未命中时调用
 * @param message 用户原始消息
 * @returns 匹配结果，包含 nodeType、confidence、reason
 */
export async function matchBusinessNodeByLLM(
  message: string
): Promise<LLMMatchResult | null> {
  try {
    const modelKey = getDefaultTextModel();

    // 构建节点列表供 LLM 参考
    const nodeList = Object.entries(businessNodes)
      .map(([nodeType, node]) => `- ${nodeType}: ${node.name}\n  规则: ${node.agent_rule}`)
      .join('\n\n');

    const prompt = `你是业务路由器，只能从以下已注册节点中选一个匹配用户需求，无法确定时返回 unmatched。

用户消息：「${message}」

已注册业务节点：
${nodeList}

请根据用户消息的语义，匹配最合适的一个业务节点。

输出格式（必须为有效 JSON）：
{
  "matched": true或false,
  "nodeType": "匹配的节点类型，如 graph/photograph，不匹配时可不返回",
  "confidence": 0到1之间的数值，表示匹配置信度，unmatched 时可不返回,
  "reason": "简要说明匹配或未匹配的理由"
}
`;

    const result = await runByModelKey(
      'text',
      modelKey,
      { prompt, outputFormat: 'json' },
      { providerOverride: 'deer' }
    ) as { text?: string };

    const raw = result?.text;
    if (!raw) return null;

    // 尝试从响应中提取 JSON
    let parsed: LLMMatchResult;
    try {
      parsed = JSON.parse(raw) as LLMMatchResult;
    } catch {
      // 尝试从 markdown 代码块中提取
      const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[1].trim()) as LLMMatchResult;
        } catch {
          return null;
        }
      } else {
        return null;
      }
    }

    // 安全校验：matched=true 时必须返回合法的 nodeType
    if (parsed.matched && parsed.nodeType) {
      if (!businessNodes[parsed.nodeType]) {
        // 返回了未知节点，不匹配
        return { matched: false, reason: `LLM 返回了未知节点类型: ${parsed.nodeType}` };
      }
      return parsed;
    }

    return { matched: false, reason: parsed.reason || '未匹配到明确业务节点' };
  } catch (err) {
    console.error('[matchBusinessNodeByLLM] LLM 调用失败:', err);
    return null; // 失败时返回 null，调用方走通用聊天
  }
}

/**
 * 检测消息意图（增强版：关键词优先 + LLM 兜底）
 * @param message 用户消息
 * @returns 意图检测结果（businessNode.matchSource 标识命中来源）
 */
export async function detectIntentEnhanced(message: string): Promise<IntentResult> {
  // 1. 先尝试关键词快速匹配
  const nodeMatches = matchBusinessNodes(message);

  if (nodeMatches.length > 0) {
    const best = nodeMatches[0];
    const extractedParams = extractParamsFromMessage(message, best.node);
    const allParams = { ...best.node.defaultParams, ...extractedParams };
    const missingFields = best.node.fields
      .filter(f => f.required && !allParams[f.key])
      .map(f => f.key);

    const coverage = 1 - missingFields.length / best.node.fields.filter(f => f.required).length;
    let confidenceLevel: 'high' | 'medium' | 'low';
    if (coverage >= 0.75 && missingFields.length <= 1) {
      confidenceLevel = 'high';
    } else if (coverage >= 0.4) {
      confidenceLevel = 'medium';
    } else {
      confidenceLevel = 'low';
    }

    const businessNode: BusinessNodeResult = {
      nodeType: best.nodeType,
      nodeName: best.node.name,
      matchedKeywords: best.matchedKeywords,
      extractedParams: allParams,
      missingFields,
      confidenceLevel,
      matchSource: 'keyword',
    };

    const confidence = Math.min(0.5 + coverage * 0.5, 1.0);
    return { intent: best.nodeType, confidence, businessNode, params: allParams };
  }

  // 2. 关键词未命中 → LLM 兜底
  const llmResult = await matchBusinessNodeByLLM(message);

  if (llmResult && llmResult.matched && llmResult.nodeType) {
    const node = businessNodes[llmResult.nodeType];
    if (!node) {
      // 防御：LLM 返回了未知节点
      return detectIntent(message);
    }

    const extractedParams = extractParamsFromMessage(message, node);
    const allParams = { ...node.defaultParams, ...extractedParams };
    const missingFields = node.fields
      .filter(f => f.required && !allParams[f.key])
      .map(f => f.key);

    // LLM 命中统一使用 medium 置信度，避免误触发直接下任务
    const confidenceLevel: 'medium' | 'low' = llmResult.confidence && llmResult.confidence >= 0.8 ? 'medium' : 'low';

    const businessNode: BusinessNodeResult = {
      nodeType: llmResult.nodeType,
      nodeName: node.name,
      matchedKeywords: [],
      extractedParams: allParams,
      missingFields,
      confidenceLevel,
      matchSource: 'llm',
    };

    const confidence = llmResult.confidence ?? 0.6;
    return { intent: llmResult.nodeType, confidence, businessNode, params: allParams };
  }

  // 3. LLM 也未命中 → 回退到通用模式匹配
  return detectIntent(message);
}
