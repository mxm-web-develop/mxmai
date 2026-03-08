-- ============================================
-- 业务模型路由覆盖表（Admin 修改后持久化，重启不丢失）
-- 执行: pnpm --filter @mxmai/mxmdata run migrate
-- ============================================

CREATE TABLE IF NOT EXISTS model_routing_overrides (
  logical_model VARCHAR(128) PRIMARY KEY,  -- 逻辑模型 key，如 writing-outlines, graph-photograph
  provider VARCHAR(32) NOT NULL,            -- 如 deer, replicate, ppio
  model VARCHAR(128) NOT NULL,              -- 物理模型名
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_model_routing_overrides_provider
  ON model_routing_overrides(provider);

COMMENT ON TABLE model_routing_overrides IS 'Admin 配置的业务模型路由覆盖，覆盖 model-routing 默认值；启动时加载到内存';
