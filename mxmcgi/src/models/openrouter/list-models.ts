/**
 * OpenRouter GET /api/v1/models — 连通性失败时列举可替代图生模型
 * @see https://openrouter.ai/docs/api-reference/models/list-models
 */

const DEFAULT_BASE = 'https://openrouter.ai/api/v1';

export async function fetchOpenRouterImageModelIds(apiKey: string): Promise<string[]> {
  const key = apiKey.trim();
  const url = `${DEFAULT_BASE}/models?output_modalities=image`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GET /models 失败: ${res.status} ${text.slice(0, 300)}`);
  }
  const body = JSON.parse(text) as { data?: Array<{ id?: string }> };
  return (body.data ?? []).map((m) => String(m.id || '').trim()).filter(Boolean);
}
