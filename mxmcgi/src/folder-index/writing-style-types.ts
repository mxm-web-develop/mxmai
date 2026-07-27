/**
 * 语感文风卡（card_tag=writing）单篇 / 整包对象
 * @see docs/mxmcgi/virtual-folder-writing-style-pack.md
 */

export type WritingLexicon = {
  favored?: string[];
  avoid?: string[];
  catchphrases?: string[];
};

export type WritingStructure = {
  opening?: string;
  progression?: string;
  headings?: string;
  closing?: string;
  outline_pattern?: string;
};

export type WritingStyleObj = {
  schema_version: 1;
  confidence: number;
  source: 'text';
  /** 文体：评论 / 叙事 / 教程 / 公号体 / 口播稿… */
  genre?: string;
  /** 2～4 句可注入 brief（下游主用） */
  voice_summary?: string;
  tone?: string[];
  /** 正式度 / 语域 */
  register?: string;
  person_pov?: string;
  rhythm?: string;
  sentence_craft?: string;
  rhetoric?: string[];
  lexicon?: WritingLexicon;
  structure?: WritingStructure;
  pacing?: string;
  audience_stance?: string;
  avoid?: string[];
  /** 1～3 English tokens: tone / structure / rhythm / lexicon / rhetoric / pov / register */
  feature_tags?: string[];
  /** 索引侧附加 */
  title?: string;
  ref_type?: 'task' | 'storage_object';
  ref_id?: string;
  fit_score?: number;
};

export type WritingStyleExemplar = {
  ref_key: string;
  fit_score: number;
  feature_tags: string[];
  title?: string;
};

export type WritingStylePackSummary = {
  schema_version: 1;
  /** 整包语感 brief（主注入文案） */
  voice_summary: string;
  tone?: string[];
  register?: string;
  genre_tags?: string[];
  structure_bias?: string;
  lexicon_rules?: string;
  rhythm_feel?: string;
  person_pov?: string;
  rhetoric_bias?: string[];
  avoid?: string[];
  variants?: string[];
  exemplars?: WritingStyleExemplar[];
  exemplar_ref_ids: string[];
  frame_count: number;
  coverage?: Record<string, number>;
};

export const WRITING_FEATURE_TAGS_MAX = 3;
export const WRITING_EXEMPLARS_MAX = 5;

const FEATURE_CANON = new Set([
  'tone',
  'structure',
  'rhythm',
  'lexicon',
  'rhetoric',
  'pov',
  'register',
  'pacing',
  'opening',
  'closing',
  'voice',
]);

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function asStringArray(v: unknown, max = 24): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((s) => s.trim());
  return out.length ? out.slice(0, max) : undefined;
}

export function normalizeWritingFeatureTags(
  v: unknown,
  max = WRITING_FEATURE_TAGS_MAX
): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    if (typeof x !== 'string') continue;
    const t = x.trim().toLowerCase().slice(0, 16);
    if (!t || out.includes(t)) continue;
    out.push(FEATURE_CANON.has(t) ? t : t);
    if (out.length >= max) break;
  }
  return out;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function normalizeLexicon(raw: unknown): WritingLexicon | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const favored = asStringArray(o.favored, 16);
  const avoid = asStringArray(o.avoid, 16);
  const catchphrases = asStringArray(o.catchphrases, 12);
  if (!favored && !avoid && !catchphrases) return undefined;
  return {
    ...(favored ? { favored } : {}),
    ...(avoid ? { avoid } : {}),
    ...(catchphrases ? { catchphrases } : {}),
  };
}

function normalizeStructure(raw: unknown): WritingStructure | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const out: WritingStructure = {
    ...(asString(o.opening) ? { opening: asString(o.opening) } : {}),
    ...(asString(o.progression) ? { progression: asString(o.progression) } : {}),
    ...(asString(o.headings) ? { headings: asString(o.headings) } : {}),
    ...(asString(o.closing) ? { closing: asString(o.closing) } : {}),
    ...(asString(o.outline_pattern) ? { outline_pattern: asString(o.outline_pattern) } : {}),
  };
  return Object.keys(out).length ? out : undefined;
}

