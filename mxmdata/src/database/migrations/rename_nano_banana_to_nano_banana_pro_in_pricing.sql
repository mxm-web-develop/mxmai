-- 将 provider_pricing 中的 nano-banana 统一重命名为 nano-banana-pro
-- 与实际调用的 DeerAPI 接口名称一致，避免计价错误
-- 运行: pnpm --filter @mxmai/mxmdata run migrate:nano-banana-pro-rename

UPDATE provider_pricing
SET model_key = 'nano-banana-pro'
WHERE model_key = 'nano-banana';
