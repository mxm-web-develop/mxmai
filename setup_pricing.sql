-- DeerAPI 图片生成定价设置
-- 执行前请确保:
-- 1. 已运行迁移创建表: pnpm --filter @mxmai/mxmdata run migrate:provider-usage-pricing
-- 2. 已运行迁移创建余额表: pnpm --filter @mxmai/mxmdata run migrate:provider-balances
-- 3. 已连接到正确的数据库

-- 注意：以下价格为示例，请根据实际DeerAPI价格调整

BEGIN;

-- 1. 清理旧的deer定价数据（可选）
-- DELETE FROM provider_pricing WHERE provider = 'deer';
-- DELETE FROM provider_balances WHERE provider = 'deer';

-- 2. 插入 nano-banana 系列模型定价
-- nano-banana：快速图像生成，成本较低
INSERT INTO provider_pricing (provider, scope, model_key, charge_mode, unit_price, currency, platform_unit_price, platform_min_charge)
VALUES
  ('deer', 'graph', 'nano-banana', 'per_image', 0.01, 'USD', 10, 5)
ON CONFLICT (provider, scope, model_key) DO UPDATE SET
  charge_mode = EXCLUDED.charge_mode,
  unit_price = EXCLUDED.unit_price,
  currency = EXCLUDED.currency,
  platform_unit_price = EXCLUDED.platform_unit_price,
  platform_min_charge = EXCLUDED.platform_min_charge,
  updated_at = NOW();

-- nano-banana-pro：高质量图像生成，成本较高（Gemini 3 Pro Image）
INSERT INTO provider_pricing (provider, scope, model_key, charge_mode, unit_price, currency, platform_unit_price, platform_min_charge)
VALUES
  ('deer', 'graph', 'nano-banana-pro', 'per_image', 0.03, 'USD', 30, 10)
ON CONFLICT (provider, scope, model_key) DO UPDATE SET
  charge_mode = EXCLUDED.charge_mode,
  unit_price = EXCLUDED.unit_price,
  currency = EXCLUDED.currency,
  platform_unit_price = EXCLUDED.platform_unit_price,
  platform_min_charge = EXCLUDED.platform_min_charge,
  updated_at = NOW();

INSERT INTO provider_pricing (provider, scope, model_key, charge_mode, unit_price, currency, platform_unit_price, platform_min_charge)
VALUES
  ('deer', 'default', 'nano-banana-pro', 'per_image', 0.03, 'USD', 30, 10)
ON CONFLICT (provider, scope, model_key) DO UPDATE SET
  charge_mode = EXCLUDED.charge_mode,
  unit_price = EXCLUDED.unit_price,
  currency = EXCLUDED.currency,
  platform_unit_price = EXCLUDED.platform_unit_price,
  platform_min_charge = EXCLUDED.platform_min_charge,
  updated_at = NOW();

-- nano-banana-2：基于 Gemini 3.1 Flash Image（preview），画质与文字渲染提升
INSERT INTO provider_pricing (provider, scope, model_key, charge_mode, unit_price, currency, platform_unit_price, platform_min_charge)
VALUES
  ('deer', 'graph', 'nano-banana-2', 'per_image', 0.015, 'USD', 15, 5)
ON CONFLICT (provider, scope, model_key) DO UPDATE SET
  charge_mode = EXCLUDED.charge_mode,
  unit_price = EXCLUDED.unit_price,
  currency = EXCLUDED.currency,
  platform_unit_price = EXCLUDED.platform_unit_price,
  platform_min_charge = EXCLUDED.platform_min_charge,
  updated_at = NOW();

INSERT INTO provider_pricing (provider, scope, model_key, charge_mode, unit_price, currency, platform_unit_price, platform_min_charge)
VALUES
  ('deer', 'default', 'nano-banana-2', 'per_image', 0.015, 'USD', 15, 5)
ON CONFLICT (provider, scope, model_key) DO UPDATE SET
  charge_mode = EXCLUDED.charge_mode,
  unit_price = EXCLUDED.unit_price,
  currency = EXCLUDED.currency,
  platform_unit_price = EXCLUDED.platform_unit_price,
  platform_min_charge = EXCLUDED.platform_min_charge,
  updated_at = NOW();

