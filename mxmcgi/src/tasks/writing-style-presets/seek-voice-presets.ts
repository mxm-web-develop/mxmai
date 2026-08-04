/**
 * seek 文风预设：UI 可用带「××式」的 label；提交模型只用无姓名的 craft + 自拟参考段。
 */
import presetsJson from './seek-voice-presets.json';

export type I18nText = { zh: string; 'zh-TW': string; en: string; ja: string };

export type SeekVoiceCraft = {
  sentence: string;
  stance: string;
  opening: string;
  avoid: string;
  lexicon: string;
};

export type SeekVoicePreset = {
  id: string;
  region: string;
  label: I18nText;
  blurb: I18nText;
  craft: SeekVoiceCraft;
  referenceParagraph: I18nText;
};

export type SeekGenrePreset = {
  id: string;
  label: I18nText;
  /** UI / 模型侧补充：文体骨架说明 */
  blurb?: I18nText;
};

export type SeekVoicePresetsFile = {
  schemaVersion: number;
  kind: string;
  notes: string[];
  genres: SeekGenrePreset[];
  voices: SeekVoicePreset[];
};

const data = presetsJson as SeekVoicePresetsFile;

const voiceById = new Map(data.voices.map((v) => [v.id, v]));
const genreById = new Map(data.genres.map((g) => [g.id, g]));

export function listSeekVoicePresets(): SeekVoicePreset[] {
  return data.voices.slice();
}

export function listSeekGenrePresets(): SeekGenrePreset[] {
  return data.genres.slice();
}

export function getSeekVoicePreset(id: string): SeekVoicePreset | undefined {
  return voiceById.get(String(id || '').trim());
}

export function getSeekGenrePreset(id: string): SeekGenrePreset | undefined {
  return genreById.get(String(id || '').trim());
}

export function pickI18n(map: I18nText | undefined, lang?: string): string {
  const l = String(lang || 'zh').trim();
  if (!map) return '';
  if (l === 'zh-TW' || l === 'zh_tw') return map['zh-TW'] || map.zh || map.en;
  if (l === 'en') return map.en || map.zh;
  if (l === 'ja') return map.ja || map.en || map.zh;
  return map.zh || map.en;
}

/**
 * 提交给 LLM 的文风包：不含真实人名 / 「××式」展示名。
 * UI 仍可用 preset.label；模型侧只用 id + craft + 自拟参考段 + 中性 blurb。
 */
export function resolveVoiceForModel(
  id: string,
  lang?: string
): {
  voice_id: string;
  blurb: string;
  craft: SeekVoiceCraft;
  reference_paragraph: string;
} | null {
  const p = getSeekVoicePreset(id);
  if (!p) return null;
  return {
    voice_id: p.id,
    blurb: pickI18n(p.blurb, lang),
    craft: { ...p.craft },
    reference_paragraph: pickI18n(p.referenceParagraph, lang),
  };
}

/** UI 枚举：value=id，label 按语言 */
export function voiceEnumForLang(lang?: string): { enum: string[]; labels: string[] } {
  const enumIds: string[] = [];
  const labels: string[] = [];
  for (const v of data.voices) {
    enumIds.push(v.id);
    labels.push(pickI18n(v.label, lang));
  }
  return { enum: enumIds, labels };
}

export function genreEnumForLang(lang?: string): { enum: string[]; labels: string[] } {
  const enumIds: string[] = [];
  const labels: string[] = [];
  for (const g of data.genres) {
    enumIds.push(g.id);
    labels.push(pickI18n(g.label, lang));
  }
  return { enum: enumIds, labels };
}
