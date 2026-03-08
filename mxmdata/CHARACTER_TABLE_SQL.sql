-- ============================================
-- Character模块数据库表结构
-- 按照 test.md 的结构设计
-- 可直接在 Supabase SQL Editor 中执行
-- ============================================
-- 
-- ⚠️ 重要：执行此 SQL 前，请先停止 PostgREST 服务：
-- cd mxmdata && docker compose stop postgrest
-- 
-- 执行此 SQL 后，再启动 PostgREST：
-- cd mxmdata && docker compose up -d postgrest
-- 
-- 然后等待 30-60 秒让 PostgREST schema cache 完全刷新
-- ============================================
-- 
-- test.md 要求的数据结构（API返回格式）：
-- {
--   id: string
--   name: string
--   nickname: string
--   age: number
--   category: string[]
--   tags: string[]
--   is_public: boolean
--   appearance: { description, reference_images: urlstring[] }
--   voice: { description, clone_voiceId, voice_example }
--   reference_videos: string[]
--   clothing_style: { description, reference_images: urlstring[] }
--   others: { personality: string, ... }
-- }
--
-- 注意：
-- 1. 数据库使用扁平化存储（关系型数据库不支持嵌套对象）
-- 2. API 返回时通过 mapToCharacter 转换为嵌套结构
-- 3. user_id, created_at, updated_at 是系统字段，数据库需要但API不返回
-- ============================================

-- 步骤 1: 删除旧表（如果存在）
DROP TABLE IF EXISTS characters CASCADE;

-- 步骤 2: 创建角色表
CREATE TABLE characters (
  -- 主键
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 系统字段（数据库需要，但API不返回）
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- 基本信息（对应 test.md）
  name VARCHAR(100) NOT NULL,
  nickname VARCHAR(100),
  age INTEGER,
  category TEXT[],
  tags TEXT[],
  is_public BOOLEAN DEFAULT false,
  
  -- appearance（外表）- 扁平化存储
  -- API返回时转换为: appearance: { description, reference_images }
  appearance_description TEXT,
  appearance_reference_images TEXT[],
  
  -- voice（声音）- 扁平化存储
  -- API返回时转换为: voice: { description, clone_voiceId, voice_example }
  voice_description TEXT,
  voice_clone_voice_id VARCHAR(255),  -- 对应 test.md 中的 clone_voiceId
  voice_example_url TEXT,              -- 对应 test.md 中的 voice_example
  
  -- reference_videos（参考视频数组）- 直接存储
  -- API返回时直接返回: reference_videos: string[]
  reference_videos TEXT[],
  
  -- clothing_style（服装风格）- 扁平化存储
  -- API返回时转换为: clothing_style: { description, reference_images }
  clothing_style_description TEXT,
  clothing_style_reference_images TEXT[],
  
  -- others（其他信息）- JSONB存储
  -- API返回时直接返回: others: { personality: string, ... }
  others JSONB DEFAULT '{}',
  
  -- 兼容字段（PostgREST schema cache 需要）
  attributes JSONB DEFAULT '{}'
);

-- 步骤 3: 创建索引
CREATE INDEX idx_characters_user_id ON characters(user_id);
CREATE INDEX idx_characters_name ON characters(name);
CREATE INDEX idx_characters_category ON characters USING GIN(category);
CREATE INDEX idx_characters_tags ON characters USING GIN(tags);
CREATE INDEX idx_characters_appearance_reference_images ON characters USING GIN(appearance_reference_images);
CREATE INDEX idx_characters_clothing_style_reference_images ON characters USING GIN(clothing_style_reference_images);
CREATE INDEX idx_characters_reference_videos ON characters USING GIN(reference_videos);
CREATE INDEX idx_characters_created_at ON characters(created_at DESC);

-- 步骤 4: 添加表注释
COMMENT ON TABLE characters IS '角色表，用于管理用户在生图、生视频、写作等场景中使用的角色';
COMMENT ON COLUMN characters.others IS '其他信息JSONB，包含personality等自定义字段';
COMMENT ON COLUMN characters.appearance_reference_images IS '外表参考图片URL数组（最多10张）';
COMMENT ON COLUMN characters.clothing_style_reference_images IS '服装风格参考图片URL数组（最多10张）';
COMMENT ON COLUMN characters.reference_videos IS '参考视频URL数组（角色短片，用于视频生成的角色一致性）';
COMMENT ON COLUMN characters.is_public IS '是否公开，只对admin账号开放此参数';

-- 步骤 5: 验证表结构（用于检查）
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'characters' 
ORDER BY ordinal_position;
