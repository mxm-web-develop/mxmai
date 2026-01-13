-- ============================================
-- 知识库系统数据库表结构
-- 支持多知识库、向量检索、关键词检索、混合检索
-- ============================================

-- 启用 pgvector 扩展（如果尚未启用）
-- ⚠️ 重要：必须先执行此语句，否则无法创建 vector 类型的列
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- 1. 知识库配置表 (knowledge_bases)
-- ============================================

CREATE TABLE IF NOT EXISTS knowledge_bases (
  id VARCHAR(50) PRIMARY KEY,
  
  -- 基本信息
  name VARCHAR(100) UNIQUE NOT NULL,        -- 知识库名称（唯一标识）
  display_name VARCHAR(200) NOT NULL,       -- 显示名称
  description TEXT,
  
  -- 配置
  type VARCHAR(20) DEFAULT 'hybrid',       -- 'vector' | 'keyword' | 'hybrid'
  embedding_model VARCHAR(100) DEFAULT 'text-embedding-3-small',
  
  -- 关联信息
  agent_id VARCHAR(100),                   -- 关联的 agent ID
  agent_name VARCHAR(200),                 -- agent 名称
  
  -- 权限
  is_builtin BOOLEAN DEFAULT false,        -- 是否为内置知识库
  is_public BOOLEAN DEFAULT false,         -- 是否公开
  owner_id UUID,                           -- 创建者（用户 ID）
  
  -- 统计
  document_count INTEGER DEFAULT 0,        -- 文档数量
  total_size_bytes BIGINT DEFAULT 0,       -- 总大小（字节）
  
  -- 配置
  config JSONB DEFAULT '{}',               -- 扩展配置
  
  -- 时间戳
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_kb_agent_id ON knowledge_bases(agent_id);
CREATE INDEX IF NOT EXISTS idx_kb_owner_id ON knowledge_bases(owner_id);
CREATE INDEX IF NOT EXISTS idx_kb_name ON knowledge_bases(name);
CREATE INDEX IF NOT EXISTS idx_kb_is_public ON knowledge_bases(is_public);

-- ============================================
-- 2. 知识库文档表 (knowledge_base_documents)
-- ============================================

CREATE TABLE IF NOT EXISTS knowledge_base_documents (
  id VARCHAR(50) PRIMARY KEY,
  
  -- 知识库标识（关键字段，用于隔离不同知识库）
  knowledge_base_name VARCHAR(100) NOT NULL,  -- 关联 knowledge_bases.name
  
  -- 文档内容
  title VARCHAR(500),                        -- 文档标题
  content TEXT NOT NULL,                      -- 文档内容
  content_type VARCHAR(50) DEFAULT 'text',   -- 'text' | 'markdown' | 'html'
  
  -- 向量（1536 维，OpenAI text-embedding-3-small）
  embedding vector(1536),
  
  -- 元数据
  metadata JSONB DEFAULT '{}',                -- 扩展元数据（来源、作者、分类等）
  tags TEXT[],                                -- 标签数组
  
  -- 权限控制
  user_id UUID,                               -- 所属用户（用户自定义知识库）
  is_public BOOLEAN DEFAULT false,            -- 是否公开
  
  -- 统计
  view_count INTEGER DEFAULT 0,              -- 查看次数
  
  -- 时间戳
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 索引
-- 1. 知识库名称索引（用于快速过滤）
CREATE INDEX IF NOT EXISTS idx_kb_docs_kb_name ON knowledge_base_documents(knowledge_base_name);

-- 2. 向量索引（IVFFlat，适合 < 100K 向量）
CREATE INDEX IF NOT EXISTS idx_kb_docs_embedding ON knowledge_base_documents 
USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 100);

-- 3. 标签索引（用于关键词搜索）
CREATE INDEX IF NOT EXISTS idx_kb_docs_tags ON knowledge_base_documents USING GIN(tags);

-- 4. 全文搜索索引（用于关键词搜索）
CREATE INDEX IF NOT EXISTS idx_kb_docs_content_fts ON knowledge_base_documents 
USING GIN(to_tsvector('english', content));

-- 5. 用户 ID 索引
CREATE INDEX IF NOT EXISTS idx_kb_docs_user_id ON knowledge_base_documents(user_id);

-- 6. 复合索引（知识库 + 公开状态）
CREATE INDEX IF NOT EXISTS idx_kb_docs_kb_public ON knowledge_base_documents(knowledge_base_name, is_public);

-- 外键约束（可选，确保知识库存在）
-- ALTER TABLE knowledge_base_documents 
-- ADD CONSTRAINT fk_kb_docs_kb_name 
-- FOREIGN KEY (knowledge_base_name) 
-- REFERENCES knowledge_bases(name) 
-- ON DELETE CASCADE;

-- ============================================
-- 3. RPC 函数：向量搜索
-- ============================================

CREATE OR REPLACE FUNCTION search_knowledge_base(
  query_embedding vector(1536),
  kb_name VARCHAR(100),
  match_limit INTEGER DEFAULT 5,
  match_threshold FLOAT DEFAULT 0.7,
  user_id_filter UUID DEFAULT NULL
)
RETURNS TABLE (
  id VARCHAR(50),
  title VARCHAR(500),
  content TEXT,
  similarity REAL,
  metadata JSONB,
  tags TEXT[]
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.title,
    d.content,
    1 - (d.embedding <=> query_embedding) AS similarity,
    d.metadata,
    d.tags
  FROM knowledge_base_documents d
  WHERE 
    d.knowledge_base_name = kb_name
    AND (d.is_public = true OR d.user_id = user_id_filter)
    AND d.embedding IS NOT NULL
    AND (1 - (d.embedding <=> query_embedding)) >= match_threshold
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_limit;
END;
$$;

-- ============================================
-- 4. RPC 函数：混合搜索（向量 + 关键词）
-- ============================================

CREATE OR REPLACE FUNCTION hybrid_search_knowledge_base(
  query_embedding vector(1536),
  keyword TEXT,
  kb_name VARCHAR(100),
  match_limit INTEGER DEFAULT 5,
  match_threshold FLOAT DEFAULT 0.7,
  vector_weight FLOAT DEFAULT 0.7,
  keyword_weight FLOAT DEFAULT 0.3,
  user_id_filter UUID DEFAULT NULL
)
RETURNS TABLE (
  id VARCHAR(50),
  title VARCHAR(500),
  content TEXT,
  similarity REAL,
  keyword_score REAL,
  combined_score REAL,
  metadata JSONB,
  tags TEXT[]
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.title,
    d.content,
    1 - (d.embedding <=> query_embedding) AS similarity,
    ts_rank(to_tsvector('english', d.content), plainto_tsquery('english', keyword)) AS keyword_score,
    (
      (1 - (d.embedding <=> query_embedding)) * vector_weight +
      ts_rank(to_tsvector('english', d.content), plainto_tsquery('english', keyword)) * keyword_weight
    ) AS combined_score,
    d.metadata,
    d.tags
  FROM knowledge_base_documents d
  WHERE 
    d.knowledge_base_name = kb_name
    AND (d.is_public = true OR d.user_id = user_id_filter)
    AND d.embedding IS NOT NULL
    AND (
      (1 - (d.embedding <=> query_embedding)) >= match_threshold
      OR to_tsvector('english', d.content) @@ plainto_tsquery('english', keyword)
    )
  ORDER BY combined_score DESC
  LIMIT match_limit;
END;
$$;

-- ============================================
-- 5. 触发器：更新知识库统计信息
-- ============================================

-- 当文档插入/删除时，更新知识库的文档数量
CREATE OR REPLACE FUNCTION update_kb_document_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE knowledge_bases
    SET 
      document_count = document_count + 1,
      total_size_bytes = total_size_bytes + LENGTH(NEW.content),
      updated_at = NOW()
    WHERE name = NEW.knowledge_base_name;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE knowledge_bases
    SET 
      document_count = document_count - 1,
      total_size_bytes = total_size_bytes - LENGTH(OLD.content),
      updated_at = NOW()
    WHERE name = OLD.knowledge_base_name;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_kb_document_count
AFTER INSERT OR DELETE ON knowledge_base_documents
FOR EACH ROW
EXECUTE FUNCTION update_kb_document_count();

-- ============================================
-- 6. 触发器：更新时间戳
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_kb_updated_at
BEFORE UPDATE ON knowledge_bases
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_kb_docs_updated_at
BEFORE UPDATE ON knowledge_base_documents
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

