-- ============================================
-- 知识库默认绑定表 (knowledge_base_defaults)
-- 用于配置各业务场景（如 graph）中 (category, subType) 对应的默认知识库
-- Admin 可通过 API 进行增删改查
-- ============================================

CREATE TABLE IF NOT EXISTS knowledge_base_defaults (
  id VARCHAR(50) PRIMARY KEY,
  
  -- 业务域
  scope VARCHAR(50) NOT NULL,              -- 如 'graph', 'writing'
  category VARCHAR(50) NOT NULL,            -- 如 'photograph', 'design', 'painting'
  sub_type VARCHAR(50) NOT NULL,           -- 如 'portrait', 'landscape', '3d'
  
  -- 默认知识库
  knowledge_base_id VARCHAR(50) NOT NULL,   -- 关联 knowledge_bases.id
  
  -- 时间戳
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- 每个 (scope, category, sub_type) 只能有一个默认
  UNIQUE(scope, category, sub_type)
);

-- 外键（可选，确保知识库存在，幂等）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_kbd_knowledge_base'
  ) THEN
    ALTER TABLE knowledge_base_defaults
    ADD CONSTRAINT fk_kbd_knowledge_base
    FOREIGN KEY (knowledge_base_id)
    REFERENCES knowledge_bases(id)
    ON DELETE CASCADE;
  END IF;
END $$;

-- 索引
CREATE INDEX IF NOT EXISTS idx_kbd_scope_category_sub ON knowledge_base_defaults(scope, category, sub_type);
CREATE INDEX IF NOT EXISTS idx_kbd_kb_id ON knowledge_base_defaults(knowledge_base_id);

-- 更新时间戳触发器
CREATE OR REPLACE FUNCTION update_kbd_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_kbd_updated_at ON knowledge_base_defaults;
CREATE TRIGGER trigger_kbd_updated_at
BEFORE UPDATE ON knowledge_base_defaults
FOR EACH ROW
EXECUTE FUNCTION update_kbd_updated_at();
