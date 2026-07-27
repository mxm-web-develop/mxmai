/**
 * 初始化 Knowledge Embedding：provider_models + knowledge_scope_config
 *
 * 默认：jiekou / qwen3-embedding-8b → qwen/qwen3-embedding-8b @ 1536 维
 *
 * 用法（项目根目录）：
 *   pnpm exec tsx mxmcgi/src/scripts/seed-knowledge-embedding.ts
 */

import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { RepositoryFactory } from '@mxmai/mxmdata';
import { refreshProviderModelCatalog } from '../models/provider-model-catalog';

function loadEnvOnce() {
  process.env.DOTENV_CONFIG_DEBUG = 'false';
  const projectRoot = path.resolve(__dirname, '../../..');
  const envPaths = [
    path.resolve(projectRoot, '.env'),
    path.resolve(projectRoot, '.local.env'),
    path.resolve(projectRoot, 'mxmcgi/.env'),
  ];
  for (const p of envPaths) {
    if (fs.existsSync(p)) dotenv.config({ path: p, override: false });
  }
}

loadEnvOnce();

const PROVIDER = 'jiekou';
const MODEL_KEY = 'qwen3-embedding-8b';
const UPSTREAM = 'qwen/qwen3-embedding-8b';
const DIMENSIONS = 1536;

async function main() {
  const modelRepo = RepositoryFactory.createProviderModelRepository();
  const scopeRepo = RepositoryFactory.createKnowledgeScopeConfigRepository();

  const modelRow = await modelRepo.upsert({
    provider: PROVIDER,
    scope: 'knowledge',
    model_key: MODEL_KEY,
    upstream_model: UPSTREAM,
    protocol: 'openai-embeddings',
    modality: 'embedding',
    display_name: 'Qwen3 Embedding 8B (1536)',
    description: '平台默认知识库向量模型；32K 上下文，MRL 降维至 1536 以兼容 pgvector',
    capabilities: {
      vector_dim: DIMENSIONS,
      max_input_tokens: 32768,
      supports_dimensions: true,
    },
    default_parameters: {
      dimensions: DIMENSIONS,
    },
    is_enabled: true,
  });

  const routeRow = await scopeRepo.upsertConfig({
    scope: 'knowledge',
    task_key: 'default',
    sub_type: 'embedding',
    provider: PROVIDER,
    model: MODEL_KEY,
    enabled: true,
  });

  await refreshProviderModelCatalog();

  console.log('✅ Knowledge Embedding 已 seed：');
  console.log('   provider_models:', {
    id: modelRow.id,
    provider: modelRow.provider,
    scope: modelRow.scope,
    model_key: modelRow.model_key,
    upstream_model: modelRow.upstream_model,
  });
  console.log('   knowledge_scope_config:', {
    id: routeRow.id,
    provider: routeRow.provider,
    model: routeRow.model,
  });
  console.log('');
  console.log('请确认 Admin 已配置 JIEKOU_API_KEY，并对已有 KB / 虚拟文件夹执行 re-index。');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
