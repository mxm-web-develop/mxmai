-- ============================================
-- 钱包与用户外键关联迁移
-- 将 wallets.user_id、payment_orders.user_id 改为 UUID 并添加 users 外键
-- 执行: pnpm --filter @mxmai/mxmdata migrate:wallet-user-fk
-- ============================================

-- 1. wallets.user_id -> UUID + FK
DO $$
BEGIN
  -- 先改类型（若已是 UUID 则跳过）
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wallets' AND column_name = 'user_id' AND data_type = 'character varying'
  ) THEN
    ALTER TABLE wallets ALTER COLUMN user_id TYPE UUID USING user_id::uuid;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_wallets_user') THEN
    ALTER TABLE wallets
    ADD CONSTRAINT fk_wallets_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 2. payment_orders.user_id -> UUID + FK（允许 NULL）
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payment_orders' AND column_name = 'user_id' AND data_type = 'character varying'
  ) THEN
    UPDATE payment_orders SET user_id = NULL WHERE user_id = '' OR user_id IS NULL;
    ALTER TABLE payment_orders ALTER COLUMN user_id TYPE UUID USING user_id::uuid;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_payment_orders_user') THEN
    ALTER TABLE payment_orders
    ADD CONSTRAINT fk_payment_orders_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;
