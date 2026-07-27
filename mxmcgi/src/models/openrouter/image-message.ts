/**
 * OpenRouter 图生：统一走 /chat/completions + modalities，参考图走 multimodal messages。
 * @see https://openrouter.ai/docs/guides/overview/multimodal/image-generation
 * @see https://openrouter.ai/docs/guides/overview/multimodal/image-understanding
 */

import type { GenerateParams } from '../providers-inner';

export function collectOpenRouterReferenceUris(params: GenerateParams): string[] {
  const p = (params.parameters || {}) as Record<string, unknown>;
  const top = params as Record<string, unknown>;
  const slots: unknown[] = [];
  for (const key of ['image', 'image_base64s', 'images', 'image_input', 'image_urls']) {
    if (hasNonemptyImageSlot(p[key])) slots.push(p[key]);
    if (hasNonemptyImageSlot(top[key])) slots.push(top[key]);
  }

  const out: string[] = [];
  const pushOne = (raw: string) => {
    const s = raw.trim();
    if (!s) return;
    if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('data:')) {
      out.push(s);
      return;
    }
    out.push(`data:image/png;base64,${s}`);
  };

  for (const slot of slots) {
    if (typeof slot === 'string') pushOne(slot);
    else if (Array.isArray(slot)) {
      for (const item of slot) {
        if (typeof item === 'string') pushOne(item);
      }
    }
  }
  return out;
}

function hasNonemptyImageSlot(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.some((x) => typeof x === 'string' && String(x).trim().length > 0);
  return false;
}

/** 文本在前、参考图在后（OpenRouter 推荐顺序） */
export function buildOpenRouterImageUserMessage(
  prompt: string,
  params: GenerateParams,
): { role: 'user'; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> } {
  const refs = collectOpenRouterReferenceUris(params);
  if (refs.length === 0) {
    return { role: 'user', content: prompt };
  }
  const parts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
    { type: 'text', text: prompt },
  ];
  for (const url of refs) {
    parts.push({ type: 'image_url', image_url: { url } });
  }
  return { role: 'user', content: parts };
}

export function extractOpenRouterImageUrls(json: unknown): string[] {
  const urls: string[] = [];
  const choices = (json as { choices?: unknown[] })?.choices ?? [];
  for (const choice of choices) {
    const msg = (choice as { message?: Record<string, unknown> })?.message;
    if (!msg) continue;

    const images = msg.images;
    if (Array.isArray(images)) {
      for (const img of images) {
        const row = img as { image_url?: { url?: string }; url?: string };
        const u = row?.image_url?.url ?? row?.url;
        if (typeof u === 'string' && u.length > 0) urls.push(u);
      }
    }

    const content = msg.content;
    if (Array.isArray(content)) {
      for (const part of content) {
        const p = part as { type?: string; image_url?: { url?: string } };
        if (p?.type === 'image_url' && p.image_url?.url) urls.push(p.image_url.url);
      }
    }
  }

  const topImages = (json as { images?: unknown[] })?.images;
  if (Array.isArray(topImages)) {
    for (const img of topImages) {
      if (typeof img === 'string') urls.push(img);
      else if (img && typeof img === 'object' && 'url' in img) {
        const u = (img as { url?: string }).url;
        if (u) urls.push(u);
      }
    }
  }

  return urls;
}

/** graph scope 常见画幅 → OpenRouter image_config */
export function resolveOpenRouterImageConfig(
  params: GenerateParams,
): { aspect_ratio?: string; image_size?: string } | undefined {
  const p = params.parameters || {};
  const ar =
    (params as { aspect_ratio?: string }).aspect_ratio ||
    (p.aspect_ratio as string | undefined) ||
    (p.aspectRatio as string | undefined);
  const image_size =
    (p.image_size as string | undefined) ||
    (p.imageSize as string | undefined);

  if (!ar && !image_size) return undefined;
  return {
    ...(ar ? { aspect_ratio: ar } : {}),
    ...(image_size ? { image_size } : {}),
  };
}
