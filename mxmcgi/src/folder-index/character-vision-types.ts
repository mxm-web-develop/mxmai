/**
 * 角色卡整包对象（CharacterPackSummary）
 * @see docs/mxmcgi/virtual-folder-character-pack.md
 */

export type FieldProvenance = 'extracted' | 'inferred' | 'user';

export type Provenanced<T> = {
  value: T;
  provenance: FieldProvenance;
  evidence?: string[];
};

export type CharacterMediaKind =
  | 'single_portrait'
  | 'multi_view_sheet'
  | 'expression_sheet'
  | 'outfit_sheet'
  | 'info_card'
  | 'scene_with_character'
  | 'other';

export type CharacterMediaAsset = {
  ref_key: string;
  media_kind: CharacterMediaKind;
  is_multi_panel: boolean;
  panel_hints?: string[];
  suitability?: {
    identity_lock: number;
    costume_ref: number;
    expression_ref: number;
  };
  url?: string;
};

export type CharacterPackSummary = {
  schema_version: 1;
  display_name: Provenanced<string>;
  aliases?: Provenanced<string[]>;
  species_or_race?: Provenanced<string>;
  gender_presentation?: Provenanced<string>;
  age_band?: Provenanced<string>;
  physique?: Provenanced<string>;
  face?: Provenanced<string>;
  hair?: Provenanced<string>;
  distinctive_marks?: Provenanced<string[]>;
  clothing_default?: Provenanced<string>;
  clothing_preferences?: Provenanced<string[]>;
  color_affinities?: Provenanced<string[]>;
  personality?: Provenanced<string>;
  background?: Provenanced<string>;
  speech_style?: Provenanced<string>;
  likes?: Provenanced<string[]>;
  dislikes?: Provenanced<string[]>;
  relationships?: Provenanced<string[]>;
  abilities?: Provenanced<string[]>;
  character_brief: string;
  appearance_prompt: string;
  media_assets: CharacterMediaAsset[];
  appearance_primary_ref?: string;
  appearance_ref_ids: string[];
  appearance_image_urls?: string[];
  /** 兼容旧卡 */
  appearance_image_urls_legacy?: string[];
  description?: string;
  voice_id?: string;
  asset_count: number;
};

export const CHARACTER_APPEARANCE_REFS_MAX = 10;
export const CHARACTER_VISION_IMAGES_MAX = 12;

const MEDIA_KINDS = new Set<CharacterMediaKind>([
  'single_portrait',
  'multi_view_sheet',
  'expression_sheet',
  'outfit_sheet',
  'info_card',
  'scene_with_character',
  'other',
]);

const PROVENANCE = new Set<FieldProvenance>(['extracted', 'inferred', 'user']);

const STRING_FIELDS = [
  'display_name',
  'species_or_race',
  'gender_presentation',
  'age_band',
  'physique',
  'face',
  'hair',
  'clothing_default',
  'personality',
  'background',
  'speech_style',
] as const;

const ARRAY_FIELDS = [
  'aliases',
  'distinctive_marks',
  'clothing_preferences',
  'color_affinities',
  'likes',
  'dislikes',
  'relationships',
  'abilities',
] as const;

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function asStringArray(v: unknown, max = 24): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .filter((x): x is string => typeof x === 'string' && !!x.trim())
    .map((s) => s.trim())
    .slice(0, max);
  return out.length ? out : undefined;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function provenanceRank(p: FieldProvenance): number {
  if (p === 'user') return 3;
  if (p === 'extracted') return 2;
  return 1;
}

