/**
 * GSAP Playwright 渲染全局并发槽（进程内 FIFO 排队）
 * 避免多段 GSAP 同时启动 Chromium 导致 OOM / 整站无响应。
 */
let active = 0;
const waitQueue: Array<() => void> = [];

export function parseGsapRenderMaxConcurrent(): number {
  const raw = process.env.GSAP_RENDER_MAX_CONCURRENT;
  const n = raw ? Number(raw) : 1;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

export function gsapRenderActiveCount(): number {
  return active;
}

export function gsapRenderQueueLength(): number {
  return waitQueue.length;
}

export async function acquireGsapRenderSlot(): Promise<void> {
  const max = parseGsapRenderMaxConcurrent();
  if (active < max) {
    active += 1;
    return;
  }
  await new Promise<void>((resolve) => {
    waitQueue.push(() => {
      active += 1;
      resolve();
    });
  });
}

export function releaseGsapRenderSlot(): void {
  active = Math.max(0, active - 1);
  const next = waitQueue.shift();
  if (next) next();
}

export async function withGsapRenderSlot<T>(fn: () => Promise<T>): Promise<T> {
  await acquireGsapRenderSlot();
  try {
    return await fn();
  } finally {
    releaseGsapRenderSlot();
  }
}
