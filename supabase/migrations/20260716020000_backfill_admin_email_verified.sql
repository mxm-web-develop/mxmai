-- 迭代期：已有管理员账号视为邮箱已验证，避免无法登录
UPDATE users
SET email_verified_at = COALESCE(email_verified_at, created_at, NOW())
WHERE role = 'admin'
  AND email_verified_at IS NULL;
