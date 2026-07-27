/**
 * 有限并发执行异步任务，保持结果顺序与输入一致
 */
export async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
  options?: {
    shouldAbort?: () => boolean;
    onRow?: (index: number, result: R) => void;
  }
): Promise<(R | undefined)[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results: (R | undefined)[] = new Array(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (true) {
      if (options?.shouldAbort?.()) break;
      const i = next++;
      if (i >= items.length) break;
      if (options?.shouldAbort?.()) break;
      const result = await fn(items[i], i);
      results[i] = result;
      options?.onRow?.(i, result);
      if (options?.shouldAbort?.()) break;
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}
