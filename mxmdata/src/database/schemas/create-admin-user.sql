-- ============================================
-- 创建 Admin 用户 SQL 脚本
-- ============================================
-- 
-- 使用方法：
-- 1. 替换下面的密码哈希（使用 create-admin-user.ts 脚本生成）
-- 2. 在 Supabase SQL Editor 中执行
--
-- 或者直接使用 create-admin-user.ts 脚本（推荐）
-- ============================================

-- 创建 admin 用户
-- ⚠️ 注意：请先使用 create-admin-user.ts 脚本生成密码哈希，然后替换下面的哈希值
INSERT INTO users (
  username,
  email,
  password_hash,
  role,
  status,
  level,
  balance,
  membership_type
) VALUES (
  'admin',                    -- 用户名
  'admin@example.com',        -- 邮箱
  'password123',  -- ⚠️ 请替换为实际密码哈希
  'admin',                    -- 角色：admin
  'active',                   -- 状态：active
  10,                         -- 等级
  1000.00,                       -- 余额
  'premium'                   -- 会员类型
) ON CONFLICT (username) DO UPDATE
SET 
  role = 'admin',
  status = 'active',
  level = 10,
  membership_type = 'premium';

-- 创建用户设置（如果不存在）
INSERT INTO user_settings (user_id, theme, language, notifications_enabled)
SELECT id, 'dark', 'zh', true
FROM users
WHERE username = 'admin'
ON CONFLICT (user_id) DO UPDATE
SET 
  theme = 'dark',
  language = 'zh',
  notifications_enabled = true;

-- 验证创建结果
SELECT 
  id,
  username,
  email,
  role,
  status,
  level,
  membership_type,
  created_at
FROM users
WHERE username = 'admin';

