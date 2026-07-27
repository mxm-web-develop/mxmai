/**
 * Pexels API 全局节流 + 429 冷却。
 * 免费额度约 200 req/h；批量自动剪辑易打爆，故串行排队 + 失败冷却后降级跳过。
 */

type QueueJob<T> = {
  run: () => Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
};

const MIN_INTERVAL_MS = Math.max(
  200,
  Number(process.env.PEXELS_MIN_INTERVAL_MS ?? 400) || 400
);
const COOLDOWN_MS = Math.max(
  5_000,
  Number(process.env.PEXELS_COOLDOWN_MS ?? 60_000) || 60_000
);
const MAX_RETRIES = Math.max(0, Number(process.env.PEXELS_MAX_RETRIES ?? 3) || 3);

let chain: Promise<void> = Promise.resolve();
let lastStartedAt = 0;
let cooldownUntil = 0;

const memoryCache = new Map<string, { expiresAt: number; payload: unknown }>();
const CACHE_TTL_MS = 15 * 60_000;

export function isPexelsInCooldown(): boolean {
  return Date.now() < cooldownUntil;
}

export function markPexelsCooldown(ms = COOLDOWN_MS): void {
  cooldownUntil = Math.max(cooldownUntil, Date.now() + ms);
  console.warn(`[pexels] 进入冷却 ${Math.round(ms / 1000)}s（限流/429）`);
}

export function clearPexelsCooldown(): void {
  cooldownUntil = 0;
}

export function getCachedPexelsResult<T>(key: string): T | undefined {
  const hit = memoryCache.get(key);
  if (!hit) return undefined;
  if (Date.now() > hit.expiresAt) {
    memoryCache.delete(key);
    return undefined;
  }
  return hit.payload as T;
}

export function setCachedPexelsResult(key: string, payload: unknown): void {
  memoryCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, payload });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function parseRetryAfterMs(res: Response): number | null {
  const raw = res.headers.get('retry-after');
  if (!raw) return null;
  const sec = Number(raw);
  if (Number.isFinite(sec) && sec >= 0) return Math.min(120_000, sec * 1000);
  const when = Date.parse(raw);
  if (Number.isFinite(when)) return Math.min(120_000, Math.max(0, when - Date.now()));
  return null;
}

export function isPexelsRateLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /\b429\b|Too Many Requests|Throttle limit/i.test(msg);
}

/**
 * 串行执行 Pexels 请求，保证最小间隔；429 时按 Retry-After / 指数退避重试，仍失败则冷却。
 */
export async function withPexelsThrottle<T>(fn: () => Promise<T>): Promise<T> {
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const prev = chain;
  chain = prev.then(() => gate);

  await prev;
  try {
    const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastStartedAt));
    if (wait > 0) await sleep(wait);
    lastStartedAt = Date.now();

    // 已在冷却：上层应直接跳过，避免排队空转
    if (isPexelsInCooldown()) {
      throw new Error('Pexels 搜索失败 (429): cooldown active');
    }

    let lastErr: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const out = await fn();
        return out;
      } catch (e) {
        lastErr = e;
        if (!isPexelsRateLimitError(e) || attempt >= MAX_RETRIES) break;
        const hinted = Number((e as { retryAfterMs?: number }).retryAfterMs ?? 0);
        const backoff = Math.min(45_000, Math.max(hinted, 1_500 * 2 ** attempt));
        console.warn(
          `[pexels] 429/限流，${backoff}ms 后重试 (${attempt + 1}/${MAX_RETRIES})`
        );
        // 重试窗口内暂时放开冷却标记，否则下一轮直接被跳过
        clearPexelsCooldown();
        await sleep(backoff);
      }
    }
    if (isPexelsRateLimitError(lastErr)) markPexelsCooldown();
    throw lastErr;
  } finally {
    release();
  }
}

/** fetch 包装：识别 429，写入带 Retry-After 的 Error，供 withPexelsThrottle 重试 */
export async function pexelsFetch(
  url: string,
  init: RequestInit
): Promise<Response> {
  const res = await fetch(url, init);
  if (res.status === 429) {
    const retryMs = parseRetryAfterMs(res) ?? 5_000;
    const text = await res.text().catch(() => '');
    const err = new Error(
      `Pexels 搜索失败 (429)${text ? `: ${text.slice(0, 200)}` : ''}`
    );
    (err as Error & { retryAfterMs?: number }).retryAfterMs = retryMs;
    markPexelsCooldown(retryMs);
    throw err;
  }
  return res;
}
