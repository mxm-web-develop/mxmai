-- ============================================
-- mxmprompt 模块数据库表结构
-- 向量数据库表结构设计
-- 支持多任务类型的提示词优化系统
-- ============================================

-- 启用 pgvector 扩展（如果使用 PostgreSQL）
-- CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- 1. 主力模型表 (base_models)
-- ============================================

CREATE TABLE IF NOT EXISTS base_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 基本信息
  name VARCHAR(100) NOT NULL,
  model_id VARCHAR(200) NOT NULL UNIQUE,  -- 如: flux-1.1-pro, suno-v3
  description TEXT,
  
  -- 任务类型支持
  task_type VARCHAR(50) NOT NULL,          -- image_generation, music_generation
  supported_subtypes TEXT[],               -- ['portrait', 'fashion', 'landscape']
  
  -- 模型元数据
  provider VARCHAR(50),                    -- replicate, huggingface, suno, etc.
  model_url TEXT,
  api_endpoint TEXT,
  version VARCHAR(50),
  
  -- 能力描述（用于向量化）
  capability_description TEXT NOT NULL,    -- 用于生成 embedding
  use_cases TEXT[],                        -- 适用场景
  
  -- 向量
  embedding vector(1536),                  -- OpenAI text-embedding-3-small
  
  -- 统计信息
  usage_count INTEGER DEFAULT 0,
  success_rate DECIMAL(5, 2) DEFAULT 0.00,
  average_quality_rating DECIMAL(3, 2),
  
  -- 配置信息
  default_params JSONB,                    -- 默认参数配置
  metadata JSONB,                          -- 扩展元数据
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_base_models_task_type ON base_models(task_type);
CREATE INDEX IF NOT EXISTS idx_base_models_model_id ON base_models(model_id);
CREATE INDEX IF NOT EXISTS idx_base_models_embedding ON base_models USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ============================================
-- 2. LoRA 模型表 (lora_models)
-- ============================================

CREATE TABLE IF NOT EXISTS lora_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 基本信息
  name VARCHAR(100) NOT NULL,
  description TEXT,
  
  -- 任务类型（仅图像生成支持 LoRA）
  task_type VARCHAR(50) NOT NULL DEFAULT 'image_generation',
  category VARCHAR(50),                    -- portrait, fashion, style, etc.
  
  -- 存储信息
  storage_type VARCHAR(20) NOT NULL,       -- replicate, huggingface, s3
  model_url TEXT,
  model_id VARCHAR(200),
  huggingface_path VARCHAR(200),
  s3_path TEXT,
  
  -- 模型配置
  base_model VARCHAR(100),                 -- 适配的基础模型
  trigger_words TEXT[],
  strength DECIMAL(3, 2) DEFAULT 0.8,
  recommended_strength DECIMAL(3, 2),
  
  -- 能力描述（用于向量化）
  capability_description TEXT NOT NULL,
  
  -- 向量
  embedding vector(1536),
  
  -- 权限
  is_public BOOLEAN DEFAULT true,
  owner_id UUID,
  is_system BOOLEAN DEFAULT false,
  
  -- 统计
  usage_count INTEGER DEFAULT 0,
  success_rate DECIMAL(5, 2) DEFAULT 0.00,
  
  -- 元数据
  tags TEXT[],
  example_outputs TEXT[],                  -- 示例输出 URL
  metadata JSONB,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_lora_models_task_type ON lora_models(task_type);
CREATE INDEX IF NOT EXISTS idx_lora_models_category ON lora_models(category);
CREATE INDEX IF NOT EXISTS idx_lora_models_embedding ON lora_models USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_lora_models_owner ON lora_models(owner_id) WHERE owner_id IS NOT NULL;

-- ============================================
-- 3. 提示词模板表 (prompt_templates)
-- ============================================

CREATE TABLE IF NOT EXISTS prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 基本信息
  name VARCHAR(100) NOT NULL,
  template TEXT NOT NULL,                  -- 模板文本，支持变量 {{variable}}
  description TEXT,
  
  -- 任务类型
  task_type VARCHAR(50) NOT NULL,         -- image_generation, music_generation
  category VARCHAR(50),                    -- scene, lighting, style, genre, mood
  
  -- 模板变量
  variables JSONB,                         -- 变量定义和默认值
  -- 示例: {"subject": "person", "scene": "close-up", "lighting": "studio"}
  
  -- 能力描述（用于向量化）
  capability_description TEXT NOT NULL,
  
  -- 向量
  embedding vector(1536),
  
  -- 质量评估
  quality_score DECIMAL(5, 2) DEFAULT 0.00,
  usage_count INTEGER DEFAULT 0,
  success_rate DECIMAL(5, 2) DEFAULT 0.00,
  
  -- 元数据
  example_outputs TEXT[],                  -- 使用此模板的成功案例
  metadata JSONB,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_prompt_templates_task_type ON prompt_templates(task_type);
