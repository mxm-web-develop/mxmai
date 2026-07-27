/**
 * 接口AI v3 多模态 API（图/音/视频）
 * 文档：https://docs.jiekou.ai/docs/support/faq_api
 */

import { jiekouAsyncTaskResultUrl, jiekouV3Url } from './base-url';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function isJiekouAsyncEndpoint(endpoint: string): boolean {
  return endpoint.replace(/^\/+/, '').startsWith('async/');
}

/** 从 v3 同步/异步响应中提取 URL 或 data URI */
export function extractJiekouOutputUrls(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return [];
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v !== 'string') return;
    const t = v.trim();
    if (!t) return;
    if (t.startsWith('http://') || t.startsWith('https://') || t.startsWith('data:')) {
      out.push(t);
    }
  };

  const root = payload as Record<string, unknown>;

  for (const k of ['urls', 'output_urls', 'outputUrls', 'images', 'image_urls'] as const) {
    const arr = root[k];
    if (Array.isArray(arr)) {
      for (const item of arr) push(item);
    }
  }

  const data = root.data;
  if (Array.isArray(data)) {
    for (const item of data) {
      if (typeof item === 'string') push(item);
      else if (item && typeof item === 'object') {
        const o = item as Record<string, unknown>;
        push(o.url ?? o.image_url ?? o.output_url ?? o.href);
        if (typeof o.b64_json === 'string') {
          out.push(`data:image/png;base64,${o.b64_json}`);
        }
      }
    }
  }

  const output = root.output;
  if (Array.isArray(output)) {
    for (const item of output) {
      if (typeof item === 'string') push(item);
      else if (item && typeof item === 'object') {
        const o = item as Record<string, unknown>;
        push(o.url ?? o.video_url ?? o.audio_url ?? o.image_url);
      }
    }
  }

  for (const k of ['url', 'video_url', 'audio_url', 'image_url', 'result_url'] as const) {
    push(root[k]);
  }

  return [...new Set(out)];
}

function readTaskId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const r = payload as Record<string, unknown>;
  const id = r.task_id ?? r.taskId ?? r.id;
  return typeof id === 'string' && id.trim() ? id.trim() : null;
}

export async function postJiekouV3(args: {
  apiKey: string;
  endpoint: string;
  body: Record<string, unknown>;
  baseUrl?: string | null;
}): Promise<unknown> {
  const url = jiekouV3Url(args.endpoint, args.baseUrl);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${args.apiKey.trim()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args.body),
  });
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`接口AI v3 响应非 JSON (${res.status}): ${text.slice(0, 400)}`);
  }
  if (!res.ok) {
    const msg =
      body && typeof body === 'object' && 'message' in body
        ? String((body as { message: unknown }).message)
        : text.slice(0, 400);
    throw new Error(`接口AI v3 请求失败 ${res.status}: ${msg}`);
  }
  return body;
}

export async function pollJiekouAsyncTask(args: {
  apiKey: string;
  taskId: string;
  baseUrl?: string | null;
  maxWaitMs?: number;
  pollIntervalMs?: number;
}): Promise<{ urls: string[]; raw: unknown }> {
  const maxWait = args.maxWaitMs ?? 180_000;
  const interval = args.pollIntervalMs ?? 3_000;
  const deadline = Date.now() + maxWait;
  let lastRaw: unknown = null;

  while (Date.now() < deadline) {
    const url = jiekouAsyncTaskResultUrl(args.taskId, args.baseUrl);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${args.apiKey.trim()}` },
    });
    const text = await res.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      throw new Error(`接口AI 任务查询响应非 JSON (${res.status})`);
    }
    lastRaw = body;

    if (!res.ok) {
      const msg =
        body && typeof body === 'object' && 'message' in body
          ? String((body as { message: unknown }).message)
          : text.slice(0, 300);
      throw new Error(`接口AI 任务查询失败 ${res.status}: ${msg}`);
    }

    const urls = extractJiekouOutputUrls(body);
    if (urls.length > 0) {
      return { urls, raw: body };
    }

    const status =
      body && typeof body === 'object'
        ? String(
            (body as Record<string, unknown>).status ??
              (body as Record<string, unknown>).task_status ??
              '',
          ).toLowerCase()
        : '';
    if (status === 'failed' || status === 'error' || status === 'cancelled') {
      throw new Error(
        `接口AI 异步任务失败: ${JSON.stringify(body).slice(0, 500)}`,
      );
    }

    await sleep(interval);
  }

  throw new Error(
    `接口AI 异步任务超时 (${Math.round(maxWait / 1000)}s)，最后响应: ${JSON.stringify(lastRaw).slice(0, 400)}`,
  );
}

export async function callJiekouV3WithOptionalPoll(args: {
  apiKey: string;
  endpoint: string;
  body: Record<string, unknown>;
  baseUrl?: string | null;
  maxWaitMs?: number;
  pollIntervalMs?: number;
}): Promise<{ urls: string[]; raw: unknown }> {
  const raw = await postJiekouV3({
    apiKey: args.apiKey,
    endpoint: args.endpoint,
    body: args.body,
    baseUrl: args.baseUrl,
  });

  const directUrls = extractJiekouOutputUrls(raw);
  if (directUrls.length > 0) {
    return { urls: directUrls, raw };
  }

  const taskId = readTaskId(raw);
  if (taskId) {
    return pollJiekouAsyncTask({
      apiKey: args.apiKey,
      taskId,
      baseUrl: args.baseUrl,
      maxWaitMs: args.maxWaitMs,
      pollIntervalMs: args.pollIntervalMs,
    });
  }

  throw new Error(
    `接口AI v3 未返回 URL 或 task_id: ${JSON.stringify(raw).slice(0, 500)}`,
  );
}
