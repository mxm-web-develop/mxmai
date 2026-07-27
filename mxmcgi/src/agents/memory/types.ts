/**
 * Agent Memory - Type Definitions
 * 用户长期记忆相关类型定义
 */

/** 记忆类型 */
export type MemoryType = 'summary' | 'preference' | 'fact' | 'context';

/** 记忆元数据 */
export interface MemoryMetadata {
  /** 对话 ID */
  conversation_id?: string;
  /** 记忆来源 */
  extracted_from?: 'user_message' | 'assistant_response' | 'auto_summary';
  /** 关键词 */
  keywords?: string[];
  /** 过期时间（可选） */
  expires_at?: string;
  /** 用户 ID（用于过滤） */
  user_id: string;
  /** 关联的业务节点 */
  related_node?: string;
}

/** 记忆文档 */
export interface MemoryDocument {
  id: string;
  user_id: string;
  content: string;
  memory_type: MemoryType;
  importance: number;
  embedding?: number[];
  metadata?: MemoryMetadata;
  created_at: string;
  updated_at: string;
}

/** 记忆搜索结果 */
export interface MemorySearchResult {
  id: string;
  content: string;
  memory_type: MemoryType;
  importance: number;
  relevance_score: number;
  metadata?: MemoryMetadata;
}

/** 创建记忆 DTO */
export interface CreateMemoryDto {
  user_id: string;
  content: string;
  memory_type?: MemoryType;
  importance?: number;
  metadata?: Partial<MemoryMetadata>;
}

/** 搜索记忆 DTO */
export interface SearchMemoryDto {
  user_id: string;
  query: string;
  query_embedding?: number[];
  memory_types?: MemoryType[];
  limit?: number;
  threshold?: number;
}

/** 更新记忆 DTO */
export interface UpdateMemoryDto {
  content?: string;
  memory_type?: MemoryType;
  importance?: number;
  metadata?: Partial<MemoryMetadata>;
  embedding?: number[];
}

/** 对话摘要结果 */
export interface ConversationSummary {
  summary: string;
  importance: number;
  keywords: string[];
  memory_type: MemoryType;
}
