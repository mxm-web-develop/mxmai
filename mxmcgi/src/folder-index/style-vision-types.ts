/**
 * 视觉风格卡统一视觉语言对象（StyleVisionObj / StylePackSummary）
 * @see docs/mxmcgi/virtual-folder-style-pack.md
 */

export type ColorValue =
  | {
      kind: 'solid';
      hex: string;
      note?: string;
    }
  | {
      kind: 'gradient';
      stops: Array<{ hex: string; at?: number }>;
      angle?: string;
      note?: string;
    };

export type ColorPalette = {
  name?: string;
  roles?: string[];
  colors: ColorValue[];
  note?: string;
};

export type StyleVisionObj = {
  schema_version: 1;
  confidence: number;
  source: 'image' | 'text';
  media_kind?:
    | 'photo'
    | 'illustration'
    | 'ui_screenshot'
    | 'palette_card'
    | 'storyboard'
    | 'poster'
    | 'logo'
    | 'texture'
    | 'design_doc'
    | 'other';
  style_tags?: string[];
  theme?: string;
  mood?: string[];
  aesthetic_summary?: string;
  palettes?: ColorPalette[];
  color_rules?: string;
  typography?: {
    font_feel?: string;
    weight_contrast?: string;
    size_ratio?: string;
    text_density?: string;
  };
  composition?: string;
  layout_rules?: string;
  spacing_rhythm?: string;
  aspect_bias?: string;
  design_elements?: string[];
  motif?: string[];
  subject_roles?: string[];
  materials?: string[];
  lighting?: string;
  avoid?: string[];
  ocr_style_hints?: string;
  caption?: string;
  /** 该图最明显可复用特征，1～3 短词（如 配色/布局/风格） */
  feature_tags?: string[];
  /** 索引侧附加，非模型必填 */
  media_url?: string;
  title?: string;
  ref_type?: 'task' | 'storage_object';
  ref_id?: string;
  /** pack 侧打分回写，非帧抽取必填 */
  fit_score?: number;
};

/** 卡面 Top 样例（最多 5，按 fit_score 降序） */
export type StyleExemplar = {
  ref_key: string;
  url?: string;
  fit_score: number;
  feature_tags: string[];
};

export type StylePackSummary = {
  schema_version: 1;
  style_summary: string;
  palettes: ColorPalette[];
  color_rules?: string;
  typography_feel?: string;
  composition_bias?: string;
  mood?: string[];
  style_tags?: string[];
  design_elements?: string[];
  avoid?: string[];
  variants?: string[];
  exemplar_ref_ids: string[];
  /** 与整包结合度最高的样例（最多 5） */
  exemplars?: StyleExemplar[];
  frame_count: number;
  coverage?: Record<string, number>;
  /** 注入兼容：由 exemplars / exemplar_ref_ids 解析出的 URL */
  exemplar_urls?: string[];
  /** 旧字段兼容：展平 hex 列表 */
  palette?: string[];
  donts?: string[];
};

export const STYLE_FEATURE_TAGS_MAX = 3;
export const STYLE_EXEMPLARS_MAX = 5;

const MEDIA_KINDS = new Set([
  'photo',
  'illustration',
  'ui_screenshot',
  'palette_card',
  'storyboard',
  'poster',
  'logo',
  'texture',
  'design_doc',
  'other',
]);

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function asStringArray(v: unknown, max = 24): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((s) => s.trim());
  return out.length ? out.slice(0, max) : undefined;
}

/** 特征标签：短词、去重、最多 3；过长词截断 */
export function normalizeFeatureTags(v: unknown, max = STYLE_FEATURE_TAGS_MAX): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    if (typeof x !== 'string') continue;
    const t = x.trim().slice(0, 16);
    if (!t || out.includes(t)) continue;
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

export function normalizeStyleExemplar(raw: unknown): StyleExemplar | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const ref_key = asString(o.ref_key) || asString(o.refKey);
  if (!ref_key) return null;
  const scoreRaw = o.fit_score ?? o.fitScore;
  const fit_score =
    typeof scoreRaw === 'number' && Number.isFinite(scoreRaw) ? clamp01(scoreRaw) : 0.5;
  const feature_tags = normalizeFeatureTags(o.feature_tags ?? o.featureTags);
  return {
    ref_key,
    fit_score,
    feature_tags,
    ...(asString(o.url) ? { url: asString(o.url) } : {}),
  };
}

/**
 * 从帧列表 + pack 原始 exemplars 组装最终 Top5。
 * 模型缺 exemplars 时按 fit_score / confidence 回退。
 */
