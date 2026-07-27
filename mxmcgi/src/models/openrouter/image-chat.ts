/**
 * OpenRouter 图生：统一走 /api/v1/chat/completions + modalities（非 OpenAI /images/*）
 * @see https://openrouter.ai/docs/guides/overview/multimodal/image-generation
 * @see https://openrouter.ai/openai/gpt-5-image
 */

export type OpenRouterImageContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

/** 从 GenerateParams 槽位收集参考图 URL / data URI */
export function collectOpenRouterReferenceImageUrls(params: {
  prompt: string;
  parameters?: Record<string, unknown>;
  [key: string]: unknown;
}): string[] {
  const p = (params.parameters || {}) as Record<string, unknown>;
  const top = params as Record<string, unknown>;
  const out: string[] = [];

  const push = (raw: unknown) => {
    if (typeof raw !== 'string' || !raw.trim()) return;
    const s = raw.trim();
    if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('data:')) {
      out.push(s);
    } else {
      out.push(`data:image/png;base64,${s}`);
    }
  };

  for (const key of ['image', 'image_input', 'image_urls', 'image_base64s', 'images']) {
    for (const slot of [p[key], top[key]]) {
      if (typeof slot === 'string') push(slot);
      else if (Array.isArray(slot)) {
        for (const item of slot) {
          if (typeof item === 'string') push(item);
        }
      }
    }
  }
  return out;
}

export function buildOpenRouterImageUserMessage(
  prompt: string,
  referenceUrls: string[],
): string | OpenRouterImageContentPart[] {
  if (referenceUrls.length === 0) return prompt;
  const parts: OpenRouterImageContentPart[] = [{ type: 'text', text: prompt }];
  for (const url of referenceUrls) {
    parts.push({ type: 'image_url', image_url: { url } });
  }
  return parts;
}

export function mapAspectRatioToOpenRouterImageConfig(
  params: Record<string, unknown>,
): Record<string, string> | undefined {
  const ar =
    (params.aspect_ratio as string | undefined) ||
    (params.aspectRatio as string | undefined);
  const imageSize = params.image_size as string | undefined;
  if (!ar && !imageSize) return undefined;
  const cfg: Record<string, string> = {};
  if (ar) cfg.aspect_ratio = ar;
  if (imageSize) cfg.image_size = imageSize;
  return cfg;
}

export function extractOpenRouterGeneratedImageUrls(json: unknown): string[] {
  const urls: string[] = [];
  const root = json as Record<string, unknown>;
  const choices = (root?.choices as unknown[]) ?? [];

  for (const choice of choices) {
    const msg = (choice as Record<string, unknown>)?.message as Record<string, unknown> | undefined;
    if (!msg) continue;

    const images = msg.images as unknown[] | undefined;
    if (Array.isArray(images)) {
      for (const img of images) {
        const row = img as Record<string, unknown>;
        const imageUrl = row?.image_url as Record<string, unknown> | undefined;
        const imageUrlCamel = row?.imageUrl as Record<string, unknown> | undefined;
        const u = imageUrl?.url ?? imageUrlCamel?.url;
        if (typeof u === 'string' && u) urls.push(u);
      }
    }

    const content = msg.content;
    if (Array.isArray(content)) {
      for (const part of content) {
        const p = part as Record<string, unknown>;
        if (p?.type === 'image_url') {
          const iu = p.image_url as Record<string, unknown> | undefined;
          if (typeof iu?.url === 'string') urls.push(iu.url);
        }
      }
    }
  }

  return urls;
}
