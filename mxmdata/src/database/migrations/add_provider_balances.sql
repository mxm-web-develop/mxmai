-- Provider 余额表：Admin 手动录入，任务完成后按 provider_pricing 扣减
-- 运行: pnpm --filter @mxmai/mxmdata run migrate:provider-balances

CREATE TABLE IF NOT EXISTS provider_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(32) NOT NULL UNIQUE,
  balance NUMERIC(20, 8) NOT NULL DEFAULT 0,
  currency VARCHAR(8) NOT NULL DEFAULT 'USD',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_balances_provider ON provider_balances(provider);
COMMENT ON TABLE provider_balances IS 'Provider 余额，Admin 手动录入，任务按 provider_pricing 计费后扣减';
