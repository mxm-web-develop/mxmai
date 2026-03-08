-- ============================================
-- 知识库快速设置 SQL
-- 在 Supabase SQL Editor 中执行此文件
-- ============================================

-- 第一步：启用 pgvector 扩展（必需）
CREATE EXTENSION IF NOT EXISTS vector;

-- 第二步：创建知识库表（执行 knowledge_base.sql 的其余内容）
-- 请复制 mxmdata/src/database/schemas/knowledge_base.sql 文件中的内容
-- 从第 9 行开始（跳过扩展创建语句，因为上面已经执行了）

