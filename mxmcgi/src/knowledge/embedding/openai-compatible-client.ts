/**
 * OpenAI 兼容 Embeddings 客户端（jiekou / openrouter / openai / qhai 等）
 */

import type { ProviderType } from '../../core/providers/types';
import { getFirstProviderKey } from '../../core/providers/provider-keys';
import { jiekouOpenAiRoot } from '../../models/jiekou/base-url';
import type { EmbeddingRequest, EmbeddingResponse } from './types';

function normalizeOpenAiRoot(baseUrl: string): string {
  let u = baseUrl.trim().replace(/\/+$/, '');
  u = u.replace(/\/v1$/i, '');
  return u;
}

export async function resolveEmbeddingOpenAiBaseUrl(provider: ProviderType): Promise<string> {
  switch (provider) {
    case 'jiekou':
      return jiekouOpenAiRoot();
    case 'openrouter':
      return normalizeOpenAiRoot(process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api');
    case 'openai':
      return normalizeOpenAiRoot(process.env.OPENAI_BASE_URL || 'https://api.openai.com');
    case 'qhai':
      return normalizeOpenAiRoot(process.env.QHAI_BASE_URL || 'https://api.qhaigc.net');
    case 'deer':
      return normalizeOpenAiRoot(process.env.DEERAPI_BASE_URL || 'https://api.deerapi.com');
    default:
      throw new Error(
        `Provider "${provider}" 暂不支持 embedding（请在 Admin 配置 scope=knowledge 且 protocol=openai-embeddings 的模型，并使用 jiekou/openrouter/openai/qhai）`
      );
  }
}

export async function embedOpenAiCompatible(
  provider: ProviderType,
  request: EmbeddingRequest & { upstreamModel: string }
): Promise<EmbeddingResponse> {
  const apiKey = await getFirstProviderKey(provider);
  if (!apiKey) {
    throw new Error(
      `Provider "${provider}" 未配置 API Key（Admin Provider Keys 或环境变量），无法生成 embedding`
    );
  }

  const baseUrl = await resolveEmbeddingOpenAiBaseUrl(provider);
  const url = `${baseUrl}/v1/embeddings`;

  const body: Record<string, unknown> = {
    input: request.input,
    model: request.upstreamModel,
  };
  if (request.dimensions !== undefined) {
    body.dimensions = request.dimensions;
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = process.env.OPENROUTER_HTTP_REFERER || 'https://mxmai.local';
    headers['X-Title'] = process.env.OPENROUTER_APP_NAME || 'SuperMXMai';
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `${provider} Embeddings 请求失败: ${response.status} ${response.statusText} - ${errorText.slice(0, 500)}`
    );
  }

  const json = (await response.json()) as EmbeddingResponse;
  const first = json.data?.[0]?.embedding;
  if (first && request.dimensions && first.length !== request.dimensions) {
    console.warn(
      `[embedOpenAiCompatible] 期望维度 ${request.dimensions}，实际 ${first.length}（provider=${provider}, model=${request.upstreamModel}）`
    );
  }
  return json;
}
