/**
 * Agent Chat API - Type Definitions
 */

/** Agent Chat 请求体 */
export interface AgentChatRequest {
  message: string;
  sessionId?: string;
  provider?: string;
  modelKey?: string;
  /** 上传的图片 URL 列表（已上传到 R2 的参考图） */
  images?: string[];
  /** Base64 编码的图片数据（会自动上传到 R2） */
  imageBase64?: string[];
}

/** Agent Chat SSE 事件类型 */
export type AgentChatEventType =
  | 'text'        // 文本流片段
  | 'confirm'     // AI请求确认（节点确认 or 参数确认）
  | 'task_created' // 任务已创建
  | 'task_progress' // 任务进度更新
  | 'task_done'   // 任务完成
  | 'error'       // 错误
  | 'done';       // 会话结束

/** 确认事件子类型 */
export type ConfirmSubType = 'node' | 'params' | 'final';

/** 确认事件内容 */
export interface ConfirmContent {
  confirmType: ConfirmSubType;
  /** 节点类型，如 graph/photograph */
  nodeType?: string;
  nodeName?: string;
  /** 待确认的参数字典 */
  params?: Record<string, string | number | boolean>;
  /** AI 组织好的确认文案 */
  text: string;
  /** 补问中当前正在询问的字段 key */
  askingField?: string;
  /** 可选的字段选项（用于选择型字段） */
  options?: string[];
}

/** 任务状态内容 */
export interface TaskContent {
  taskId: string;
  nodeType: string;
  nodeName: string;
  status: 'created' | 'progress' | 'done' | 'error' | 'cancelled';
  progress?: number; // 0-100
  resultUrl?: string;
  resultUrls?: string[];
  error?: string;
  /** AI 补充说明 */
  text?: string;
}

/** Agent Chat SSE 事件 */
export interface AgentChatEvent {
  type: AgentChatEventType;
  content?: string;
  error?: string;
  sessionId?: string;
  confirm?: ConfirmContent;
  task?: TaskContent;
}

/** 意图检测结果 */
export interface IntentResult {
  /** 通用意图 or 业务节点类型 */
  intent: string;
  confidence: number;
  params?: Record<string, string | number | boolean>;
  /** 业务节点信息（仅当命中业务节点时） */
  businessNode?: BusinessNodeResult;
  /** 任务修改意图（仅当命中修改模式时） */
  taskModify?: {
    /** 要修改哪一项（1-based index，如 2 表示第二张） */
    targetIndex?: number;
    /** 要修改的参数字段 */
    field?: string;
    /** 期望的新值 */
    value?: string;
    /** 原始消息 */
    rawMessage: string;
  };
}

/** 业务节点检测结果 */
export interface BusinessNodeResult {
  nodeType: string;       // 如 'graph/photograph'
  nodeName: string;        // 如 '淘宝女装摄影'
  matchedKeywords: string[];
  /** 从用户消息中提取的参数 */
  extractedParams: Record<string, string | number | boolean>;
  /** 未填写但业务节点要求的必填字段 */
  missingFields: string[];
  /** 置信度: high/medium/low */
  confidenceLevel: 'high' | 'medium' | 'low';
  /** 命中来源（本期不暴露到前端） */
  matchSource?: 'keyword' | 'llm';
}

/** 会话消息 */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

/** 会话上下文 */
export interface SessionContext {
  id: string;
  messages: ChatMessage[];
  createdAt: number;
  lastActiveAt: number;
  /** 当前正在进行的业务节点（补问阶段） */
  pendingNode?: {
    nodeType: string;
    nodeName: string;
    params: Record<string, string | number | boolean>;
    nextFieldToAsk?: string;
    confirmStep?: 'node' | 'params' | 'final';
  };
  /** 最近完成的任务 ID（用于任务修改意图） */
  currentTaskId?: string;
  /** 最近完成任务的节点类型 */
  currentNodeType?: string;
}
