/**
 * 平台文风库：catalog 轻量列表 + packs/<category> 按需加载。
 * 模型侧只注入用户选中的一条 voice，禁止把整库拼进 skill / unifiedTemplate。
 */
import catalogJson from './catalog.json';

export type I18nText = { zh: string; 'zh-TW': string; en: string; ja: string };

export type VoiceCraft = {
  sentence: string;
  stance: string;
  opening: string;
  avoid: string;
  lexicon: string;
};

/** 谈话资料等品类的扩展本地详参（随 voice 注入，不进 catalog） */
export type TalkPack = {
  format: string;
  dossier_goal: string;
  dossier_sections: string[];
  host_moves: string[];
  tension_style: string;
  sample_beats: string[];
  guest_prompt_patterns: string[];
};

export type VoiceCatalogEntry = {
  id: string;
  voice_category: string;
  language: string;
  region: string;
  label: I18nText;
  uiAuthorHint?: I18nText;
  blurb: I18nText;
  /** 写作工艺提示（给选题提炼合同，不直接当检索词） */
  topic_hints?: string[];
  /**
   * 检索题材类型角（给 web search）：描述「这类风格通常需要什么题材」，
   * 禁止节目名/作者名/硬编码梗；可空，空则仅按类别检索。
   */
  search_angles?: string[];
};

export type VoiceCategory = {
  id: string;
  label: I18nText;
  blurb: I18nText;
  packFile: string | null;
  legacySeek?: boolean;
  topic_hints?: string[];
};

export type VoicePackEntry = {
  id: string;
  craft: VoiceCraft;
  talkPack?: TalkPack;
  referenceParagraph: I18nText;
  /** 其他品类可扩展：fictionPack / reportPack … */
  [k: string]: unknown;
};

type CatalogFile = {
  schemaVersion: number;
  kind: string;
  languages: Array<{ id: string; region: string; label: I18nText }>;
  categories: VoiceCategory[];
  voices: VoiceCatalogEntry[];
};

type PackFile = {
  schemaVersion: number;
  kind: string;
  voice_category: string;
  voices: VoicePackEntry[];
};

const catalog = catalogJson as CatalogFile;

const categoryById = new Map(catalog.categories.map((c) => [c.id, c]));
const catalogVoiceById = new Map(catalog.voices.map((v) => [v.id, v]));

/** pack 缓存：按 category 只加载一次 */
const packCache = new Map<string, PackFile>();
const packVoiceById = new Map<string, VoicePackEntry>();

const packLoaders: Record<string, () => Promise<{ default: PackFile }>> = {
  talk_brief: () => import('./packs/talk_brief.json'),
  literary_column: () => import('./packs/literary_column.json'),
  fanqie_web: () => import('./packs/fanqie_web.json'),
  hongguo_drama: () => import('./packs/hongguo_drama.json'),
  finance_narrative: () => import('./packs/finance_narrative.json'),
  political_report: () => import('./packs/political_report.json'),
  self_media: () => import('./packs/self_media.json'),
  voiceover_brief: () => import('./packs/voiceover_brief.json'),
  course_tutorial: () => import('./packs/course_tutorial.json'),
};

export function pickI18n(map: I18nText | undefined, lang?: string): string {
  const l = String(lang || 'zh').trim();
  if (!map) return '';
  if (l === 'zh-TW' || l === 'zh_tw') return map['zh-TW'] || map.zh || map.en;
  if (l === 'en') return map.en || map.zh;
  if (l === 'ja') return map.ja || map.en || map.zh;
  return map.zh || map.en;
}

export function listVoiceLanguages(): CatalogFile['languages'] {
  return catalog.languages.slice();
}

export function listVoiceCategories(): VoiceCategory[] {
  return catalog.categories.slice();
}

export function getVoiceCategory(id: string): VoiceCategory | undefined {
  return categoryById.get(String(id || '').trim());
}

