import type { DocumentRenderSpecV1 } from './types';

const PALETTES: Record<
  string,
  { primary: string; secondary: string; text: string; muted: string; background: string }
> = {
  tech_blue: {
    primary: '#0ea5e9',
    secondary: '#0284c7',
    text: '#0f172a',
    muted: '#64748b',
    background: '#f8fafc',
  },
  modern_sidebar: {
    primary: '#2563eb',
    secondary: '#1d4ed8',
    text: '#111827',
    muted: '#6b7280',
    background: '#ffffff',
  },
  classic_onesheet: {
    primary: '#374151',
    secondary: '#1f2937',
    text: '#111827',
    muted: '#6b7280',
    background: '#ffffff',
  },
  minimal_clean: {
    primary: '#18181b',
    secondary: '#52525b',
    text: '#18181b',
    muted: '#71717a',
    background: '#fafafa',
  },
  compact_dense: {
    primary: '#059669',
    secondary: '#047857',
    text: '#064e3b',
    muted: '#6b7280',
    background: '#ffffff',
  },
};

export function resolveThemeColors(spec: DocumentRenderSpecV1): {
  primary: string;
  secondary: string;
  text: string;
  muted: string;
  background: string;
} {
  const palette = PALETTES[spec.theme.designStyle] ?? PALETTES[spec.theme.paletteId] ?? PALETTES.modern_sidebar;
  return {
    primary: spec.theme.colors?.primary ?? palette.primary,
    secondary: spec.theme.colors?.secondary ?? palette.secondary,
    text: spec.theme.colors?.text ?? palette.text,
    muted: spec.theme.colors?.muted ?? palette.muted,
    background: spec.theme.colors?.background ?? palette.background,
  };
}

export function resolveBinding(
  binding: string | undefined,
  markdown: string,
  structured: unknown
): string {
  if (!binding?.trim()) return '';
  const key = binding.trim();
  if (key === 'markdown' || key === '${markdown}' || key === 'core.markdown') {
    return markdown;
  }
  if (key.startsWith('structured.')) {
    const path = key.slice('structured.'.length).split('.');
    let cur: unknown = structured;
    for (const seg of path) {
      if (cur == null || typeof cur !== 'object') return '';
      cur = (cur as Record<string, unknown>)[seg];
    }
    if (cur == null) return '';
    if (typeof cur === 'string') return cur;
    if (Array.isArray(cur)) {
      return cur.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).join('\n');
    }
    return JSON.stringify(cur, null, 2);
  }
  return binding;
}

export function resolveAssetUrl(
  spec: DocumentRenderSpecV1,
  assetId: string | undefined
): string | undefined {
  if (!assetId?.trim()) return undefined;
  const hit = (spec.assets ?? []).find((a) => a.id === assetId);
  return hit?.url?.trim() || undefined;
}

export function resolveStructuredHighlights(structured: unknown): string[] {
  if (!structured || typeof structured !== 'object') return [];
  const highlights = (structured as Record<string, unknown>).highlights;
  if (!Array.isArray(highlights)) return [];
  return highlights
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (item && typeof item === 'object' && typeof (item as { text?: string }).text === 'string') {
        return (item as { text: string }).text.trim();
      }
      return '';
    })
    .filter(Boolean);
}

export function resolveStructuredMetaTitle(structured: unknown): string | undefined {
  if (!structured || typeof structured !== 'object') return undefined;
  const meta = (structured as Record<string, unknown>).meta;
  if (!meta || typeof meta !== 'object') return undefined;
  const title = (meta as Record<string, unknown>).title ?? (meta as Record<string, unknown>).name;
  return typeof title === 'string' && title.trim() ? title.trim() : undefined;
}