export function normalizeProvenancedString(
  raw: unknown,
  fallback?: { value: string; provenance?: FieldProvenance }
): Provenanced<string> | undefined {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    const value = asString(o.value);
    if (!value) return fallback ? { value: fallback.value, provenance: fallback.provenance ?? 'inferred' } : undefined;
    const prov = asString(o.provenance);
    const provenance: FieldProvenance =
      prov && PROVENANCE.has(prov as FieldProvenance) ? (prov as FieldProvenance) : 'inferred';
    const evidence = asStringArray(o.evidence, 8);
    return { value, provenance, ...(evidence ? { evidence } : {}) };
  }
  if (typeof raw === 'string' && raw.trim()) {
    return { value: raw.trim(), provenance: 'inferred' };
  }
  if (fallback) return { value: fallback.value, provenance: fallback.provenance ?? 'inferred' };
  return undefined;
}

export function normalizeProvenancedStringArray(
  raw: unknown,
  fallback?: { value: string[]; provenance?: FieldProvenance }
): Provenanced<string[]> | undefined {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    const value = asStringArray(o.value, 24);
    if (!value) return fallback
      ? { value: fallback.value, provenance: fallback.provenance ?? 'inferred' }
      : undefined;
    const prov = asString(o.provenance);
    const provenance: FieldProvenance =
      prov && PROVENANCE.has(prov as FieldProvenance) ? (prov as FieldProvenance) : 'inferred';
    const evidence = asStringArray(o.evidence, 8);
    return { value, provenance, ...(evidence ? { evidence } : {}) };
  }
  if (Array.isArray(raw)) {
    const value = asStringArray(raw, 24);
    if (value) return { value, provenance: 'inferred' };
  }
  if (fallback) return { value: fallback.value, provenance: fallback.provenance ?? 'inferred' };
  return undefined;
}

export function mergeProvenancedString(
  prev: Provenanced<string> | undefined,
  next: Provenanced<string> | undefined
): Provenanced<string> | undefined {
  if (!prev) return next;
  if (!next) return prev;
  return provenanceRank(prev.provenance) >= provenanceRank(next.provenance) ? prev : next;
}

export function mergeProvenancedStringArray(
  prev: Provenanced<string[]> | undefined,
  next: Provenanced<string[]> | undefined
): Provenanced<string[]> | undefined {
  if (!prev) return next;
  if (!next) return prev;
  return provenanceRank(prev.provenance) >= provenanceRank(next.provenance) ? prev : next;
}

function normalizeMediaAsset(raw: unknown): CharacterMediaAsset | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const ref_key = asString(o.ref_key);
  if (!ref_key) return null;
  const mk = asString(o.media_kind);
  let media_kind: CharacterMediaKind =
    mk && MEDIA_KINDS.has(mk as CharacterMediaKind) ? (mk as CharacterMediaKind) : 'other';
  // 仅信任显式布尔：禁止用 media_kind 含 sheet / info_card 自动强制 multi-panel
  //（单人照常被误标成 outfit_sheet / multi_view_sheet）
  let is_multi_panel = o.is_multi_panel === true;
  let panel_hints = asStringArray(o.panel_hints, 12);
  if (!is_multi_panel) {
    // 非多面板时：清掉 panel_hints，并把矛盾的 sheet/info_card 降级为单图
    panel_hints = undefined;
    if (
      media_kind === 'multi_view_sheet' ||
      media_kind === 'expression_sheet' ||
      media_kind === 'outfit_sheet' ||
      media_kind === 'info_card'
    ) {
      media_kind = 'single_portrait';
    }
  } else if (
    media_kind === 'single_portrait' ||
    media_kind === 'scene_with_character' ||
    media_kind === 'other'
  ) {
    // 声称 multi-panel 但 kind 是单图类 → 不采信 multi-panel
    is_multi_panel = false;
    panel_hints = undefined;
  }
  let suitability: CharacterMediaAsset['suitability'];
  if (o.suitability && typeof o.suitability === 'object' && !Array.isArray(o.suitability)) {
    const s = o.suitability as Record<string, unknown>;
    suitability = {
      identity_lock:
        typeof s.identity_lock === 'number' && Number.isFinite(s.identity_lock)
          ? clamp01(s.identity_lock)
          : 0.5,
      costume_ref:
        typeof s.costume_ref === 'number' && Number.isFinite(s.costume_ref)
          ? clamp01(s.costume_ref)
          : 0.3,
      expression_ref:
        typeof s.expression_ref === 'number' && Number.isFinite(s.expression_ref)
          ? clamp01(s.expression_ref)
          : 0.3,
    };
  }
  return {
    ref_key,
    media_kind,
    is_multi_panel,
    ...(panel_hints ? { panel_hints } : {}),
    ...(suitability ? { suitability } : {}),
    ...(asString(o.url) ? { url: asString(o.url) } : {}),
  };
}

