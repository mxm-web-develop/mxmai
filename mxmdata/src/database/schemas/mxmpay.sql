-- mxmpay 模块数据库表结构
-- 适用于 Supabase (PostgreSQL)

-- 资产配置表
CREATE TABLE IF NOT EXISTS assets (
  code VARCHAR(64) PRIMARY KEY, -- 资产代码，如 'CNY', 'USD', 'USDT-ERC20'
  name VARCHAR(128) NOT NULL, -- 资产名称
  symbol VARCHAR(16) NOT NULL, -- 资产符号
  type VARCHAR(16) NOT NULL, -- 'fiat' 或 'crypto'
  decimals INTEGER NOT NULL DEFAULT 2, -- 小数位数
  enabled BOOLEAN DEFAULT true, -- 是否启用
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 钱包表
CREATE TABLE IF NOT EXISTS wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(64) NOT NULL,
  asset_code VARCHAR(64) NOT NULL REFERENCES assets(code),
  available_balance DECIMAL(36, 18) DEFAULT 0, -- 可用余额
  frozen_balance DECIMAL(36, 18) DEFAULT 0, -- 冻结余额
  status VARCHAR(20) DEFAULT 'active', -- 'active' 或 'frozen'
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, asset_code)
);

-- 钱包交易记录表
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  user_id VARCHAR(64) NOT NULL,
  asset_code VARCHAR(64) NOT NULL,
  type VARCHAR(16) NOT NULL, -- 'deposit', 'withdraw', 'freeze', 'unfreeze', 'transfer'
  amount DECIMAL(36, 18) NOT NULL, -- 交易金额
  balance_before DECIMAL(36, 18) NOT NULL, -- 交易前余额
  balance_after DECIMAL(36, 18) NOT NULL, -- 交易后余额
  reference_id VARCHAR(128), -- 关联的业务ID（如订单ID、任务ID）
  metadata JSONB, -- 额外信息
  created_at TIMESTAMP DEFAULT NOW()
);

-- 钱包任务表（充值、支付等）
CREATE TABLE IF NOT EXISTS wallet_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(64) NOT NULL,
  payment_id UUID, -- 关联的支付订单ID
  type VARCHAR(16) NOT NULL, -- 'deposit' 或 'payment'
  asset_code VARCHAR(64) NOT NULL,
  amount DECIMAL(36, 18) NOT NULL,
  channel VARCHAR(32) NOT NULL, -- 渠道（如 'crypto', 'alipay'）
  status VARCHAR(16) DEFAULT 'pending', -- 'pending', 'processing', 'success', 'failed'
  biz_type VARCHAR(64), -- 业务类型
  biz_id VARCHAR(128), -- 业务ID
  metadata JSONB, -- 额外信息（如交易哈希）
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 支付订单表
CREATE TABLE IF NOT EXISTS payment_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(64),
  order_no VARCHAR(64) UNIQUE NOT NULL, -- 订单号
  order_type VARCHAR(32) NOT NULL, -- 'recharge', 'subscription', 'purchase'
  amount DECIMAL(18, 6) NOT NULL,
  currency VARCHAR(16) NOT NULL,
  payment_channel VARCHAR(16) NOT NULL, -- 'alipay', 'wechat', 'paypal', 'card', 'crypto'
  payment_method VARCHAR(16), -- 'eth', 'usdt', 'usdc', 'btc'
  status VARCHAR(16) DEFAULT 'pending', -- 'pending', 'paid', 'failed', 'cancelled', 'refunded', 'expired'
  to_address VARCHAR(128), -- 收款地址
  asset_code VARCHAR(64), -- 资产代码（crypto 渠道使用）
  biz_type VARCHAR(64), -- 业务类型
  biz_id VARCHAR(128), -- 业务ID
  expires_at TIMESTAMP NOT NULL,
  third_party_order_id VARCHAR(128), -- 第三方订单ID
  third_party_transaction_id VARCHAR(128), -- 第三方交易ID
  payment_url TEXT, -- 支付链接
  qr_code_data_url TEXT, -- 二维码数据URL
  payment_params JSONB, -- 支付参数
  description TEXT,
  metadata JSONB, -- 元数据
  callback_data JSONB, -- 回调数据
  callback_received_at TIMESTAMP,
  paid_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_wallets_asset_code ON wallets(asset_code);
CREATE INDEX IF NOT EXISTS idx_wallets_user_asset ON wallets(user_id, asset_code);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet_id ON wallet_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_id ON wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_asset_code ON wallet_transactions(asset_code);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_created_at ON wallet_transactions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_tasks_user_id ON wallet_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_tasks_payment_id ON wallet_tasks(payment_id);
CREATE INDEX IF NOT EXISTS idx_wallet_tasks_status ON wallet_tasks(status);
CREATE INDEX IF NOT EXISTS idx_wallet_tasks_type ON wallet_tasks(type);

CREATE INDEX IF NOT EXISTS idx_payment_orders_user_id ON payment_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_orders_order_no ON payment_orders(order_no);
CREATE INDEX IF NOT EXISTS idx_payment_orders_status ON payment_orders(status);
CREATE INDEX IF NOT EXISTS idx_payment_orders_third_party_order_id ON payment_orders(third_party_order_id);
CREATE INDEX IF NOT EXISTS idx_payment_orders_expires_at ON payment_orders(expires_at);

-- 更新时间戳触发器
CREATE TRIGGER update_assets_updated_at
  BEFORE UPDATE ON assets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_wallets_updated_at
  BEFORE UPDATE ON wallets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_wallet_tasks_updated_at
  BEFORE UPDATE ON wallet_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payment_orders_updated_at
  BEFORE UPDATE ON payment_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

