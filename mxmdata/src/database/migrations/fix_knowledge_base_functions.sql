-- ============================================
-- 修复知识库搜索函数：将返回类型从 UUID 改为 VARCHAR(50)
-- ============================================
-- 注意：需要先删除旧函数，因为 PostgreSQL 不允许直接修改函数的返回类型

-- 1. 删除旧的向量搜索函数
DROP FUNCTION IF EXISTS search_knowledge_base(
  vector(1536),
  VARCHAR(100),
  INTEGER,
  FLOAT,
  UUID
);

-- 2. 删除旧的混合搜索函数
DROP FUNCTION IF EXISTS hybrid_search_knowledge_base(
  vector(1536),
  TEXT,
  VARCHAR(100),
  INTEGER,
  FLOAT,
  FLOAT,
  FLOAT,
  UUID
);

-- 3. 重新创建向量搜索函数（使用 VARCHAR(50) 作为 id 类型）
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
  similarity FLOAT,
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

-- 4. 重新创建混合搜索函数（使用 VARCHAR(50) 作为 id 类型）
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
  similarity FLOAT,
  keyword_score FLOAT,
  combined_score FLOAT,
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

