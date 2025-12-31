-- Supabase 本地开发初始化脚本
-- 用于设置 PostgREST 所需的角色和权限

-- 创建 auth schema（GoTrue 需要）
CREATE SCHEMA IF NOT EXISTS auth;

-- 创建必要的角色
DO $$
BEGIN
  -- 创建 anon 角色（匿名访问）
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;

  -- 创建 authenticated 角色（认证用户）
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;

  -- 创建 service_role 角色（服务端访问，有更高权限）
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
END
$$;

-- 授予基本权限
GRANT anon TO authenticated;
GRANT authenticated TO service_role;

-- 授予 schema 访问权限
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- 授予表权限（对所有现有表）
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;

-- 授予序列权限
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- 设置默认权限（对新创建的表）
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated, service_role;

-- 创建 Realtime 扩展所需的 schema（如果使用 Realtime）
CREATE SCHEMA IF NOT EXISTS _realtime;
GRANT USAGE ON SCHEMA _realtime TO postgres, anon, authenticated, service_role;

-- 注意：PostgREST 使用 anon 角色作为默认角色
-- 可以通过 JWT token 中的 role 声明来切换角色