export function normalizeWritingStyleExemplar(raw: unknown): WritingStyleExemplar | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const ref_key = asString(o.ref_key) || asString(o.refKey);
  if (!ref_key) return null;
  const scoreRaw = o.fit_score ?? o.fitScore;
  const fit_score =
    typeof scoreRaw === 'number' && Number.isFinite(scoreRaw) ? clamp01(scoreRaw) : 0.5;
  return {
    ref_key,
    fit_score,
    feature_tags: normalizeWritingFeatureTags(o.feature_tags ?? o.featureTags),
    ...(asString(o.title) ? { title: asString(o.title) } : {}),
  };
}

export function buildWritingExemplars(input: {
  frames: WritingStyleObj[];
  packExemplars?: unknown;
  packExemplarRefIds?: string[];
  max?: number;
}): WritingStyleExemplar[] {
  const max = input.max ?? WRITING_EXEMPLARS_MAX;
  const frameByKey = new Map<string, WritingStyleObj>();
  for (const f of input.frames) {
    if (f.ref_type && f.ref_id) {
      frameByKey.set(`${f.ref_type}:${f.ref_id}`, f);
    }
  }

  const fromPack = Array.isArray(input.packExemplars)
    ? input.packExemplars
        .map(normalizeWritingStyleExemplar)
        .filter((e): e is WritingStyleExemplar => !!e)
    : [];

  let candidates: WritingStyleExemplar[] = fromPack.map((e) => {
    const frame = frameByKey.get(e.ref_key);
    const tags =
      e.feature_tags.length > 0
        ? e.feature_tags
        : normalizeWritingFeatureTags(frame?.feature_tags);
    return {
      ref_key: e.ref_key,
      fit_score: e.fit_score,
      feature_tags: tags,
      ...(e.title || frame?.title ? { title: e.title || frame?.title } : {}),
    };
  });

  if (candidates.length === 0) {
    const refIds = (input.packExemplarRefIds ?? []).filter(Boolean);
    if (refIds.length > 0) {
      candidates = refIds.map((ref_key, i) => {
        const frame = frameByKey.get(ref_key);
        return {
          ref_key,
          fit_score:
            typeof frame?.fit_score === 'number'
              ? clamp01(frame.fit_score)
              : clamp01((frame?.confidence ?? 0.5) - i * 0.01),
          feature_tags: normalizeWritingFeatureTags(frame?.feature_tags),
          ...(frame?.title ? { title: frame.title } : {}),
        };
      });
    }
  }

  if (candidates.length === 0) {
    candidates = input.frames
      .filter((f) => f.ref_type && f.ref_id)
      .map((f) => ({
        ref_key: `${f.ref_type}:${f.ref_id}`,
        fit_score:
          typeof f.fit_score === 'number' ? clamp01(f.fit_score) : clamp01(f.confidence),
        feature_tags: normalizeWritingFeatureTags(f.feature_tags),
        ...(f.title ? { title: f.title } : {}),
      }));
  }

  const seen = new Set<string>();
  return [...candidates]
    .filter((e) => {
      if (seen.has(e.ref_key)) return false;
      seen.add(e.ref_key);
      return true;
    })
    .sort((a, b) => b.fit_score - a.fit_score)
    .slice(0, max);
}

export function normalizeWritingStyleObj(
  raw: unknown,
  fallback: { title?: string }
): WritingStyleObj {
  const o =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const confRaw = o.confidence;
  const confidence =
    typeof confRaw === 'number' && Number.isFinite(confRaw)
      ? Math.min(1, Math.max(0, confRaw))
      : 0.5;
  const lexicon = normalizeLexicon(o.lexicon);
  const structure = normalizeStructure(o.structure);
  const feature_tags = normalizeWritingFeatureTags(o.feature_tags);
  const voice_summary =
    asString(o.voice_summary) ||
    asString(o.aesthetic_summary) ||
    (fallback.title ? fallback.title : undefined);

  return {
    schema_version: 1,
    confidence,
    source: 'text',
    ...(asString(o.genre) ? { genre: asString(o.genre) } : {}),
    ...(voice_summary ? { voice_summary } : {}),
    ...(asStringArray(o.tone) ? { tone: asStringArray(o.tone) } : {}),
    ...(asString(o.register) ? { register: asString(o.register) } : {}),
    ...(asString(o.person_pov) ? { person_pov: asString(o.person_pov) } : {}),
    ...(asString(o.rhythm) ? { rhythm: asString(o.rhythm) } : {}),
    ...(asString(o.sentence_craft) ? { sentence_craft: asString(o.sentence_craft) } : {}),
    ...(asStringArray(o.rhetoric) ? { rhetoric: asStringArray(o.rhetoric) } : {}),
    ...(lexicon ? { lexicon } : {}),
    ...(structure ? { structure } : {}),
    ...(asString(o.pacing) ? { pacing: asString(o.pacing) } : {}),
    ...(asString(o.audience_stance) ? { audience_stance: asString(o.audience_stance) } : {}),
    ...(asStringArray(o.avoid) ? { avoid: asStringArray(o.avoid) } : {}),
    ...(feature_tags.length ? { feature_tags } : {}),
  };
}

