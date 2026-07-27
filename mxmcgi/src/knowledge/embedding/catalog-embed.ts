/**
 * 通过 provider_models + knowledge_scope_config 调用 embedding
 */

import type { EmbeddingRequest, EmbeddingResponse } from './types';
import { resolveKnowledgeEmbedding } from '../../core/knowledge/knowledge-embedding-routing';
import { embedOpenAiCompatible } from './openai-compatible-client';
import { DeerEmbeddingProvider } from './providers/deer.provider';

export async function embedViaKnowledgeCatalog(
  request: EmbeddingRequest,
  modelKeyOrLegacy?: string | null
): Promise<EmbeddingResponse> {
  const resolved = await resolveKnowledgeEmbedding(modelKeyOrLegacy || request.model);

  // 显式走 Deer 兼容（历史环境变量 EMBEDDING_PROVIDER=deer）
  if (
    resolved.provider === 'deer' &&
    (process.env.EMBEDDING_PROVIDER || '').toLowerCase() === 'deer'
  ) {
    const deer = DeerEmbeddingProvider.fromEnv();
    return deer.embed({
      input: request.input,
      model: resolved.upstreamModel,
      dimensions: resolved.dimensions,
    });
  }

  if (resolved.protocol !== 'openai-embeddings') {
    throw new Error(
      `Knowledge embedding protocol "${resolved.protocol}" 尚未实现（model_key=${resolved.modelKey}）`
    );
  }

  return embedOpenAiCompatible(resolved.provider, {
    input: request.input,
    upstreamModel: resolved.upstreamModel,
    dimensions: resolved.dimensions,
  });
}
