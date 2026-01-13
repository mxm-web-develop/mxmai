-- ============================================
-- 知识库 ID 迁移：从 UUID 改为 VARCHAR (uid)
-- ============================================
-- 此脚本将知识库和文档的 id 字段从 UUID 类型改为 VARCHAR 类型
-- 注意：此操作会删除现有数据，请先备份！

-- 1. 删除现有表（如果存在数据，请先备份）
DROP TABLE IF EXISTS knowledge_base_documents CASCADE;
DROP TABLE IF EXISTS knowledge_bases CASCADE;

-- 2. 重新创建表（使用 VARCHAR id）
-- 知识库配置表
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
  document_count INTEGER DEFAULT 0,         -- 文档数量
  total_size_bytes BIGINT DEFAULT 0,       -- 总大小（字节）
  
  -- 配置
  config JSONB DEFAULT '{}',              -- 扩展配置
  
  -- 时间戳
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_kb_agent_id ON knowledge_bases(agent_id);
CREATE INDEX IF NOT EXISTS idx_kb_owner_id ON knowledge_bases(owner_id);
CREATE INDEX IF NOT EXISTS idx_kb_name ON knowledge_bases(name);
CREATE INDEX IF NOT EXISTS idx_kb_is_public ON knowledge_bases(is_public);

-- 知识库文档表
CREATE TABLE IF NOT EXISTS knowledge_base_documents (
  id VARCHAR(50) PRIMARY KEY,
  
  -- 关联
  knowledge_base_name VARCHAR(100) NOT NULL,  -- 知识库名称（外键）
  
  -- 内容
  title VARCHAR(500),
  content TEXT NOT NULL,
  content_type VARCHAR(50) DEFAULT 'text',
  
  -- 向量
  embedding vector(1536),
  
  -- 元数据
  metadata JSONB DEFAULT '{}',
  tags TEXT[],
  
  -- 权限
  user_id UUID,                               -- 所属用户（用户自定义知识库）
  is_public BOOLEAN DEFAULT false,            -- 是否公开
  
  -- 统计
  view_count INTEGER DEFAULT 0,
  
  -- 时间戳
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_kbd_kb_name ON knowledge_base_documents(knowledge_base_name);
CREATE INDEX IF NOT EXISTS idx_kbd_user_id ON knowledge_base_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_kbd_is_public ON knowledge_base_documents(is_public);
CREATE INDEX IF NOT EXISTS idx_kbd_embedding ON knowledge_base_documents USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- 注意：RPC 函数保持不变，因为它们使用的是 knowledge_base_name，而不是 id

