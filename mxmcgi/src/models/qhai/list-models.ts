/**
 * 启航 GET /v1/models — 用于连通性失败时诊断（见 https://www.qhaigc.net/docs/api-reference/other/models）
 */

import { qhaiV1Url } from './base-url';

export async function fetchQhaiAccessibleModelIds(
  apiKey: string,
  baseUrl?: string,
): Promise<string[]> {
  const res = await fetch(qhaiV1Url('/models', baseUrl), {
    headers: { Authorization: `Bearer ${apiKey.trim()}` },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GET /v1/models 失败: ${res.status} ${text.slice(0, 300)}`);
  }
  let body: { data?: Array<{ id?: string }> };
  try {
    body = JSON.parse(text) as { data?: Array<{ id?: string }> };
  } catch {
    throw new Error('GET /v1/models 响应不是 JSON');
  }
  return (body.data ?? []).map((m) => String(m.id || '').trim()).filter(Boolean);
}
