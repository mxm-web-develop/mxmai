-- 敏感词表为后端 Admin 专用，关闭 RLS 以便使用 anon key 时也能访问（权限由 API 层校验）
-- 若使用 SUPABASE_SERVICE_KEY 则无需本迁移（service_role 会绕过 RLS）
ALTER TABLE IF EXISTS sensitive_word_lists DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS sensitive_words DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS sensitive_word_list_bindings DISABLE ROW LEVEL SECURITY;
