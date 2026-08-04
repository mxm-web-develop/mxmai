/**
 * writing/group/deck 平台 IR（真相源）
 * 见 docs/adr/writing-group-deck-pptx.md
 */

export const DECK_TYPES = ['brand', 'product', 'pitch', 'course', 'custom'] as const;
export type DeckType = (typeof DECK_TYPES)[number];

export const DECK_DENSITIES = ['sparse', 'balanced', 'dense'] as const;
export type DeckDensity = (typeof DECK_DENSITIES)[number];

export const SLIDE_ROLES = [
  'cover',
  'agenda',
  'section',
  'content',
  'chart',
  'quote',
  'closing',
] as const;
export type SlideRole = (typeof SLIDE_ROLES)[number];

export const LAYOUT_HINTS = [
  'title_center',
  'title_left',
  'agenda_list',
  'section_divider',
  'bullets',
  'two_column',
  'split_media_left',
  'split_media_right',
  'big_number',
  'three_cards',
  'quote_center',
  'closing',
] as const;
export type LayoutHint = (typeof LAYOUT_HINTS)[number];

export type DeckVisualSystem = {
  palette?: {
    background?: string;
    foreground?: string;
    accent?: string;
    muted?: string;
  };
  typography?: {
    title_font?: string;
    body_font?: string;
    title_size_pt?: number;
    body_size_pt?: number;
  };
  layout_rules?: string[];
  motif?: string;
  ratio?: '16:9' | '4:3';
};

export type DeckSlideElement = {
  kind: string;
  text?: string;
  asset_ref?: string;
  emphasis?: boolean;
};

export type DeckSlideIr = {
  id: string;
  order: number;
  role: SlideRole | string;
  title: string;
  subtitle?: string;
  bullets?: string[];
  body?: string;
  notes?: string;
  layout_hint?: LayoutHint | string;
  elements?: DeckSlideElement[];
  page_style?: {
    accent?: string;
    emphasis?: string;
  };
  /** 仅 renderPptx 串行写入；LLM 不得产出 */
  svg_ir?: string;
};

export type DeckPlanRecommendItem = {
  id: string;
  label: string;
  page_count: number;
  density: DeckDensity | string;
  narrative_arc?: string;
  slide_roles: Array<SlideRole | string>;
  why?: string;
};

export type DeckBasicFields = {
  deck_type: DeckType | string;
  title?: string;
  audience?: string;
  language?: string;
  design_style?: string;
  design_style_custom?: string;
  brief?: string;
  asset_refs?: string[];
  plan_id?: string;
  page_count?: number;
  density?: DeckDensity | string;
  visual_system?: DeckVisualSystem;
  selected_plan?: DeckPlanRecommendItem;
};

export const DEFAULT_MAX_DECK_PAGES = 16;
export const HARD_MAX_DECK_PAGES = 24;
export const MIN_DECK_PAGES = 8;

export function clampDeckPageCount(n: unknown, fallback = 10): number {
  const raw = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(HARD_MAX_DECK_PAGES, Math.max(1, Math.floor(raw)));
}

export function defaultLayoutHintForRole(role: string): LayoutHint {
  switch (role) {
    case 'cover':
      return 'title_center';
    case 'agenda':
      return 'agenda_list';
    case 'section':
      return 'section_divider';
    case 'chart':
      return 'big_number';
    case 'quote':
      return 'quote_center';
    case 'closing':
      return 'closing';
    default:
      return 'bullets';
  }
}

/**
 * 按方案 slide_roles / page_count 确定性展开空 slides 骨架（input 阶段，无 LLM）。
 */
export function expandSlidesSkeleton(opts: {
  slideRoles?: Array<SlideRole | string> | null;
  pageCount?: number | null;
  maxPages?: number;
}): DeckSlideIr[] {
  const maxPages = Math.min(
    HARD_MAX_DECK_PAGES,
    Math.max(1, opts.maxPages ?? DEFAULT_MAX_DECK_PAGES)
  );
  let roles = Array.isArray(opts.slideRoles)
    ? opts.slideRoles.map((r) => String(r || 'content').trim()).filter(Boolean)
    : [];
  const pageCount = clampDeckPageCount(opts.pageCount ?? roles.length ?? 10, 10);
  const target = Math.min(maxPages, Math.max(1, pageCount));

  if (roles.length === 0) {
    roles = ['cover', 'agenda'];
    while (roles.length < target - 1) roles.push('content');
    roles.push('closing');
  }
  while (roles.length < target) roles.push('content');
  if (roles.length > target) roles = roles.slice(0, target);
  if (roles.length > 0 && roles[0] !== 'cover') roles[0] = 'cover';
  if (roles.length > 1 && roles[roles.length - 1] !== 'closing') {
    roles[roles.length - 1] = 'closing';
  }

  return roles.map((role, i) => ({
    id: `s${i + 1}`,
    order: i + 1,
    role,
    title: role === 'cover' ? '' : role === 'closing' ? '' : `第 ${i + 1} 页`,
    layout_hint: defaultLayoutHintForRole(role),
    bullets: [],
  }));
}

