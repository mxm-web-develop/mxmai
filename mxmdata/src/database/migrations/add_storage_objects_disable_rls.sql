-- storage_objects 由 mxmcgi 后端经 Gateway 鉴权后写入（x-user-id），不经 Supabase Auth JWT。
-- 使用 anon key 时 RLS（user_id = auth.uid()）会导致 insert 失败。
-- 若已配置 SUPABASE_SERVICE_KEY（service_role 绕过 RLS）可跳过本迁移。
ALTER TABLE IF EXISTS storage_objects DISABLE ROW LEVEL SECURITY;
