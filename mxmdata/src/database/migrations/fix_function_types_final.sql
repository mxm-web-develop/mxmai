-- ============================================
-- 最终修复：删除并重建函数（修复 REAL vs FLOAT 类型问题）
-- ============================================

-- 1. 删除所有 search_knowledge_base 函数的重载版本
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT proname, oidvectortypes(proargtypes) as argtypes
        FROM pg_proc 
        WHERE proname = 'search_knowledge_base'
    ) LOOP
        EXECUTE format('DROP FUNCTION IF EXISTS %s(%s) CASCADE', r.proname, r.argtypes);
    END LOOP;
END $$;

-- 2. 删除所有 hybrid_search_knowledge_base 函数的重载版本
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT proname, oidvectortypes(proargtypes) as argtypes
        FROM pg_proc 
        WHERE proname = 'hybrid_search_knowledge_base'
    ) LOOP
        EXECUTE format('DROP FUNCTION IF EXISTS %s(%s) CASCADE', r.proname, r.argtypes);
    END LOOP;
END $$;

-- 3. 重新创建向量搜索函数（使用 REAL 类型）
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
    1 - (d.embedding <=> query_embedding)::REAL AS similarity,
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

-- 4. 重新创建混合搜索函数（使用 REAL 类型）
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
    (1 - (d.embedding <=> query_embedding))::REAL AS similarity,
    ts_rank(to_tsvector('english', d.content), plainto_tsquery('english', keyword)) AS keyword_score,
    (
      (1 - (d.embedding <=> query_embedding))::REAL * vector_weight +
      ts_rank(to_tsvector('english', d.content), plainto_tsquery('english', keyword)) * keyword_weight
    )::REAL AS combined_score,
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

-- 5. 验证函数已创建
SELECT 
    proname as function_name,
    pg_get_function_arguments(oid) as arguments,
    pg_get_function_result(oid) as return_type
FROM pg_proc 
WHERE proname IN ('search_knowledge_base', 'hybrid_search_knowledge_base')
ORDER BY proname;

