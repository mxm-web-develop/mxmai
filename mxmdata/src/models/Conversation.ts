/**
 * 对话数据模型
 */

/**
 * 思维链节点
 */
export interface FlowChainNode {
  type: string; // 'thinking' | 'processing' | 'content_output' 等
  timestamp: number;
  state: 'pending' | 'processing' | 'completed' | 'failed';
  error_msg?: string;
  content: string;
  [key: string]: any; // 支持扩展字段
}

/**
 * 用户查询
 */
export interface Query {
  id?: number;
  gmtCreate: string | Date;
  content: string;
  type: 'text' | 'audio' | 'image';
  queryId: string;
  audioUrl?: string;
  filePaths?: string[] | null;
  currentFiles?: any[] | null;
  [key: string]: any; // 支持扩展字段
}

/**
 * AI 回复
 */
export interface Reply {
  id?: number;
  gmtCreate: string | Date;
  content: string;
  type: 'text' | 'markdown' | 'json';
  flow_chain?: FlowChainNode[];
  recommendQuestion?: string[] | null;
  [key: string]: any; // 支持扩展字段
}

/**
 * 对话消息对（一问一答）
 */
export interface ConversationMessage {
  query: Query;
  reply: Reply;
}

/**
 * 对话详情
 */
export interface ConversationDetail {
  id: string; // conversationId
  user_id: string;
  smartflow_id?: string;
  title?: string;
  messages: ConversationMessage[];
  created_at: Date | string;
  updated_at: Date | string;
  [key: string]: any; // 支持扩展字段
}

/**
 * 创建对话 DTO
 */
export interface CreateConversationDto {
  user_id: string;
  smartflow_id?: string;
  title?: string;
  initialMessage?: ConversationMessage;
  [key: string]: any;
}

/**
 * 更新对话 DTO
 */
export interface UpdateConversationDto {
  title?: string;
  [key: string]: any;
}

/**
 * 添加消息 DTO
 */
export interface AddMessageDto {
  query: Omit<Query, 'id'> & { gmtCreate?: string | Date }; // gmtCreate 可选，会在 repository 中自动添加
  reply: Omit<Reply, 'id'> & { gmtCreate?: string | Date }; // gmtCreate 可选，会在 repository 中自动添加
}