/** UI：某语言 + 类别下的风格列表（仅 catalog，无 craft） */
export function listCatalogVoices(opts?: {
  language?: string;
  voiceCategory?: string;
}): VoiceCatalogEntry[] {
  const lang = opts?.language?.trim();
  const cat = opts?.voiceCategory?.trim();
  return catalog.voices.filter((v) => {
    if (cat && v.voice_category !== cat) return false;
    if (!lang) return true;
    // 各语言环境独立叶子，不再用简中回退繁中
    return v.language === lang;
  });
}

export function getCatalogVoice(id: string): VoiceCatalogEntry | undefined {
  return catalogVoiceById.get(String(id || '').trim());
}

/**
 * 话题推荐 hints：类别级 ∪ 已选风格级（仍只读 catalog，不加载 pack）
 */
export function getTopicHints(opts: {
  voiceCategory: string;
  voiceId?: string | null;
}): string[] {
  const cat = getVoiceCategory(opts.voiceCategory);
  const fromCat = cat?.topic_hints ?? [];
  const vid = String(opts.voiceId || '').trim();
  if (!vid) return fromCat.slice();
  const voice = getCatalogVoice(vid);
  const fromVoice = voice?.topic_hints ?? [];
  // 风格 hints 优先，类别补足
  const seen = new Set<string>();
  const out: string[] = [];
  for (const h of [...fromVoice, ...fromCat]) {
    const t = h.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

const META_SEARCH_HINT_RE =
  /题材跟检索|Topics follow trending|跟检索热[门议]|follow trending hits/i;

/**
 * 检索用题材类型角：优先 voice.search_angles；否则从 topic_hints 过滤 meta/纯工艺后降级使用。
 * 不含节目名（专名在 label/uiAuthorHint）。
 */
export function getSearchAngles(opts: {
  voiceCategory: string;
  voiceId?: string | null;
}): string[] {
  const vid = String(opts.voiceId || '').trim();
  const voice = vid ? getCatalogVoice(vid) : undefined;
  const fromVoice = (voice?.search_angles ?? [])
    .map((s) => String(s ?? '').trim())
    .filter(Boolean);
  if (fromVoice.length > 0) return [...new Set(fromVoice)].slice(0, 4);

  // 降级：hints 里去掉 meta 与明显工艺口号，避免当检索词硬丢
  const hints = getTopicHints(opts);
  const usable = hints.filter((h) => {
    if (META_SEARCH_HINT_RE.test(h)) return false;
    if (/^(意象|场景钩|专栏标题|开口|可播|停顿|节拍|一课一概念)/.test(h)) return false;
    if (/可展开$|向切入$|钩子$|清单角$|资料角度$/.test(h) && h.length <= 12) return false;
    return true;
  });
  return [...new Set(usable)].slice(0, 4);
}

async function loadPack(packFile: string): Promise<PackFile> {
  const cached = packCache.get(packFile);
  if (cached) return cached;
  const loader = packLoaders[packFile];
  if (!loader) {
    throw new Error(`writing-voice-presets: 未注册 pack「${packFile}」`);
  }
  const mod = await loader();
  const pack = mod.default as PackFile;
  packCache.set(packFile, pack);
  for (const v of pack.voices) {
    packVoiceById.set(v.id, v);
  }
  return pack;
}

/** 确保某类别 pack 已加载（选中类别后可预取，仍不注入模型） */
export async function ensureVoiceCategoryPack(voiceCategory: string): Promise<void> {
  const cat = getVoiceCategory(voiceCategory);
  if (!cat?.packFile) return;
  await loadPack(cat.packFile);
}

export type VoiceModelPayload = {
  voice_id: string;
  voice_category: string;
  blurb: string;
  craft: VoiceCraft;
  reference_paragraph: string;
  /** 品类扩展块（谈话 / 网文 / 报道 / 自媒体…）；仅含选中风格的那一份 */
  talk_pack?: TalkPack;
  fiction_pack?: Record<string, unknown>;
  report_pack?: Record<string, unknown>;
  media_pack?: Record<string, unknown>;
};

/**
 * 仅解析并返回用户选中的一条风格（异步拉 pack）。
 * 供 enrich/output 动态注入；禁止一次 resolve 多个「备用」风格进同一 prompt。
 */
export async function resolveVoiceForModelAsync(
  voiceId: string,
  lang?: string
): Promise<VoiceModelPayload | null> {
  const id = String(voiceId || '').trim();
  if (!id) return null;
  const meta = getCatalogVoice(id);
  if (!meta) return null;
  const cat = getVoiceCategory(meta.voice_category);
  if (!cat?.packFile) {
    return null;
  }
  await loadPack(cat.packFile);
  const full = packVoiceById.get(id);
  if (!full?.craft) return null;
  const payload: VoiceModelPayload = {
    voice_id: id,
    voice_category: meta.voice_category,
    blurb: pickI18n(meta.blurb, lang),
    craft: { ...full.craft },
    reference_paragraph: pickI18n(full.referenceParagraph, lang),
  };
  if (full.talkPack) payload.talk_pack = { ...full.talkPack };
  if (full.fictionPack && typeof full.fictionPack === 'object') {
    payload.fiction_pack = { ...(full.fictionPack as Record<string, unknown>) };
  }
  if (full.reportPack && typeof full.reportPack === 'object') {
    payload.report_pack = { ...(full.reportPack as Record<string, unknown>) };
  }
  if (full.mediaPack && typeof full.mediaPack === 'object') {
    payload.media_pack = { ...(full.mediaPack as Record<string, unknown>) };
  }
  return payload;
}

/**
 * 把单条 voice 打成可嵌入合同/提示词的短块（仍不含 UI 人名/节目名）。
 */
export function formatVoiceInjection(payload: VoiceModelPayload): string {
  const c = payload.craft;
  const lines = [
    `【文风工艺 voice_id=${payload.voice_id}】`,
    `- 句式：${c.sentence}`,
    `- 立场：${c.stance}`,
    `- 开口：${c.opening}`,
    `- 禁止：${c.avoid}`,
    `- 用语：${c.lexicon}`,
    `- 中性说明：${payload.blurb}`,
    `- 自拟示范：${payload.reference_paragraph}`,
  ];
  const tp = payload.talk_pack;
  if (tp) {
    lines.push(`【谈话资料形态 format=${tp.format}】`);
    lines.push(`- 目标：${tp.dossier_goal}`);
    lines.push(`- 张力：${tp.tension_style}`);
    lines.push(`- 资料稿板块：${tp.dossier_sections.join('；')}`);
    lines.push(`- 主持推进：${tp.host_moves.join('；')}`);
    lines.push(`- 节拍：${tp.sample_beats.join('；')}`);
    lines.push(`- 嘉宾题型：${tp.guest_prompt_patterns.join('；')}`);
  }
  if (payload.fiction_pack) {
    lines.push(`【叙事节拍】${JSON.stringify(payload.fiction_pack)}`);
  }
  if (payload.report_pack) {
    lines.push(`【报道约束】${JSON.stringify(payload.report_pack)}`);
  }
  if (payload.media_pack) {
    lines.push(`【媒介形态】${JSON.stringify(payload.media_pack)}`);
  }
  return lines.join('\n');
}

/** 话题写作：不选内置风格，改用知识库语感文风卡 */
export const KB_WRITING_VOICE_ID = 'kb_writing';

export function isKbWritingVoiceId(id: string | null | undefined): boolean {
  return String(id || '').trim() === KB_WRITING_VOICE_ID;
}

/** 合同统一 key（topic-article / 后续写作宿主共用） */
export const TOPIC_ARTICLE_CONTRACT_KEYS = [
  'language',
  'voice_category',
  'voice_id',
  'writing_folder_id',
  'topic',
  'topic_source',
  'purpose',
  'article_length',
  'structure_id',
  'outline',
  'supplement',
] as const;

/** 同步读取已缓存的 pack 条目（须先 ensure / resolve async） */
export function getCachedPackVoice(voiceId: string): VoicePackEntry | undefined {
  return packVoiceById.get(String(voiceId || '').trim());
}