-- nano-banana-2-pro：Gemini 3.1 Flash Image 正式版，最高画质与稳定性
INSERT INTO provider_pricing (provider, scope, model_key, charge_mode, unit_price, currency, platform_unit_price, platform_min_charge)
VALUES
  ('deer', 'graph', 'nano-banana-2-pro', 'per_image', 0.02, 'USD', 20, 8)
ON CONFLICT (provider, scope, model_key) DO UPDATE SET
  charge_mode = EXCLUDED.charge_mode,
  unit_price = EXCLUDED.unit_price,
  currency = EXCLUDED.currency,
  platform_unit_price = EXCLUDED.platform_unit_price,
  platform_min_charge = EXCLUDED.platform_min_charge,
  updated_at = NOW();

INSERT INTO provider_pricing (provider, scope, model_key, charge_mode, unit_price, currency, platform_unit_price, platform_min_charge)
VALUES
  ('deer', 'default', 'nano-banana-2-pro', 'per_image', 0.02, 'USD', 20, 8)
ON CONFLICT (provider, scope, model_key) DO UPDATE SET
  charge_mode = EXCLUDED.charge_mode,
  unit_price = EXCLUDED.unit_price,
  currency = EXCLUDED.currency,
  platform_unit_price = EXCLUDED.platform_unit_price,
  platform_min_charge = EXCLUDED.platform_min_charge,
  updated_at = NOW();

-- default scope作为fallback
INSERT INTO provider_pricing (provider, scope, model_key, charge_mode, unit_price, currency, platform_unit_price, platform_min_charge)
VALUES
  ('deer', 'default', 'nano-banana', 'per_image', 0.01, 'USD', 10, 5)
ON CONFLICT (provider, scope, model_key) DO UPDATE SET
  charge_mode = EXCLUDED.charge_mode,
  unit_price = EXCLUDED.unit_price,
  currency = EXCLUDED.currency,
  platform_unit_price = EXCLUDED.platform_unit_price,
  platform_min_charge = EXCLUDED.platform_min_charge,
  updated_at = NOW();

-- 3. 插入seedream-4模型定价
-- 高质量图像生成，成本中等
INSERT INTO provider_pricing (provider, scope, model_key, charge_mode, unit_price, currency, platform_unit_price, platform_min_charge)
VALUES
  ('deer', 'graph', 'seedream-4', 'per_image', 0.03, 'USD', 30, 10)
ON CONFLICT (provider, scope, model_key) DO UPDATE SET
  charge_mode = EXCLUDED.charge_mode,
  unit_price = EXCLUDED.unit_price,
  currency = EXCLUDED.currency,
  platform_unit_price = EXCLUDED.platform_unit_price,
  platform_min_charge = EXCLUDED.platform_min_charge,
  updated_at = NOW();

INSERT INTO provider_pricing (provider, scope, model_key, charge_mode, unit_price, currency, platform_unit_price, platform_min_charge)
VALUES
  ('deer', 'default', 'seedream-4', 'per_image', 0.03, 'USD', 30, 10)
ON CONFLICT (provider, scope, model_key) DO UPDATE SET
  charge_mode = EXCLUDED.charge_mode,
  unit_price = EXCLUDED.unit_price,
  currency = EXCLUDED.currency,
  platform_unit_price = EXCLUDED.platform_unit_price,
  platform_min_charge = EXCLUDED.platform_min_charge,
  updated_at = NOW();

-- 3.1 seedream-5（Doubao Seedream 5.0 Lite，$0.035/次）
INSERT INTO provider_pricing (provider, scope, model_key, charge_mode, unit_price, currency, platform_unit_price, platform_min_charge)
VALUES
  ('deer', 'graph', 'seedream-5', 'per_image', 0.035, 'USD', 35, 10)
ON CONFLICT (provider, scope, model_key) DO UPDATE SET
  charge_mode = EXCLUDED.charge_mode,
  unit_price = EXCLUDED.unit_price,
  currency = EXCLUDED.currency,
  platform_unit_price = EXCLUDED.platform_unit_price,
  platform_min_charge = EXCLUDED.platform_min_charge,
  updated_at = NOW();

