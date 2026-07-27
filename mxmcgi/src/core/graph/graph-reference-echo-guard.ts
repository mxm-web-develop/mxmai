/**
 * Graph 生图结果不得与上传参考图 URL 相同（上游 edits 空改图 / 透传检测）
 */

const REFERENCE_SLOT_KEYS = [
  'referenceImage',
  'garment_images',
  'model_images',
  'clothing_images',
  'style_images',
  'environment_images',
  'product_images',
] as const;

export function normalizeHttpUrlForCompare(url: string): string {
  const trimmed = url.trim();
  try {
    const u = new URL(trimmed);
    u.hash = '';
    u.search = '';
    return `${u.protocol}//${u.host}${u.pathname}`.toLowerCase();
  } catch {
    return trimmed.toLowerCase().split('?')[0].split('#')[0];
  }
}

function pushReferenceUrl(out: Set<string>, value: unknown): void {
  if (typeof value !== 'string') return;
  const v = value.trim();
  if (/^https?:\/\//i.test(v)) out.add(normalizeHttpUrlForCompare(v));
}

export function collectGraphReferenceHttpUrls(params: Record<string, unknown>): Set<string> {
  const out = new Set<string>();
  for (const key of REFERENCE_SLOT_KEYS) {
    const slot = params[key];
    if (!Array.isArray(slot)) continue;
    for (const item of slot) {
      if (item && typeof item === 'object' && 'content' in item) {
        pushReferenceUrl(out, (item as { content?: unknown }).content);
      } else {
        pushReferenceUrl(out, item);
      }
    }
  }
  return out;
}

export function filterReferenceEchoUrls(outputUrls: string[], refUrls: Set<string>): string[] {
  if (refUrls.size === 0) return outputUrls;
  return outputUrls.filter((u) => {
    if (typeof u !== 'string' || !/^https?:\/\//i.test(u.trim())) return true;
    return !refUrls.has(normalizeHttpUrlForCompare(u));
  });
}

export function assertGraphOutputNotReferenceEcho(
  outputUrls: string[],
  refUrls: Set<string>,
  context?: string
): void {
  if (refUrls.size === 0 || outputUrls.length === 0) return;
  const httpOut = outputUrls.filter((u) => typeof u === 'string' && /^https?:\/\//i.test(u.trim()));
  if (httpOut.length === 0) return;
  const filtered = filterReferenceEchoUrls(httpOut, refUrls);
  if (filtered.length === 0) {
    const suffix = context ? ` (${context})` : '';
    throw new Error(
      `[GraphTask] 生成结果与上传参考图 URL 相同，上游未返回新图${suffix}。请检查 gpt-image edits 是否生效。`
    );
  }
}
