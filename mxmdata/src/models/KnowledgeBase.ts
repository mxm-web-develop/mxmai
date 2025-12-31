/**
 * 知识库模型定义
 */

// ==================== 知识库配置模型 ====================

export interface KnowledgeBase {
  id: string;
  name: string;                    // 知识库唯一标识
  display_name: string;             // 显示名称
  description?: string;             // 描述
  type: 'vector' | 'keyword' | 'hybrid';  // 知识库类型
  embedding_model: string;          // embedding 模型
  agent_id?: string;                // 关联的 agent ID
  agent_name?: string;              // agent 名称
  is_builtin: boolean;             // 是否为内置知识库
  is_public: boolean;              // 是否公开
  owner_id?: string;                // 创建者 ID
  document_count: number;           // 文档数量
  total_size_bytes: number;         // 总大小（字节）
  config?: Record<string, any>;     // 扩展配置
  created_at?: Date | string;
  updated_at?: Date | string;
}

export interface CreateKnowledgeBaseDto {
  name: string;
  display_name: string;
  description?: string;
  type?: 'vector' | 'keyword' | 'hybrid';
  embedding_model?: string;
  agent_id?: string;
  agent_name?: string;
  is_builtin?: boolean;
  is_public?: boolean;
  owner_id?: string;
  config?: Record<string, any>;
}

export interface UpdateKnowledgeBaseDto {
  display_name?: string;
  description?: string;
  type?: 'vector' | 'keyword' | 'hybrid';
  agent_id?: string;
  agent_name?: string;
  is_public?: boolean;
  config?: Record<string, any>;
}

// ==================== 知识库文档模型 ====================

export interface KnowledgeDocument {
  id: string;
  knowledge_base_name: string;      // 知识库名称
  title?: string;                   // 文档标题
  content: string;                  // 文档内容
  content_type?: string;            // 内容类型
  embedding?: number[];             // 向量 embedding
  metadata?: Record<string, any>;   // 元数据
  tags?: string[];                  // 标签
  user_id?: string;                 // 所属用户
  is_public: boolean;               // 是否公开
  view_count?: number;              // 查看次数
  created_at?: Date | string;
  updated_at?: Date | string;
}

export interface CreateKnowledgeDocumentDto {
  knowledge_base_name: string;
  title?: string;
  content: string;
  content_type?: string;
  embedding?: number[];
  metadata?: Record<string, any>;
  tags?: string[];
  user_id?: string;
  is_public?: boolean;
}

export interface UpdateKnowledgeDocumentDto {
  title?: string;
  content?: string;
  content_type?: string;
  embedding?: number[];
  metadata?: Record<string, any>;
  tags?: string[];
  is_public?: boolean;
}

// ==================== 检索结果模型 ====================

export interface KnowledgeSearchResult {
  id: string;
  title?: string;
  content: string;
  similarity: number;               // 相似度分数 (0-1)
  metadata?: Record<string, any>;
  tags?: string[];
}

export interface KnowledgeHybridSearchResult extends KnowledgeSearchResult {
  keyword_score?: number;           // 关键词匹配分数
  combined_score?: number;          // 综合分数
}