export function buildStyleExemplars(input: {
  frames: StyleVisionObj[];
  packExemplars?: unknown;
  packExemplarRefIds?: string[];
  urlByRefKey?: Map<string, string>;
  max?: number;
}): StyleExemplar[] {
  const max = input.max ?? STYLE_EXEMPLARS_MAX;
  const frameByKey = new Map<string, StyleVisionObj>();
  for (const f of input.frames) {
    if (f.ref_type && f.ref_id) {
      frameByKey.set(`${f.ref_type}:${f.ref_id}`, f);
    }
  }

  const fromPack = Array.isArray(input.packExemplars)
    ? input.packExemplars.map(normalizeStyleExemplar).filter((e): e is StyleExemplar => !!e)
    : [];

  let candidates: StyleExemplar[] = fromPack.map((e) => {
    const frame = frameByKey.get(e.ref_key);
    const tags =
      e.feature_tags.length > 0
        ? e.feature_tags
        : normalizeFeatureTags(frame?.feature_tags);
    const url =
      e.url ||
      input.urlByRefKey?.get(e.ref_key) ||
      frame?.media_url ||
      undefined;
    return {
      ref_key: e.ref_key,
      fit_score: e.fit_score,
      feature_tags: tags,
      ...(url ? { url } : {}),
    };
  });

  if (candidates.length === 0) {
    const refIds = (input.packExemplarRefIds ?? []).filter(Boolean);
    if (refIds.length > 0) {
      candidates = refIds.map((ref_key, i) => {
        const frame = frameByKey.get(ref_key);
        const url = input.urlByRefKey?.get(ref_key) || frame?.media_url;
        return {
          ref_key,
          fit_score:
            typeof frame?.fit_score === 'number'
              ? clamp01(frame.fit_score)
              : clamp01((frame?.confidence ?? 0.5) - i * 0.01),
          feature_tags: normalizeFeatureTags(frame?.feature_tags),
          ...(url ? { url } : {}),
        };
      });
    }
  }

  if (candidates.length === 0) {
    candidates = input.frames
      .filter((f) => f.ref_type && f.ref_id)
      .map((f) => {
        const ref_key = `${f.ref_type}:${f.ref_id}`;
        const url = input.urlByRefKey?.get(ref_key) || f.media_url;
        return {
          ref_key,
          fit_score:
            typeof f.fit_score === 'number' ? clamp01(f.fit_score) : clamp01(f.confidence),
          feature_tags: normalizeFeatureTags(f.feature_tags),
          ...(url ? { url } : {}),
        };
      });
  }

  const seen = new Set<string>();
  const sorted = [...candidates]
    .filter((e) => {
      if (seen.has(e.ref_key)) return false;
      seen.add(e.ref_key);
      return true;
    })
    .sort((a, b) => b.fit_score - a.fit_score)
    .slice(0, max);

  return sorted.map((e) => {
    const url = e.url || input.urlByRefKey?.get(e.ref_key);
    return url ? { ...e, url } : e;
  });
}

/** 样例标签提示文案（生图注入，英文） */
export function formatStyleExemplarHints(exemplars: StyleExemplar[] | undefined): string {
  if (!exemplars?.length) return '';
  return exemplars
    .map((e, i) => {
      const tags = e.feature_tags.length ? `[${e.feature_tags.join(', ')}]` : '';
      return `ref${i + 1}${tags}`;
    })
    .join('; ');
}

function normalizeHex(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const s = raw.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toUpperCase();
  if (/^[0-9a-fA-F]{6}$/.test(s)) return `#${s.toUpperCase()}`;
  return undefined;
}

function normalizeColorValue(raw: unknown): ColorValue | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const kind = String(o.kind || '').toLowerCase();
  if (kind === 'gradient') {
    const stopsRaw = Array.isArray(o.stops) ? o.stops : [];
    const stops: Array<{ hex: string; at?: number }> = [];
    for (const st of stopsRaw) {
      if (!st || typeof st !== 'object') continue;
      const hex = normalizeHex((st as { hex?: unknown }).hex);
      if (!hex) continue;
      const at = (st as { at?: unknown }).at;
      stops.push({
        hex,
        ...(typeof at === 'number' && Number.isFinite(at) ? { at } : {}),
      });
    }
    if (stops.length === 0) return null;
    return {
      kind: 'gradient',
      stops,
      ...(asString(o.angle) ? { angle: asString(o.angle) } : {}),
      ...(asString(o.note) ? { note: asString(o.note) } : {}),
    };
  }
  const hex = normalizeHex(o.hex) || (kind !== 'solid' ? normalizeHex(o) : undefined);
  if (hex) {
    return {
      kind: 'solid',
      hex,
      ...(asString(o.note) ? { note: asString(o.note) } : {}),
    };
  }
  return null;
}

