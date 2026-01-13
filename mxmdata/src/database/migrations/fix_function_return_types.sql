-- ============================================
-- 修复函数返回类型：将 FLOAT 改为 REAL
-- ============================================
-- 问题：ts_rank 返回 REAL 类型，但函数定义使用 FLOAT（可能被解释为 DOUBLE PRECISION）
-- 解决：将返回类型改为 REAL 以匹配实际返回的数据类型

-- 1. 修复向量搜索函数
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

-- 2. 修复混合搜索函数
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

