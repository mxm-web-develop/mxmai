/**
 * 接口AI GET /openai/v1/models — 连通性诊断
 * 文档：https://docs.jiekou.ai/docs/support/quickstart
 */

import { jiekouOpenAiV1Url } from './base-url';

export async function fetchJiekouAccessibleModelIds(
  apiKey: string,
  baseUrl?: string | null,
): Promise<string[]> {
  const res = await fetch(jiekouOpenAiV1Url('/models', baseUrl), {
    headers: { Authorization: `Bearer ${apiKey.trim()}` },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GET /openai/v1/models 失败: ${res.status} ${text.slice(0, 300)}`);
  }
  let body: { data?: Array<{ id?: string }> };
  try {
    body = JSON.parse(text) as { data?: Array<{ id?: string }> };
  } catch {
    throw new Error('GET /openai/v1/models 响应不是 JSON');
  }
  return (body.data ?? []).map((m) => String(m.id || '').trim()).filter(Boolean);
}
