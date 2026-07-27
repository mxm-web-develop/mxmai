-- Knowledge embedding 生产 seed（幂等）
-- provider: jiekou, model_key: qwen3-embedding-8b, upstream: qwen/qwen3-embedding-8b @ 1536

INSERT INTO provider_models (
  provider, scope, model_key, upstream_model, protocol, modality,
  display_name, description, capabilities, default_parameters, is_enabled
) VALUES (
  'jiekou',
  'knowledge',
  'qwen3-embedding-8b',
  'qwen/qwen3-embedding-8b',
  'openai-embeddings',
  'embedding',
  'Qwen3 Embedding 8B (1536)',
  '平台默认知识库向量模型；32K 上下文，MRL 降维至 1536',
  '{"vector_dim":1536,"max_input_tokens":32768,"supports_dimensions":true}'::jsonb,
  '{"dimensions":1536}'::jsonb,
  true
)
ON CONFLICT (provider, scope, model_key)
DO UPDATE SET
  upstream_model = EXCLUDED.upstream_model,
  protocol = EXCLUDED.protocol,
  modality = EXCLUDED.modality,
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  capabilities = EXCLUDED.capabilities,
  default_parameters = EXCLUDED.default_parameters,
  is_enabled = EXCLUDED.is_enabled,
  updated_at = NOW();

INSERT INTO knowledge_scope_config (
  scope, task_key, sub_type, model, provider, enabled
) VALUES (
  'knowledge', 'default', 'embedding', 'qwen3-embedding-8b', 'jiekou', true
)
ON CONFLICT (scope, task_key, sub_type)
DO UPDATE SET
  model = EXCLUDED.model,
  provider = EXCLUDED.provider,
  enabled = EXCLUDED.enabled,
  updated_at = NOW();

NOTIFY pgrst, 'reload schema';