function pickAppearanceRefs(
  media_assets: CharacterMediaAsset[],
  packRefIds: string[] | undefined,
  max = CHARACTER_APPEARANCE_REFS_MAX
): string[] {
  if (Array.isArray(packRefIds) && packRefIds.length) {
    const valid = new Set(media_assets.map((m) => m.ref_key));
    const ordered = packRefIds.filter((id) => valid.has(id) || id.includes(':'));
    if (ordered.length) return [...new Set(ordered)].slice(0, max);
  }
  const scored = [...media_assets].sort((a, b) => {
    const ia = a.suitability?.identity_lock ?? (a.is_multi_panel ? 0.75 : 0.5);
    const ib = b.suitability?.identity_lock ?? (b.is_multi_panel ? 0.75 : 0.5);
    return ib - ia;
  });
  return scored.map((m) => m.ref_key).slice(0, max);
}

export function normalizeCharacterPackSummary(
  raw: unknown,
  fallback: {
    folderName: string;
    assetCount: number;
    urlByRefKey?: Map<string, string>;
    previous?: CharacterPackSummary | null;
  }
): CharacterPackSummary {
  const o =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  const media_assets = (
    Array.isArray(o.media_assets) ? o.media_assets : []
  )
    .map(normalizeMediaAsset)
    .filter((m): m is CharacterMediaAsset => !!m)
    .map((m) => {
      const url = m.url || fallback.urlByRefKey?.get(m.ref_key);
      return url ? { ...m, url } : m;
    });

  const appearance_ref_ids = pickAppearanceRefs(
    media_assets,
    Array.isArray(o.appearance_ref_ids)
      ? o.appearance_ref_ids.filter((x): x is string => typeof x === 'string' && !!x.trim())
      : undefined
  );

  let appearance_primary_ref =
    asString(o.appearance_primary_ref) || appearance_ref_ids[0] || undefined;
  if (appearance_primary_ref && !appearance_ref_ids.includes(appearance_primary_ref)) {
    appearance_ref_ids.unshift(appearance_primary_ref);
    appearance_ref_ids.splice(CHARACTER_APPEARANCE_REFS_MAX);
  }

  const appearance_image_urls = appearance_ref_ids
    .map((id) => media_assets.find((m) => m.ref_key === id)?.url || fallback.urlByRefKey?.get(id))
    .filter((u): u is string => typeof u === 'string' && !!u);

  const display_name =
    normalizeProvenancedString(o.display_name, {
      value: fallback.folderName,
      provenance: 'inferred',
    }) ?? { value: fallback.folderName, provenance: 'inferred' as const };

  let pack: CharacterPackSummary = {
    schema_version: 1,
    display_name,
    character_brief:
      asString(o.character_brief) ||
      asString(o.description) ||
      `${display_name.value}. Character dossier pending richer source material.`,
    appearance_prompt:
      asString(o.appearance_prompt) ||
      `Consistent identity for ${display_name.value}; lock facial structure, hair, and signature wardrobe.`,
    media_assets,
    appearance_ref_ids,
    ...(appearance_primary_ref ? { appearance_primary_ref } : {}),
    ...(appearance_image_urls.length ? { appearance_image_urls } : {}),
    asset_count:
      typeof o.asset_count === 'number' && Number.isFinite(o.asset_count)
        ? o.asset_count
        : fallback.assetCount,
    ...(asString(o.voice_id) ? { voice_id: asString(o.voice_id) } : {}),
  };

  for (const key of STRING_FIELDS) {
    if (key === 'display_name') continue;
    const v = normalizeProvenancedString(o[key]);
    if (v) (pack as Record<string, unknown>)[key] = v;
  }
  for (const key of ARRAY_FIELDS) {
    const v = normalizeProvenancedStringArray(o[key]);
    if (v) (pack as Record<string, unknown>)[key] = v;
  }

  if (fallback.previous) {
    pack = mergeCharacterPackSummary(fallback.previous, pack);
  }

  // 兼容旧注入字段
  pack.description = pack.character_brief;
  if (!pack.appearance_image_urls?.length && fallback.previous?.appearance_image_urls?.length) {
    // urls already merged via merge if previous won — skip
  }

  return pack;
}