function normalizePalette(raw: unknown): ColorPalette | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const colorsRaw = Array.isArray(o.colors) ? o.colors : [];
  const colors = colorsRaw.map(normalizeColorValue).filter((c): c is ColorValue => !!c);
  if (colors.length === 0) return null;
  return {
    ...(asString(o.name) ? { name: asString(o.name) } : {}),
    ...(asStringArray(o.roles) ? { roles: asStringArray(o.roles) } : {}),
    colors,
    ...(asString(o.note) ? { note: asString(o.note) } : {}),
  };
}

export function flattenPaletteHexes(palettes: ColorPalette[] | undefined, max = 12): string[] {
  const out: string[] = [];
  for (const p of palettes ?? []) {
    for (const c of p.colors) {
      if (c.kind === 'solid') {
        if (!out.includes(c.hex)) out.push(c.hex);
      } else {
        for (const st of c.stops) {
          if (!out.includes(st.hex)) out.push(st.hex);
        }
      }
      if (out.length >= max) return out;
    }
  }
  return out;
}

export function normalizeStyleVisionObj(
  raw: unknown,
  fallback: { source: 'image' | 'text'; title?: string }
): StyleVisionObj {
  const o =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const confRaw = o.confidence;
  const confidence =
    typeof confRaw === 'number' && Number.isFinite(confRaw)
      ? Math.min(1, Math.max(0, confRaw))
      : 0.5;
  const mediaKindRaw = asString(o.media_kind);
  const media_kind =
    mediaKindRaw && MEDIA_KINDS.has(mediaKindRaw)
      ? (mediaKindRaw as StyleVisionObj['media_kind'])
      : undefined;
  const palettes = Array.isArray(o.palettes)
    ? o.palettes.map(normalizePalette).filter((p): p is ColorPalette => !!p).slice(0, 12)
    : undefined;
  const typography =
    o.typography && typeof o.typography === 'object' && !Array.isArray(o.typography)
      ? {
          ...(asString((o.typography as Record<string, unknown>).font_feel)
            ? { font_feel: asString((o.typography as Record<string, unknown>).font_feel) }
            : {}),
          ...(asString((o.typography as Record<string, unknown>).weight_contrast)
            ? {
                weight_contrast: asString(
                  (o.typography as Record<string, unknown>).weight_contrast
                ),
              }
            : {}),
          ...(asString((o.typography as Record<string, unknown>).size_ratio)
            ? { size_ratio: asString((o.typography as Record<string, unknown>).size_ratio) }
            : {}),
          ...(asString((o.typography as Record<string, unknown>).text_density)
            ? { text_density: asString((o.typography as Record<string, unknown>).text_density) }
            : {}),
        }
      : undefined;

  return {
    schema_version: 1,
    confidence,
    source: o.source === 'text' || o.source === 'image' ? o.source : fallback.source,
    ...(media_kind ? { media_kind } : {}),
    ...(asStringArray(o.style_tags) ? { style_tags: asStringArray(o.style_tags) } : {}),
    ...(asString(o.theme) ? { theme: asString(o.theme) } : {}),
    ...(asStringArray(o.mood) ? { mood: asStringArray(o.mood) } : {}),
    ...(asString(o.aesthetic_summary)
      ? { aesthetic_summary: asString(o.aesthetic_summary) }
      : fallback.title
        ? { aesthetic_summary: fallback.title }
        : {}),
    ...(palettes && palettes.length ? { palettes } : {}),
    ...(asString(o.color_rules) ? { color_rules: asString(o.color_rules) } : {}),
    ...(typography && Object.keys(typography).length ? { typography } : {}),
    ...(asString(o.composition) ? { composition: asString(o.composition) } : {}),
    ...(asString(o.layout_rules) ? { layout_rules: asString(o.layout_rules) } : {}),
    ...(asString(o.spacing_rhythm) ? { spacing_rhythm: asString(o.spacing_rhythm) } : {}),
    ...(asString(o.aspect_bias) ? { aspect_bias: asString(o.aspect_bias) } : {}),
    ...(asStringArray(o.design_elements)
      ? { design_elements: asStringArray(o.design_elements) }
      : {}),
    ...(asStringArray(o.motif) ? { motif: asStringArray(o.motif) } : {}),
    ...(asStringArray(o.subject_roles) ? { subject_roles: asStringArray(o.subject_roles) } : {}),
    ...(asStringArray(o.materials) ? { materials: asStringArray(o.materials) } : {}),
    ...(asString(o.lighting) ? { lighting: asString(o.lighting) } : {}),
    ...(asStringArray(o.avoid) ? { avoid: asStringArray(o.avoid) } : {}),
    ...(asString(o.ocr_style_hints) ? { ocr_style_hints: asString(o.ocr_style_hints) } : {}),
    ...(asString(o.caption) ? { caption: asString(o.caption) } : {}),
    ...(normalizeFeatureTags(o.feature_tags).length
      ? { feature_tags: normalizeFeatureTags(o.feature_tags) }
      : {}),
  };
}

