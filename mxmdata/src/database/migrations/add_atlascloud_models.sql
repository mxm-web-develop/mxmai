-- ============================================
-- AtlasCloud 模型目录：nano-banana-2, gpt-image-2
--
-- 重要：这些模型支持 text-to-image 和 edit 两种模式，由调用时是否传入
-- 参考图自动决定走哪个具体 endpoint，无需分开注册两个 model_key。
--
-- 执行: psql $DATABASE_URL -f add_atlascloud_models.sql
-- ============================================

BEGIN;

-- ============================================
-- 1. nano-banana-2（Google Gemini 3.1 Flash Image）
-- upstream_model 固定为 /text-to-image 后缀；代码层在检测到图片输入时
-- 自动替换为 /edit 后缀。
-- ============================================

INSERT INTO provider_models (
  provider, scope, model_key, upstream_model,
  protocol, modality, io_schema,
  display_name, description,
  capabilities, default_parameters,
  is_enabled
) VALUES (
  'atlascloud', 'graph', 'nano-banana-2', 'google/nano-banana-2/text-to-image',
  'text-to-image', 'image', 'images.generate',
  'Nano Banana 2 (Google)',
  'Google Gemini 3.1 Flash Image - 高速图像生成，支持文字渲染与编辑',
  '{"text_to_image": true, "edit": true, "aspect_ratios": ["1:1", "3:2", "2:3", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"], "resolutions": ["1k", "2k", "4k"]}'::jsonb,
  '{"aspect_ratio": "3:4", "resolution": "1k", "output_format": "png"}'::jsonb,
  true
) ON CONFLICT (provider, scope, model_key) DO UPDATE SET
  upstream_model = EXCLUDED.upstream_model,
  protocol = EXCLUDED.protocol,
  modality = EXCLUDED.modality,
  io_schema = EXCLUDED.io_schema,
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  capabilities = EXCLUDED.capabilities,
  default_parameters = EXCLUDED.default_parameters,
  updated_at = NOW();

-- ============================================
-- 2. gpt-image-2（OpenAI GPT Image 2）
-- 同样支持 text-to-image 和 edit，代码层自动切换。
-- ============================================

INSERT INTO provider_models (
  provider, scope, model_key, upstream_model,
  protocol, modality, io_schema,
  display_name, description,
  capabilities, default_parameters,
  is_enabled
) VALUES (
  'atlascloud', 'graph', 'gpt-image-2', 'openai/gpt-image-2/text-to-image',
  'text-to-image', 'image', 'images.generate',
  'GPT Image 2 (OpenAI)',
  'OpenAI GPT Image 2 - 高质量图像生成，支持编辑',
  '{"text_to_image": true, "edit": true, "sizes": ["1024x1024", "1024x1792", "1792x1024"]}'::jsonb,
  '{}'::jsonb,
  true
) ON CONFLICT (provider, scope, model_key) DO UPDATE SET
  upstream_model = EXCLUDED.upstream_model,
  protocol = EXCLUDED.protocol,
  modality = EXCLUDED.modality,
  io_schema = EXCLUDED.io_schema,
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  capabilities = EXCLUDED.capabilities,
  default_parameters = EXCLUDED.default_parameters,
  updated_at = NOW();

-- ============================================
-- 3. 验证插入结果
-- ============================================

SELECT '=== AtlasCloud 模型验证 ===' as info;

SELECT provider, scope, model_key, upstream_model, protocol, modality, is_enabled
FROM provider_models
WHERE provider = 'atlascloud'
ORDER BY model_key;

COMMIT;