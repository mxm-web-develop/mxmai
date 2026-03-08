-- Character模块数据库表结构
-- 按照 test.md 的结构设计
-- 用于管理用户在生图、生视频、写作等场景中使用的角色

-- 删除旧表（如果存在）
DROP TABLE IF EXISTS characters CASCADE;

-- 角色表
CREATE TABLE characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- 基本信息
  name VARCHAR(100) NOT NULL,
  nickname VARCHAR(100),
  age INTEGER,
  category TEXT[],
  tags TEXT[],
  is_public BOOLEAN DEFAULT false,
  
  -- 外表（appearance）
  appearance_description TEXT,
  appearance_reference_images TEXT[],
  
  -- 声音（voice）
  voice_description TEXT,
  voice_clone_voice_id VARCHAR(255),
  voice_example_url TEXT,
  
  -- 参考视频（reference_videos，数组）
  reference_videos TEXT[],
  
  -- 服装风格（clothing_style）
  clothing_style_description TEXT,
  clothing_style_reference_images TEXT[],
  
  -- 其他信息（others，JSONB存储）
  others JSONB DEFAULT '{}',
  
  -- 兼容字段（PostgREST schema cache 需要）
  attributes JSONB DEFAULT '{}',
  
  -- 系统字段（不返回给前端，但数据库需要）
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_characters_user_id ON characters(user_id);
CREATE INDEX idx_characters_name ON characters(name);
CREATE INDEX idx_characters_category ON characters USING GIN(category);
CREATE INDEX idx_characters_tags ON characters USING GIN(tags);
CREATE INDEX idx_characters_appearance_reference_images ON characters USING GIN(appearance_reference_images);
CREATE INDEX idx_characters_clothing_style_reference_images ON characters USING GIN(clothing_style_reference_images);
CREATE INDEX idx_characters_reference_videos ON characters USING GIN(reference_videos);
CREATE INDEX idx_characters_created_at ON characters(created_at DESC);

-- 添加注释
COMMENT ON TABLE characters IS '角色表，用于管理用户在生图、生视频、写作等场景中使用的角色';
COMMENT ON COLUMN characters.others IS '其他信息JSONB，包含personality等自定义字段';
COMMENT ON COLUMN characters.appearance_reference_images IS '外表参考图片URL数组（最多10张）';
COMMENT ON COLUMN characters.clothing_style_reference_images IS '服装风格参考图片URL数组（最多10张）';
COMMENT ON COLUMN characters.reference_videos IS '参考视频URL数组（角色短片，用于视频生成的角色一致性）';
COMMENT ON COLUMN characters.is_public IS '是否公开，只对admin账号开放此参数';

-- 通知 PostgREST 重新加载 schema
NOTIFY pgrst, 'reload schema';