export function normalizeWritingStylePackSummary(
  raw: unknown,
  fallback: {
    frameCount: number;
    folderName: string;
    exemplarRefIds?: string[];
    frames?: WritingStyleObj[];
  }
): WritingStylePackSummary {
  const o =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const voice_summary =
    asString(o.voice_summary) ||
    asString(o.style_summary) ||
    fallback.folderName;

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

  const packExemplarRefIds = Array.isArray(o.exemplar_ref_ids)
    ? o.exemplar_ref_ids.filter((x): x is string => typeof x === 'string' && !!x.trim())
    : (fallback.exemplarRefIds ?? []);

  const exemplars = buildWritingExemplars({
    frames,
    packExemplars: o.exemplars,
    packExemplarRefIds,
  });
  const exemplar_ref_ids =
    exemplars.length > 0
      ? exemplars.map((e) => e.ref_key)
      : packExemplarRefIds.slice(0, WRITING_EXEMPLARS_MAX);

  return {
    schema_version: 1,
    voice_summary,
    ...(asStringArray(o.tone) ? { tone: asStringArray(o.tone) } : {}),
    ...(asString(o.register) ? { register: asString(o.register) } : {}),
    ...(asStringArray(o.genre_tags) ? { genre_tags: asStringArray(o.genre_tags) } : {}),
    ...(asString(o.structure_bias) ? { structure_bias: asString(o.structure_bias) } : {}),
    ...(asString(o.lexicon_rules) ? { lexicon_rules: asString(o.lexicon_rules) } : {}),
    ...(asString(o.rhythm_feel) ? { rhythm_feel: asString(o.rhythm_feel) } : {}),
    ...(asString(o.person_pov) ? { person_pov: asString(o.person_pov) } : {}),
    ...(asStringArray(o.rhetoric_bias) ? { rhetoric_bias: asStringArray(o.rhetoric_bias) } : {}),
    ...(asStringArray(o.avoid) ? { avoid: asStringArray(o.avoid) } : {}),
    ...(asStringArray(o.variants) ? { variants: asStringArray(o.variants) } : {}),
    exemplar_ref_ids,
    ...(exemplars.length ? { exemplars } : {}),
    frame_count:
      typeof o.frame_count === 'number' && Number.isFinite(o.frame_count)
        ? o.frame_count
        : fallback.frameCount,
    ...(o.coverage && typeof o.coverage === 'object' && !Array.isArray(o.coverage)
      ? { coverage: o.coverage as Record<string, number> }
      : {}),
  };
}

/** 检索 / 展示用短正文 */
export function writingStyleObjToSearchText(obj: WritingStyleObj, name?: string): string {
  return [
    name ? `[${name}]` : '',
    obj.voice_summary || '',
    obj.genre ? `文体: ${obj.genre}` : '',
    obj.tone?.length ? `语气: ${obj.tone.join(', ')}` : '',
    obj.register ? `语域: ${obj.register}` : '',
    obj.structure?.outline_pattern ? `结构: ${obj.structure.outline_pattern}` : '',
    obj.rhythm ? `节奏: ${obj.rhythm}` : '',
    obj.avoid?.length ? `避免: ${obj.avoid.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function isWritingStyleObj(raw: unknown): raw is WritingStyleObj {
  return (
    !!raw &&
    typeof raw === 'object' &&
    !Array.isArray(raw) &&
    (raw as WritingStyleObj).schema_version === 1 &&
    typeof (raw as WritingStyleObj).confidence === 'number' &&
    (raw as WritingStyleObj).source === 'text'
  );
}