CREATE INDEX IF NOT EXISTS idx_prompt_templates_category ON prompt_templates(category);
CREATE INDEX IF NOT EXISTS idx_prompt_templates_embedding ON prompt_templates USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ============================================
-- 4. 生成案例表 (generation_cases)
-- ============================================

CREATE TABLE IF NOT EXISTS generation_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 任务信息
  task_type VARCHAR(50) NOT NULL,
  task_id VARCHAR(100),                    -- 原始任务 ID
  
  -- 输入
  original_prompt TEXT NOT NULL,
  optimized_prompt TEXT,
  user_description TEXT,                    -- 用户原始描述
  
  -- 使用的模型
  base_model_id UUID REFERENCES base_models(id),
  lora_model_id UUID REFERENCES lora_models(id),
  
  -- 任务参数
  task_params JSONB,                       -- 任务特定参数
  -- 图像: {scene, lens, lighting, style}
  -- 音乐: {genre, mood, tempo, duration}
  
  -- 结果
  output_url TEXT,                          -- 生成结果 URL
  quality_rating DECIMAL(3, 2),            -- 质量评分
  user_feedback JSONB,                      -- 用户反馈
  
  -- 向量（用于 RAG 召回）
  original_prompt_embedding vector(1536),
  optimized_prompt_embedding vector(1536),
  
  -- 元数据
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_generation_cases_task_type ON generation_cases(task_type);
CREATE INDEX IF NOT EXISTS idx_generation_cases_base_model ON generation_cases(base_model_id);
CREATE INDEX IF NOT EXISTS idx_generation_cases_original_embedding ON generation_cases USING ivfflat (original_prompt_embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_generation_cases_optimized_embedding ON generation_cases USING ivfflat (optimized_prompt_embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_generation_cases_quality ON generation_cases(quality_rating DESC) WHERE quality_rating IS NOT NULL;

-- ============================================
-- 5. 初始化数据示例
-- ============================================

-- 插入图像生成主力模型示例
INSERT INTO base_models (name, model_id, description, task_type, capability_description, use_cases, default_params, provider)
VALUES 
  (
    'Flux 1.1 Pro',
    'flux-1.1-pro',
    '高质量图像生成模型，适合专业摄影、人像、风景等场景',
    'image_generation',
    'professional photography, high quality, detailed, photorealistic, portrait, landscape, studio lighting',
    ARRAY['portrait', 'fashion', 'landscape', 'product'],
    '{"width": 1024, "height": 1024, "steps": 28, "guidance_scale": 3.5}'::jsonb,
    'replicate'
  ),
  (
    'Stable Diffusion XL',
    'stable-diffusion-xl',
    '通用图像生成模型，适合多种风格和场景',
    'image_generation',
    'general purpose image generation, versatile, various styles, high quality',
    ARRAY['general', 'artistic', 'creative'],
    '{"width": 1024, "height": 1024, "steps": 30, "guidance_scale": 7.5}'::jsonb,
    'replicate'
  ),
  (
    'Suno v3.5',
    'suno-v3.5',
    '高质量音乐生成模型，支持人声和器乐',
    'music_generation',
    'music generation, vocal, instrumental, various genres, high quality audio, song creation',
    ARRAY['vocal', 'instrumental', 'bgm', 'soundtrack'],
    '{"duration": 120, "instrumental": false, "custom_mode": false}'::jsonb,
    'suno'
  )
ON CONFLICT (model_id) DO NOTHING;

-- ============================================
-- 6. RPC 函数（用于向量搜索）
-- ============================================

-- 注意：这些函数需要在 Supabase 中创建
-- 以下是函数定义示例，需要在 Supabase SQL Editor 中执行

-- 搜索主力模型
CREATE OR REPLACE FUNCTION search_base_models(
  query_embedding vector(1536),
  task_type text,
  match_limit int DEFAULT 5,
  match_threshold float DEFAULT 0.5
)
RETURNS TABLE (
  id uuid,
  name varchar,
  model_id varchar,
  description text,
  use_cases text[],
  default_params jsonb,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    bm.id,
    bm.name,
    bm.model_id,
    bm.description,
    bm.use_cases,
    bm.default_params,
    bm.metadata,
    1 - (bm.embedding <-> query_embedding) AS similarity
  FROM base_models bm
  WHERE bm.task_type = search_base_models.task_type
    AND bm.embedding IS NOT NULL
    AND (1 - (bm.embedding <-> query_embedding)) >= match_threshold
  ORDER BY bm.embedding <-> query_embedding
  LIMIT match_limit;
END;
$$;

-- 搜索 LoRA 模型
CREATE OR REPLACE FUNCTION search_lora_models(
  query_embedding vector(1536),
  task_type text,
  user_id uuid DEFAULT NULL,
  match_limit int DEFAULT 5,
  match_threshold float DEFAULT 0.5
)
RETURNS TABLE (
  id uuid,
  name varchar,
  task_type varchar,
  description text,
  storage_type varchar,
  model_url text,
  trigger_words text[],
  recommended_strength decimal,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    lm.id,
    lm.name,
    lm.task_type,
    lm.description,
    lm.storage_type,
    lm.model_url,
    lm.trigger_words,
    lm.recommended_strength,
    lm.metadata,
    1 - (lm.embedding <-> query_embedding) AS similarity
  FROM lora_models lm
  WHERE lm.task_type = search_lora_models.task_type
    AND lm.embedding IS NOT NULL
    AND (lm.is_public = true OR lm.owner_id = user_id)
    AND (1 - (lm.embedding <-> query_embedding)) >= match_threshold
  ORDER BY lm.embedding <-> query_embedding
  LIMIT match_limit;
END;
$$;

-- 搜索提示词模板
CREATE OR REPLACE FUNCTION search_prompt_templates(
  query_embedding vector(1536),
  task_type text,
  match_limit int DEFAULT 5,
  match_threshold float DEFAULT 0.5
)
RETURNS TABLE (
  id uuid,
  name varchar,
  template text,
  category varchar,
  variables jsonb,
  quality_score decimal,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pt.id,
    pt.name,
    pt.template,
    pt.category,
    pt.variables,
    pt.quality_score,
    pt.metadata,
    1 - (pt.embedding <-> query_embedding) AS similarity
  FROM prompt_templates pt
  WHERE pt.task_type = search_prompt_templates.task_type
    AND pt.embedding IS NOT NULL
    AND (1 - (pt.embedding <-> query_embedding)) >= match_threshold
  ORDER BY pt.embedding <-> query_embedding
  LIMIT match_limit;
END;
$$;

-- 搜索相似案例
CREATE OR REPLACE FUNCTION search_similar_cases(
  query_embedding vector(1536),
  task_type text,
  match_limit int DEFAULT 5,
  match_threshold float DEFAULT 0.5
)
RETURNS TABLE (
  id uuid,
  task_type varchar,
  task_id varchar,
  original_prompt text,
  optimized_prompt text,
  user_description text,
  base_model_id uuid,
  lora_model_id uuid,
  task_params jsonb,
  output_url text,
  quality_rating decimal,
  user_feedback jsonb,
  metadata jsonb,
  created_at timestamp,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    gc.id,
    gc.task_type,
    gc.task_id,
    gc.original_prompt,
    gc.optimized_prompt,
    gc.user_description,
    gc.base_model_id,
    gc.lora_model_id,
    gc.task_params,
    gc.output_url,
    gc.quality_rating,
    gc.user_feedback,
    gc.metadata,
    gc.created_at,
    GREATEST(
      CASE WHEN gc.original_prompt_embedding IS NOT NULL 
        THEN 1 - (gc.original_prompt_embedding <-> query_embedding) 
        ELSE 0 END,
      CASE WHEN gc.optimized_prompt_embedding IS NOT NULL 
        THEN 1 - (gc.optimized_prompt_embedding <-> query_embedding) 
        ELSE 0 END
    ) AS similarity
  FROM generation_cases gc
  WHERE gc.task_type = search_similar_cases.task_type
    AND (gc.original_prompt_embedding IS NOT NULL OR gc.optimized_prompt_embedding IS NOT NULL)
    AND GREATEST(
      CASE WHEN gc.original_prompt_embedding IS NOT NULL 
        THEN 1 - (gc.original_prompt_embedding <-> query_embedding) 
        ELSE 0 END,
      CASE WHEN gc.optimized_prompt_embedding IS NOT NULL 
        THEN 1 - (gc.optimized_prompt_embedding <-> query_embedding) 
        ELSE 0 END
    ) >= match_threshold
  ORDER BY similarity DESC
  LIMIT match_limit;
END;
$$;