export function assembleDeckOutlineMarkdown(opts: {
  title?: string;
  deckType?: string;
  slides: DeckSlideIr[];
}): string {
  const title = (opts.title || '演示文稿').trim() || '演示文稿';
  const lines: string[] = [`# ${title}`, ''];
  if (opts.deckType) {
    lines.push(`> 类型：${opts.deckType}`, '');
  }
  lines.push('## 目录', '');
  for (const s of opts.slides) {
    const t = (s.title || '').trim() || `第 ${s.order} 页`;
    lines.push(`${s.order}. **${t}**（${s.role}${s.layout_hint ? ` · ${s.layout_hint}` : ''}）`);
    if (Array.isArray(s.bullets) && s.bullets.length) {
      for (const b of s.bullets.slice(0, 5)) {
        lines.push(`   - ${String(b)}`);
      }
    } else if (s.body?.trim()) {
      lines.push(`   - ${s.body.trim().slice(0, 80)}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

/** 模型把页写成设计规范 / HTML / SVG 时的脏内容检测 */
export function looksLikeSlideMarkupGarbage(raw: string | null | undefined): boolean {
  const s = String(raw ?? '').trim();
  if (!s) return false;
  const lower = s.toLowerCase();
  if (lower === 'svg' || lower === 'html' || lower === 'css') return true;
  if (/```(?:html|svg|css|xml)\b/i.test(s)) return true;
  if (/<!DOCTYPE\s+html/i.test(s) || /<svg[\s>]/i.test(s)) return true;
  if (/视觉系统|layout_hint|visual_system|十六进制|#F2EBDD|#B83A2B/i.test(s) && /pt\b|留白|字号/.test(s)) {
    return true;
  }
  if (/按\s*contract|合同规范|设计完全遵循|版面结构（16:9/i.test(s)) return true;
  return false;
}

export function sanitizeSlideReaderText(raw: string | null | undefined): string {
  let s = String(raw ?? '').trim();
  if (!s) return '';
  if (looksLikeSlideMarkupGarbage(s)) return '';
  // 去掉围栏代码块（常被模型塞进 body）
  s = s.replace(/```[\s\S]*?```/g, '').trim();
  s = s.replace(/<\/?(?:html|head|body|style|script|svg|path|rect|defs)[^>]*>/gi, '').trim();
  if (looksLikeSlideMarkupGarbage(s)) return '';
  return s;
}

/**
 * 由 IR 确定性拼装单页摘要 Markdown（禁止再调 LLM 写「设计说明」）。
 */
export function assembleSlideManuscriptMarkdown(slide: {
  title?: unknown;
  subtitle?: unknown;
  bullets?: unknown;
  body?: unknown;
  order?: unknown;
  role?: unknown;
}): string {
  const order =
    typeof slide.order === 'number' && Number.isFinite(slide.order) ? slide.order : undefined;
  let title = sanitizeSlideReaderText(String(slide.title ?? ''));
  if (!title) {
    const role = String(slide.role ?? '').trim();
    title =
      role === 'cover'
        ? '封面'
        : role === 'closing'
          ? '收束'
          : role === 'agenda'
            ? '目录'
            : order
              ? `第 ${order} 页`
              : '幻灯片';
  }
  const subtitle = sanitizeSlideReaderText(String(slide.subtitle ?? ''));
  const bullets = Array.isArray(slide.bullets)
    ? slide.bullets
        .map((b) => sanitizeSlideReaderText(String(b)))
        .filter(Boolean)
        .slice(0, 8)
    : [];
  const body = sanitizeSlideReaderText(String(slide.body ?? ''));

  const lines: string[] = [`## ${title}`, ''];
  if (subtitle) {
    lines.push(subtitle, '');
  }
  for (const b of bullets) {
    lines.push(`- ${b}`);
  }
  if (bullets.length && body) lines.push('');
  if (body) lines.push(body);
  lines.push('');
  return lines.join('\n').trim() + '\n';
}

/** 清洗 nestedText / 填页 JSON，避免 title=svg、body=HTML */
export function sanitizeDeckSlideFillPatch(
  patch: Record<string, unknown>,
  previous?: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...patch };
  const prevTitle = sanitizeSlideReaderText(String(previous?.title ?? ''));
  if (typeof out.title === 'string') {
    const t = sanitizeSlideReaderText(out.title);
    out.title = t || prevTitle || previous?.title || out.title;
    if (looksLikeSlideMarkupGarbage(String(patch.title ?? ''))) {
      out.title = prevTitle || String(previous?.title ?? '').trim() || `第 ${previous?.order ?? ''} 页`.trim();
    }
  }
  if (typeof out.subtitle === 'string') {
    out.subtitle = sanitizeSlideReaderText(out.subtitle) || undefined;
  }
  if (typeof out.body === 'string') {
    out.body = sanitizeSlideReaderText(out.body) || undefined;
  }
  if (typeof out.notes === 'string') {
    const n = sanitizeSlideReaderText(out.notes);
    out.notes = n || undefined;
  }
  if (Array.isArray(out.bullets)) {
    out.bullets = out.bullets
      .map((b) => sanitizeSlideReaderText(String(b)))
      .filter(Boolean)
      .slice(0, 8);
  }
  if (Array.isArray(out.elements)) {
    out.elements = out.elements.filter((el) => {
      if (!el || typeof el !== 'object') return false;
      const kind = String((el as { kind?: unknown }).kind ?? '').toLowerCase();
      if (kind === 'svg' || kind === 'html' || kind === 'css') return false;
      const text = String((el as { text?: unknown }).text ?? '');
      return !looksLikeSlideMarkupGarbage(text);
    });
  }
  return out;
}