INSERT INTO provider_pricing (provider, scope, model_key, charge_mode, unit_price, currency, platform_unit_price, platform_min_charge)
VALUES
  ('deer', 'default', 'seedream-5', 'per_image', 0.035, 'USD', 35, 10)
ON CONFLICT (provider, scope, model_key) DO UPDATE SET
  charge_mode = EXCLUDED.charge_mode,
  unit_price = EXCLUDED.unit_price,
  currency = EXCLUDED.currency,
  platform_unit_price = EXCLUDED.platform_unit_price,
  platform_min_charge = EXCLUDED.platform_min_charge,
  updated_at = NOW();

-- 4. 插入写作基础文本模型定价（token_based）
-- 说明：
-- - 逻辑模型：writing-basic-text / writing-graph-prompt
-- - 物理模型：gemini-3-pro（通过 model-routing 路由）
-- - 价格示例：$2/M input, $12/M output → 每千 input 0.002, 每千 output 0.012
INSERT INTO provider_pricing (provider, scope, model_key, charge_mode, unit_price, input_unit_price, output_unit_price, currency, platform_input_unit_price, platform_output_unit_price, platform_min_charge)
VALUES
  ('deer', 'writing', 'gemini-3-pro', 'token_based', 0, 0.002, 0.012, 'USD', 2, 12, 1)
ON CONFLICT (provider, scope, model_key) DO UPDATE SET
  charge_mode = EXCLUDED.charge_mode,
  unit_price = EXCLUDED.unit_price,
  input_unit_price = EXCLUDED.input_unit_price,
  output_unit_price = EXCLUDED.output_unit_price,
  currency = EXCLUDED.currency,
  platform_input_unit_price = EXCLUDED.platform_input_unit_price,
  platform_output_unit_price = EXCLUDED.platform_output_unit_price,
  platform_min_charge = EXCLUDED.platform_min_charge,
  updated_at = NOW();

-- 5. 插入flux-2-pro模型定价
-- 专业级图像生成，成本较高
INSERT INTO provider_pricing (provider, scope, model_key, charge_mode, unit_price, currency, platform_unit_price, platform_min_charge)
VALUES
  ('deer', 'graph', 'flux-2-pro', 'per_image', 0.05, 'USD', 50, 20)
ON CONFLICT (provider, scope, model_key) DO UPDATE SET
  charge_mode = EXCLUDED.charge_mode,
  unit_price = EXCLUDED.unit_price,
  currency = EXCLUDED.currency,
  platform_unit_price = EXCLUDED.platform_unit_price,
  platform_min_charge = EXCLUDED.platform_min_charge,
  updated_at = NOW();

INSERT INTO provider_pricing (provider, scope, model_key, charge_mode, unit_price, currency, platform_unit_price, platform_min_charge)
VALUES
  ('deer', 'default', 'flux-2-pro', 'per_image', 0.05, 'USD', 50, 20)
ON CONFLICT (provider, scope, model_key) DO UPDATE SET
  charge_mode = EXCLUDED.charge_mode,
  unit_price = EXCLUDED.unit_price,
  currency = EXCLUDED.currency,
  platform_unit_price = EXCLUDED.platform_unit_price,
  platform_min_charge = EXCLUDED.platform_min_charge,
  updated_at = NOW();

-- 6. 添加/更新deer provider余额
INSERT INTO provider_balances (provider, balance, currency)
VALUES ('deer', 100.00, 'USD')
ON CONFLICT (provider) DO UPDATE SET
  balance = EXCLUDED.balance,
  updated_at = NOW();

-- 7. 验证数据
SELECT '=== 定价配置验证 ===' as info;

SELECT provider, scope, model_key, charge_mode,
       unit_price, currency,
       platform_unit_price, platform_min_charge
FROM provider_pricing
WHERE provider = 'deer'
ORDER BY scope, model_key;

SELECT '=== 余额验证 ===' as info;

SELECT provider, balance, currency, updated_at
FROM provider_balances
WHERE provider = 'deer';

COMMIT;

-- 使用说明:
-- 1. 使用psql执行: psql -h localhost -p 5432 -U postgres -d postgres -f setup_pricing.sql
-- 2. 或者使用pgAdmin等工具执行
-- 3. 执行后重启mxmcgi服务: pnpm dev:mxmcgi 或 pnpm dev:all