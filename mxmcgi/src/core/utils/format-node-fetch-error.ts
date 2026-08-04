/**
 * 展开 Node/undici 的 `TypeError: fetch failed`（常见底层在 `error.cause`），便于任务进度与日志排查。
 * 对外抛错请用 throwMappedFetchError，避免 proxy/URL 泄漏到非 admin UI。
 */
export function formatNodeFetchError(url: string, err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const bits: string[] = [msg];

  const rawCause =
    err && typeof err === 'object' && 'cause' in err
      ? (err as { cause?: unknown }).cause
      : undefined;

  if (rawCause instanceof Error) {
    bits.push(`cause=${rawCause.message}`);
    const c = rawCause as unknown as Record<string, unknown>;
    if (typeof c.code === 'string') bits.push(`code=${c.code}`);
  } else if (rawCause && typeof rawCause === 'object') {
    const c = rawCause as Record<string, unknown>;
    if (c.code != null) bits.push(`code=${String(c.code)}`);
    if (typeof c.message === 'string' && c.message.trim()) bits.push(`cause=${c.message.trim()}`);
  }

  const proxy =
    process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY || '';
  bits.push(proxy ? `proxy=${String(proxy).slice(0, 120)}` : 'proxy=direct');

  return `${bits.join(' | ')} @ ${url}`;
}

/** 日志保留全文，抛出 PlatformError（用户文案已脱敏） */
export function throwMappedFetchError(url: string, err: unknown): never {
  const debug = formatNodeFetchError(url, err);
  console.error('[fetch]', debug);
  // 延迟 require 避免循环依赖
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { mapUpstreamError } = require('../../errors') as typeof import('../../errors');
  throw mapUpstreamError(new Error(debug));
}
