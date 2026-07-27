import {
  ALBUM_DEFAULT_ASPECT,
  ALBUM_MAX_ITEMS,
  type AlbumAspectRatio,
  type AlbumItem,
  type AlbumSpec,
} from './album-types';
import { parseLlmStructuredOutput } from '../../../tasks/parse-llm-json';

const ASPECT_SET = new Set<string>(['1:1', '4:3', '16:9', '9:16', '3:2']);

function asAspect(raw: unknown, fallback?: AlbumAspectRatio): AlbumAspectRatio | undefined {
  const s = String(raw ?? '').trim();
  if (ASPECT_SET.has(s)) return s as AlbumAspectRatio;
  return fallback;
}

function truncateTitle(raw: string, max = 8): string {
  const t = raw.replace(/\s+/g, ' ').trim();
  if (!t) return '配图';
  return [...t].slice(0, max).join('');
}

/** 解析用户 / LLM 产出的 album_spec（对象或 JSON 字符串） */
export function parseAlbumSpecInput(raw: unknown): unknown {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return null;
    // 走与 nestedText 相同的容错解析（去围栏 / 截断 salvage）
    return parseLlmStructuredOutput(t, 'album_spec');
  }
  return raw;
}

export function isLikelyValidAlbumSpec(raw: unknown): boolean {
  try {
    normalizeAlbumSpec(parseAlbumSpecInput(raw));
    return true;
  } catch {
    return false;
  }
}

/**
 * 规范化并校验 AlbumSpec。
 * @throws Error 结构不合法时
 */
export function normalizeAlbumSpec(raw: unknown, opts?: { maxItems?: number }): AlbumSpec {
  const data = parseAlbumSpecInput(raw);
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('album_spec 须为对象，含 items[]');
  }
  const obj = data as Record<string, unknown>;
  const itemsRaw = obj.items;
  if (!Array.isArray(itemsRaw) || itemsRaw.length === 0) {
    throw new Error('album_spec.items 须为非空数组');
  }
  const maxItems = opts?.maxItems ?? ALBUM_MAX_ITEMS;
  if (itemsRaw.length > maxItems) {
    throw new Error(`album_spec.items 最多 ${maxItems} 条，当前 ${itemsRaw.length}`);
  }

  const defaultAspect =
    asAspect(obj.aspect_ratio, ALBUM_DEFAULT_ASPECT) ?? ALBUM_DEFAULT_ASPECT;
  const title =
    typeof obj.title === 'string' && obj.title.trim()
      ? truncateTitle(obj.title.trim(), 24)
      : undefined;
  const style_hint =
    typeof obj.style_hint === 'string' && obj.style_hint.trim()
      ? obj.style_hint.trim().slice(0, 500)
      : undefined;

  const items: AlbumItem[] = [];
  for (let i = 0; i < itemsRaw.length; i++) {
    const row = itemsRaw[i];
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error(`album_spec.items[${i}] 须为对象`);
    }
    const r = row as Record<string, unknown>;
    const prompt = String(
      r.mxmImagePrompt ?? r.core_content ?? r.prompt ?? r.text ?? ''
    ).trim();
    if (!prompt) {
      throw new Error(`album_spec.items[${i}] 缺少 mxmImagePrompt（配图核心内容）`);
    }
    const idRaw = String(r.id ?? '').trim();
    const id = idRaw || `i${i + 1}`;
    const titleRaw = String(r.title ?? '').trim();
    const itemTitle = titleRaw ? truncateTitle(titleRaw, 8) : truncateTitle(prompt, 8);
    const orderNum = Number(r.order);
    items.push({
      id,
      order: Number.isFinite(orderNum) && orderNum > 0 ? Math.floor(orderNum) : i + 1,
      title: itemTitle,
      mxmImagePrompt: prompt.slice(0, 2000),
      aspect_ratio: asAspect(r.aspect_ratio, defaultAspect),
      notes:
        typeof r.notes === 'string' && r.notes.trim()
          ? r.notes.trim().slice(0, 500)
          : undefined,
    });
  }

  items.sort((a, b) => a.order - b.order);
  items.forEach((it, idx) => {
    it.order = idx + 1;
  });

  return {
    title,
    aspect_ratio: defaultAspect,
    style_hint,
    items,
  };
}

export function assertAlbumSpecOutput(parsed: unknown, _rawText?: string): void {
  normalizeAlbumSpec(parsed);
}
