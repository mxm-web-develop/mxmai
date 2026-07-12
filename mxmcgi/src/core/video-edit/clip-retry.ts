/**
 * clip 渲染 / 上传重试工具
 */

export function parseClipRenderAttempts(env = process.env): number {
  const raw = env.VIDEO_EDIT_CLIP_RENDER_ATTEMPTS;
  const n = raw ? Number(raw) : 3;
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 5) : 3;
}

export function parseClipUploadAttempts(env = process.env): number {
  const raw = env.VIDEO_EDIT_CLIP_UPLOAD_ATTEMPTS;
  const n = raw ? Number(raw) : 3;
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 5) : 3;
}

/** 指数退避：0.6s → 1.2s → 2.4s … 上限 5s */
export function clipRetryDelayMs(attemptIndex: number): number {
  const base = 600;
  return Math.min(5_000, base * 2 ** Math.max(0, attemptIndex));
}

export async function sleepMs(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 对可能瞬时失败的异步操作重试。
 * attempt 从 0 开始；最后一次失败抛出或返回 onFinal。
 */
export async function withRetries<T>(
  attempts: number,
  run: (attempt: number) => Promise<T>,
  opts?: {
    shouldRetry?: (error: unknown, attempt: number) => boolean;
    onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
    label?: string;
  }
): Promise<T> {
  const max = Math.max(1, attempts);
  let lastError: unknown;
  for (let attempt = 0; attempt < max; attempt++) {
    try {
      return await run(attempt);
    } catch (error) {
      lastError = error;
      const canRetry =
        attempt < max - 1 && (opts?.shouldRetry ? opts.shouldRetry(error, attempt) : true);
      if (!canRetry) break;
      const delay = clipRetryDelayMs(attempt);
      opts?.onRetry?.(error, attempt, delay);
      await sleepMs(delay);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(String(lastError ?? `${opts?.label ?? 'operation'} failed`));
}
