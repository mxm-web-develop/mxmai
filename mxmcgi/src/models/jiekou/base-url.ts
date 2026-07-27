/**
 * 接口AI（jiekou.ai）API 根地址。
 * - 文本 / Chat：{host}/openai → DeerAPIClient 再拼 /v1/chat/completions
 * - 图/音视频：{host}/v3/{endpoint}
 *
 * 国内直连默认 https://api.highwayapi.ai（见 https://docs.jiekou.ai/docs/support/faq_api）
 */

/** 规范化 host，去掉尾部 /openai、/v3、/v1 */
export function normalizeJiekouApiHost(baseUrl?: string | null): string {
  const raw = (baseUrl || process.env.JIEKOU_BASE_URL || 'https://api.highwayapi.ai').trim();
  let u = raw.replace(/\/+$/, '');
  u = u.replace(/\/openai(\/v1)?$/i, '');
  u = u.replace(/\/v3$/i, '');
  return u;
}

/** OpenAI 兼容根（不含 /v1）— 供 DeerAPIClient 使用 */
export function jiekouOpenAiRoot(baseUrl?: string | null): string {
  return `${normalizeJiekouApiHost(baseUrl)}/openai`;
}

export function jiekouOpenAiV1Url(path: string, baseUrl?: string | null): string {
  const root = jiekouOpenAiRoot(baseUrl);
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${root}/v1${p}`;
}

/** v3 端点：upstream 可为 gpt-image-2-light-text-to-image 或 async/kling-v3.0-pro-t2v */
export function jiekouV3Url(endpoint: string, baseUrl?: string | null): string {
  const host = normalizeJiekouApiHost(baseUrl);
  const ep = endpoint.replace(/^\/+/, '');
  if (ep.startsWith('v3/')) return `${host}/${ep}`;
  return `${host}/v3/${ep}`;
}

export function jiekouAsyncTaskResultUrl(
  taskId: string,
  baseUrl?: string | null,
): string {
  const host = normalizeJiekouApiHost(baseUrl);
  return `${host}/v3/async/task-result?task_id=${encodeURIComponent(taskId)}`;
}