export function normalizeStylePackSummary(
  raw: unknown,
  fallback: {
    frameCount: number;
    folderName: string;
    exemplarRefIds?: string[];
    frames?: StyleVisionObj[];
    urlByRefKey?: Map<string, string>;
  }
): StylePackSummary {
  const o =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const palettes = Array.isArray(o.palettes)
    ? o.palettes.map(normalizePalette).filter((p): p is ColorPalette => !!p).slice(0, 16)
    : [];
  const style_summary =
    asString(o.style_summary) ||
    asString(o.aesthetic_summary) ||
    fallback.folderName;
  const avoid = asStringArray(o.avoid) ?? asStringArray(o.donts);
  const palette = flattenPaletteHexes(palettes);

  const packExemplarRefIds = Array.isArray(o.exemplar_ref_ids)
    ? o.exemplar_ref_ids.filter((x): x is string => typeof x === 'string' && !!x.trim())
    : (fallback.exemplarRefIds ?? []);

  // 若 pack 输出了 frame_scores，写回 frames 的 fit_score 便于回退排序
  const frames = [...(fallback.frames ?? [])];
  if (Array.isArray(o.frame_scores)) {
    for (const row of o.frame_scores) {
      if (!row || typeof row !== 'object') continue;
      const rk = asString((row as { ref_key?: unknown }).ref_key);
      const sc = (row as { fit_score?: unknown }).fit_score;
      if (!rk || typeof sc !== 'number' || !Number.isFinite(sc)) continue;
      const f = frames.find(
        (x) => x.ref_type && x.ref_id && `${x.ref_type}:${x.ref_id}` === rk
      );
      if (f) f.fit_score = clamp01(sc);
    }
  }

  const exemplars = buildStyleExemplars({
    frames,
    packExemplars: o.exemplars,
    packExemplarRefIds,
    urlByRefKey: fallback.urlByRefKey,
    max: STYLE_EXEMPLARS_MAX,
  });
  const exemplar_ref_ids =
    exemplars.length > 0
      ? exemplars.map((e) => e.ref_key)
      : packExemplarRefIds.slice(0, STYLE_EXEMPLARS_MAX);
  const exemplar_urls = exemplars.map((e) => e.url).filter((u): u is string => !!u);

  return {
    schema_version: 1,
    style_summary,
    palettes,
    ...(asString(o.color_rules) ? { color_rules: asString(o.color_rules) } : {}),
    ...(asString(o.typography_feel) ? { typography_feel: asString(o.typography_feel) } : {}),
    ...(asString(o.composition_bias) ? { composition_bias: asString(o.composition_bias) } : {}),
    ...(asStringArray(o.mood) ? { mood: asStringArray(o.mood) } : {}),
    ...(asStringArray(o.style_tags) ? { style_tags: asStringArray(o.style_tags) } : {}),
    ...(asStringArray(o.design_elements)
      ? { design_elements: asStringArray(o.design_elements) }
      : {}),
    ...(avoid ? { avoid, donts: avoid } : {}),
    ...(asStringArray(o.variants) ? { variants: asStringArray(o.variants) } : {}),
    exemplar_ref_ids,
    ...(exemplars.length ? { exemplars } : {}),
    ...(exemplar_urls.length ? { exemplar_urls } : {}),
    frame_count:
      typeof o.frame_count === 'number' && Number.isFinite(o.frame_count)
        ? o.frame_count
        : fallback.frameCount,
    ...(o.coverage && typeof o.coverage === 'object' && !Array.isArray(o.coverage)
      ? { coverage: o.coverage as Record<string, number> }
      : {}),
    ...(palette.length ? { palette } : {}),
  };
}

/** 检索 / KB 用短正文 */
export function styleVisionObjToSearchText(obj: StyleVisionObj, name?: string): string {
  return [
    name ? `[${name}]` : '',
    obj.aesthetic_summary || '',
    obj.style_tags?.length ? `标签: ${obj.style_tags.join(', ')}` : '',
    obj.feature_tags?.length ? `特征: ${obj.feature_tags.join(', ')}` : '',
    obj.theme ? `主题: ${obj.theme}` : '',
    obj.mood?.length ? `情绪: ${obj.mood.join(', ')}` : '',
    obj.composition ? `构图: ${obj.composition}` : '',
    obj.color_rules ? `用色: ${obj.color_rules}` : '',
    obj.avoid?.length ? `避免: ${obj.avoid.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function isStyleVisionObj(raw: unknown): raw is StyleVisionObj {
  return (
    !!raw &&
    typeof raw === 'object' &&
    !Array.isArray(raw) &&
    (raw as StyleVisionObj).schema_version === 1 &&
    typeof (raw as StyleVisionObj).confidence === 'number' &&
    ((raw as StyleVisionObj).source === 'image' || (raw as StyleVisionObj).source === 'text')
  );
}
