-- 添加角色关系字段（relations）
-- 用于存储角色之间的关系，如 "情侣"、"父子"、"朋友"等

-- 添加 relations 字段（JSONB 类型）
ALTER TABLE characters ADD COLUMN IF NOT EXISTS relations JSONB DEFAULT '{}';

-- 创建 GIN 索引以支持高效查询
CREATE INDEX IF NOT EXISTS idx_characters_relations ON characters USING GIN(relations);

-- 添加注释
COMMENT ON COLUMN characters.relations IS '角色关系JSONB，格式：{ "characterId1": { "characterId2": "关系描述" } }，例如：{ "char1": { "char2": "情侣" } }';

-- 通知 PostgREST 重新加载 schema
NOTIFY pgrst, 'reload schema';
