-- 兜底：admin/AdminOps 后台创建过的账号（role='user'/'admin' 都被后台用过）
-- 一律视为邮箱已验证，避免迭代期 EMAIL_NOT_VERIFIED 拦截登录
-- 与 mxmauth/src/routes/account.ts:POST /admin/users 行为保持一致
UPDATE users
SET email_verified_at = COALESCE(email_verified_at, created_at, NOW())
WHERE email_verified_at IS NULL
  AND status = 'active'
  AND email IS NOT NULL
  AND (
    -- role 为 admin（之前已处理过）
    role = 'admin'
    OR
    -- role 为 user 但 created_at 极新（一般是后台手工建的，2 小时内）
    -- 注意：自注册（POST /register）用户的 email_verified_at 也为 null，
    -- 这里用 created_at 兜底一个时间阈值，避免误伤真实待验证用户。
    created_at > NOW() - INTERVAL '2 hours'
  );