/** 再解析合并：user > extracted > inferred；voice_id / refs 以新解析为主，但 user 字段保留 */
export function mergeCharacterPackSummary(
  prev: CharacterPackSummary,
  next: CharacterPackSummary
): CharacterPackSummary {
  const out: CharacterPackSummary = {
    ...next,
    display_name: mergeProvenancedString(prev.display_name, next.display_name) ?? next.display_name,
  };

  for (const key of STRING_FIELDS) {
    if (key === 'display_name') continue;
    const merged = mergeProvenancedString(
      prev[key] as Provenanced<string> | undefined,
      next[key] as Provenanced<string> | undefined
    );
    if (merged) (out as Record<string, unknown>)[key] = merged;
  }
  for (const key of ARRAY_FIELDS) {
    const merged = mergeProvenancedStringArray(
      prev[key] as Provenanced<string[]> | undefined,
      next[key] as Provenanced<string[]> | undefined
    );
    if (merged) (out as Record<string, unknown>)[key] = merged;
  }

  // user 锁定的 brief/prompt：若 prev 无独立标记，仅当字段级 user 很多时保留 next 生成的 brief
  // brief/appearance_prompt 始终用 next（由合并后字段再生更理想；此处先用 next，避免陈旧）
  out.character_brief = next.character_brief;
  out.appearance_prompt = next.appearance_prompt;
  out.description = out.character_brief;

  if (prev.voice_id && !next.voice_id) out.voice_id = prev.voice_id;

  return out;
}

export function applyUserCharacterFieldPatch(
  pack: CharacterPackSummary,
  patch: Record<string, unknown>
): CharacterPackSummary {
  const next = { ...pack };
  for (const key of STRING_FIELDS) {
    if (!(key in patch)) continue;
    const v = asString(patch[key]);
    if (v == null) continue;
    (next as Record<string, unknown>)[key] = {
      value: v,
      provenance: 'user' as const,
    };
  }
  for (const key of ARRAY_FIELDS) {
    if (!(key in patch)) continue;
    const v = asStringArray(patch[key], 24);
    if (!v) continue;
    (next as Record<string, unknown>)[key] = {
      value: v,
      provenance: 'user' as const,
    };
  }
  if (typeof patch.character_brief === 'string' && patch.character_brief.trim()) {
    next.character_brief = patch.character_brief.trim();
    next.description = next.character_brief;
  }
  if (typeof patch.appearance_prompt === 'string' && patch.appearance_prompt.trim()) {
    next.appearance_prompt = patch.appearance_prompt.trim();
  }
  return next;
}

export function isCharacterPackSummary(raw: unknown): raw is CharacterPackSummary {
  return (
    !!raw &&
    typeof raw === 'object' &&
    !Array.isArray(raw) &&
    (raw as CharacterPackSummary).schema_version === 1 &&
    !!(raw as CharacterPackSummary).display_name
  );
}
