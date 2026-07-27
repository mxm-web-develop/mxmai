/**
 * Knowledge Embedding 路由：从 knowledge_scope_config + provider_models 解析向量模型
 */

import { RepositoryFactory, type ProviderModel } from '@mxmai/mxmdata';
import type { ProviderType } from '../../core/providers/types';
import {
  findEnabledModel,
  findEnabledModelWithReload,
  getUpstreamModel,
} from '../../models/provider-model-catalog';
import { requireUpstreamPhysicalId } from '../../models/physical-model-id';

export const DEFAULT_KNOWLEDGE_EMBEDDING_MODEL_KEY = 'qwen3-embedding-8b';

export interface ResolvedKnowledgeEmbedding {
  /** provider_models.model_key */
  modelKey: string;
  provider: ProviderType;
  /** 上游 API model 参数 */
  upstreamModel: string;
  /** 写入 pgvector 的维度（当前 schema 固定 1536） */
  dimensions: number;
  protocol: string;
  fromDb: boolean;
}

export function dimensionsFromProviderModel(row: ProviderModel): number {
  const dp = (row.default_parameters ?? {}) as Record<string, unknown>;
  const cap = (row.capabilities ?? {}) as Record<string, unknown>;
  const raw = dp.dimensions ?? cap.vector_dim ?? cap.dimensions;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return 1536;
}

function protocolFromProviderModel(row: ProviderModel): string {
  const p = row.protocol?.trim();
  return p || 'openai-embeddings';
}

/**
 * 在 catalog 中按 model_key 或 legacy upstream 名解析
 */
export async function findKnowledgeEmbeddingCatalogRow(
  modelKeyOrLegacy?: string | null
): Promise<ProviderModel | null> {
  const key = String(modelKeyOrLegacy ?? '').trim();
  if (!key) return null;

  let row = await findEnabledModelWithReload({ modelKey: key, scope: 'knowledge' });
  if (row) return row;

  // legacy：KB 里可能存 upstream 名（如 text-embedding-3-small / qwen/qwen3-embedding-8b）
  const allScope = findEnabledModel({ modelKey: key });
  if (allScope && String(allScope.scope).toLowerCase() === 'knowledge') {
    return allScope;
  }

  for (const m of (await import('../../models/provider-model-catalog')).listAllEnabled()) {
    if (String(m.scope).toLowerCase() !== 'knowledge') continue;
    if (m.upstream_model === key || m.model_key === key) return m;
  }
  return null;
}

/**
 * 解析平台默认 embedding（knowledge_scope_config）
 */
export async function resolveDefaultKnowledgeEmbedding(): Promise<ResolvedKnowledgeEmbedding> {
  try {
    const repo = RepositoryFactory.createKnowledgeScopeConfigRepository();
    const cfg = await repo.findConfig('knowledge', 'default', 'embedding');
    if (cfg?.enabled && cfg.model && cfg.provider) {
      const row = await findKnowledgeEmbeddingCatalogRow(cfg.model);
      if (row) {
        return buildResolved(row, cfg.provider as ProviderType, true);
      }
      return {
        modelKey: cfg.model,
        provider: cfg.provider as ProviderType,
        upstreamModel: requireUpstreamPhysicalId(cfg.provider as ProviderType, cfg.model),
        dimensions: 1536,
        protocol: 'openai-embeddings',
        fromDb: true,
      };
    }
  } catch (e) {
    console.warn('[KnowledgeEmbeddingRouting] 读取 knowledge_scope_config 失败:', e);
  }

  return resolveKnowledgeEmbedding(DEFAULT_KNOWLEDGE_EMBEDDING_MODEL_KEY);
}

/**
 * 解析 KB 使用的 embedding；modelKeyOrLegacy 为空则用平台默认
 */
export async function resolveKnowledgeEmbedding(
  modelKeyOrLegacy?: string | null
): Promise<ResolvedKnowledgeEmbedding> {
  const key = String(modelKeyOrLegacy ?? '').trim();
  if (key) {
    const row = await findKnowledgeEmbeddingCatalogRow(key);
    if (row) {
      return buildResolved(row, row.provider as ProviderType, true);
    }
    // legacy 裸 upstream 名，无 catalog 行时仍尝试 env 默认 provider
    const envProvider = (process.env.EMBEDDING_PROVIDER || 'jiekou').toLowerCase() as ProviderType;
    const upstream =
      getUpstreamModel(envProvider, key) ??
      (key.includes('/') || key.startsWith('text-embedding') ? key : null);
    if (upstream) {
      return {
        modelKey: key,
        provider: envProvider,
        upstreamModel: upstream,
        dimensions: Number(process.env.EMBEDDING_DIMENSIONS || 1536),
        protocol: 'openai-embeddings',
        fromDb: false,
      };
    }
  }

  // 平台默认
  try {
    const repo = RepositoryFactory.createKnowledgeScopeConfigRepository();
    const cfg = await repo.findConfig('knowledge', 'default', 'embedding');
    if (cfg?.enabled && cfg.model && cfg.provider) {
      const row = await findKnowledgeEmbeddingCatalogRow(cfg.model);
      if (row) {
        return buildResolved(row, cfg.provider as ProviderType, true);
      }
    }
  } catch {
    /* fallback below */
  }

  // 硬编码 fallback（与 seed 一致）
  const fallbackKey = process.env.EMBEDDING_MODEL?.trim() || DEFAULT_KNOWLEDGE_EMBEDDING_MODEL_KEY;
  const row = await findKnowledgeEmbeddingCatalogRow(fallbackKey);
  if (row) {
    return buildResolved(row, row.provider as ProviderType, false);
  }

  const provider = (process.env.EMBEDDING_PROVIDER || 'jiekou').toLowerCase() as ProviderType;
  return {
    modelKey: fallbackKey,
    provider,
    upstreamModel: 'qwen/qwen3-embedding-8b',
    dimensions: Number(process.env.EMBEDDING_DIMENSIONS || 1536),
    protocol: 'openai-embeddings',
    fromDb: false,
  };
}

function buildResolved(
  row: ProviderModel,
  provider: ProviderType,
  fromDb: boolean
): ResolvedKnowledgeEmbedding {
  const modelKey = row.model_key;
  const upstreamModel = row.upstream_model?.trim() || row.model_key;
  return {
    modelKey,
    provider: (row.provider as ProviderType) || provider,
    upstreamModel,
    dimensions: dimensionsFromProviderModel(row),
    protocol: protocolFromProviderModel(row),
    fromDb,
  };
}

/** 新建 KB 时写入的默认 model_key */
export async function defaultKnowledgeEmbeddingModelKey(): Promise<string> {
  const r = await resolveDefaultKnowledgeEmbedding();
  return r.modelKey;
}
