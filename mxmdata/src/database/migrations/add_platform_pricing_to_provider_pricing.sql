-- Migration: 在 provider_pricing 表中增加平台向用户收取的 MXM-TOKEN 计费字段
-- 与提供商成本字段（unit_price / input_unit_price / output_unit_price）共用同一 charge_mode
-- Admin 可在一张表中同时管理：提供商成本（USD）和平台收费（MXM-TOKEN）

ALTER TABLE provider_pricing
  ADD COLUMN IF NOT EXISTS platform_unit_price        NUMERIC(20, 8),
  ADD COLUMN IF NOT EXISTS platform_input_unit_price  NUMERIC(20, 8),
  ADD COLUMN IF NOT EXISTS platform_output_unit_price NUMERIC(20, 8),
  ADD COLUMN IF NOT EXISTS platform_min_charge        NUMERIC(20, 8) DEFAULT 0;

COMMENT ON COLUMN provider_pricing.platform_unit_price        IS '平台向用户收取的 MXM-TOKEN 单价（计价方式与 charge_mode 一致：per_image/per_request/per_second_* 时使用）';
COMMENT ON COLUMN provider_pricing.platform_input_unit_price  IS 'token_based 模式：每千输入 token 收取的 MXM-TOKEN 数量';
COMMENT ON COLUMN provider_pricing.platform_output_unit_price IS 'token_based 模式：每千输出 token 收取的 MXM-TOKEN 数量';
COMMENT ON COLUMN provider_pricing.platform_min_charge        IS '本次调用最低收取的 MXM-TOKEN 数量（0 或 NULL 表示不设下限）';
