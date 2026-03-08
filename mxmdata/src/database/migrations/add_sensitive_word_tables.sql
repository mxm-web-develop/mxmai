-- ============================================
-- 敏感词表（系统化提示词工程 - Admin 可配置）
-- sensitive_word_lists: 敏感词表主表
-- sensitive_words: 敏感词明细
-- sensitive_word_list_bindings: 细分业务绑定多张敏感词表（一个业务可绑定多个 list）
-- ============================================

-- 1. 敏感词表主表
CREATE TABLE IF NOT EXISTS sensitive_word_lists (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE sensitive_word_lists IS '敏感词表主表：一个 list 为一组可复用的敏感词集合，Admin 可 CRUD';

-- 2. 敏感词明细（一个 list 下多条词）
CREATE TABLE IF NOT EXISTS sensitive_words (
  id VARCHAR(50) PRIMARY KEY,
  list_id VARCHAR(50) NOT NULL REFERENCES sensitive_word_lists(id) ON DELETE CASCADE,
  word VARCHAR(500) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(list_id, word)
);

CREATE INDEX IF NOT EXISTS idx_sensitive_words_list_id ON sensitive_words(list_id);
COMMENT ON TABLE sensitive_words IS '敏感词明细：每条记录为 list 内一个敏感词';

-- 3. 细分业务绑定（哪个 scope/type/subtype 使用哪些敏感词表，可多表按 sort_order 排序）
CREATE TABLE IF NOT EXISTS sensitive_word_list_bindings (
  id VARCHAR(50) PRIMARY KEY,
  scope VARCHAR(50) NOT NULL,
  type VARCHAR(80) NOT NULL,
  subtype VARCHAR(80),
  list_id VARCHAR(50) NOT NULL REFERENCES sensitive_word_lists(id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 同一 (scope, type, subtype) 不能重复绑定同一 list_id；subtype 为 NULL 时用空串参与唯一
CREATE UNIQUE INDEX IF NOT EXISTS idx_swlb_unique_slot_list
  ON sensitive_word_list_bindings(scope, type, COALESCE(subtype, ''), list_id);
CREATE INDEX IF NOT EXISTS idx_swlb_scope_type_subtype ON sensitive_word_list_bindings(scope, type, subtype);
CREATE INDEX IF NOT EXISTS idx_swlb_list_id ON sensitive_word_list_bindings(list_id);
COMMENT ON TABLE sensitive_word_list_bindings IS '细分业务绑定：该 (scope,type,subtype) 使用哪些敏感词表，校验时合并多表词后检查';

-- 更新时间戳触发器 for sensitive_word_lists
CREATE OR REPLACE FUNCTION update_swl_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_swl_updated_at ON sensitive_word_lists;
CREATE TRIGGER trigger_swl_updated_at
BEFORE UPDATE ON sensitive_word_lists
FOR EACH ROW
EXECUTE FUNCTION update_swl_updated_at();
