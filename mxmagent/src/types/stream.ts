/**
 * 流式数据格式定义
 * 支持 chat-flow 和 smartflow 两种场景
 */

/**
 * 回复内容
 */
export interface ReplyContent {
  content: string;
  type: 'markdown' | 'text' | 'json';
}

/**
 * Chat Flow 流式数据块
 */
export interface ChatFlowChunk {
  conversationId: string;
  queryId: string;
  lastDate: number;
  status: number; // 1: processing, 2: completed, 3: error
  node_name: string;
  reply: ReplyContent;
  espTime?: number | null; // 预计剩余时间（毫秒）
  tokens?: number;
  [key: string]: any; // 支持扩展字段
}

/**
 * Smartflow 流式数据块
 */
export interface SmartflowChunk {
  task_id: string;
  flow_name: string;
  node_name: string;
  node_state: 'pending' | 'processing' | 'completed' | 'error' | 'failed';
  reply: ReplyContent;
  tokens?: number;
  flow_chain?: any[]; // 思维链数据（可选）
  [key: string]: any; // 支持扩展字段
}

/**
 * 统一的流式数据块类型
 */
export type StreamChunk = ChatFlowChunk | SmartflowChunk;

/**
 * 判断是否为 ChatFlowChunk
 */
export function isChatFlowChunk(chunk: StreamChunk): chunk is ChatFlowChunk {
  return 'conversationId' in chunk && 'queryId' in chunk;
}

/**
 * 判断是否为 SmartflowChunk
 */
export function isSmartflowChunk(chunk: StreamChunk): chunk is SmartflowChunk {
  return 'task_id' in chunk && 'flow_name' in chunk;
}
