/**
 * 话题写作文风 UI：按 language + voice_category 过滤（与 mxmcgi catalog 同步）
 */
import type { AppLocale } from '../i18n/appLocale';
import data from './writingVoicePresets.json';

export type WritingVoiceLang = 'zh' | 'zh-TW' | 'en' | 'ja';

export type WritingVoiceRow = {
  id: string;
  voice_category: string;
  language: string;
  region?: string;
  label: Record<string, string>;
  uiAuthorHint?: Record<string, string>;
  blurb?: Record<string, string>;
};

type WritingCategoryRow = {
  id: string;
  label: Record<string, string>;
  blurb?: Record<string, string>;
};

const voices = data.voices as WritingVoiceRow[];
const categories = (data.categories || []) as WritingCategoryRow[];
const voiceById = new Map(voices.map((v) => [v.id, v]));
const categoryById = new Map(categories.map((c) => [c.id, c]));

function pickLabel(map: Record<string, string> | undefined, locale: AppLocale): string {
  if (!map) return '';
  if (locale === 'zh-TW') return map['zh-TW'] || map.zh || map.en || '';
  if (locale === 'en') return map.en || map.zh || '';
  if (locale === 'ja') return map.ja || map.en || map.zh || '';
  return map.zh || map.en || '';
}

/** App / 合同 language → 过滤用语言码 */
export function normalizeWritingVoiceLang(raw?: string | null): WritingVoiceLang {
  const l = String(raw || 'zh').trim();
  if (l === 'zh-TW' || l === 'zh_tw') return 'zh-TW';
  if (l === 'en') return 'en';
  if (l === 'ja') return 'ja';
  return 'zh';
}

export function defaultWritingVoiceLang(locale: AppLocale): WritingVoiceLang {
  if (locale === 'zh-TW') return 'zh-TW';
  if (locale === 'en') return 'en';
  if (locale === 'ja') return 'ja';
  return 'zh';
}

function voiceMatchesLang(v: WritingVoiceRow, lang: WritingVoiceLang): boolean {
  // 各语言环境独立叶子（繁中不再回退简中番茄/红果等）
  return v.language === lang;
}

/** 类别方向：全语言完整列表（不按语言裁剪） */
export function listWritingCategories(): WritingCategoryRow[] {
  if (categories.length > 0) return categories;
  const ids = [...new Set(voices.map((v) => v.voice_category))];
  return ids.map((id) => categoryById.get(id) || { id, label: { zh: id } });
}

export function writingCategoryEnum(opts?: { locale?: AppLocale }): {
  enum: string[];
  labels: string[];
} {
  const locale = opts?.locale || 'zh';
  const rows = listWritingCategories();
  return {
    enum: rows.map((c) => c.id),
    labels: rows.map((c) => pickLabel(c.label, locale) || c.id),
  };
}

/** @deprecated 类别不再按语言过滤；保留别名以免旧引用报错 */
export function listWritingCategoriesForLang(_language?: string | null): WritingCategoryRow[] {
  return listWritingCategories();
}

export function writingCategoryEnumForLang(opts: {
  language?: string | null;
  locale?: AppLocale;
}): { enum: string[]; labels: string[] } {
  return writingCategoryEnum({ locale: opts.locale });
}

/** 按类别 + 语言过滤系统风格（类别必填，否则空列表） */
export function listWritingVoicesForFilter(opts: {
  voiceCategory?: string | null;
  language?: string | null;
}): WritingVoiceRow[] {
  const cat = String(opts.voiceCategory || '').trim();
  if (!cat) return [];
  const lang = normalizeWritingVoiceLang(opts.language);
  return voices.filter((v) => v.voice_category === cat && voiceMatchesLang(v, lang));
}

/** chip 展示：风格名（参考助记）；助记与名称相同时不重复括号 */
export function writingVoiceChipLabel(id: string, locale: AppLocale = 'zh'): string {
  const row = voiceById.get(String(id || '').trim());
  if (!row) return id;
  const name = pickLabel(row.label, locale) || id;
  const hint = pickLabel(row.uiAuthorHint, locale).replace(/^参考[：:]/, '').trim();
  if (!hint || hint === name) return name;
  return `${name}（${hint}）`;
}

/** 成稿语言 → 展示用 locale（风格 chip 跟写作语言走，不跟 App 设置） */
export function labelLocaleForWritingLang(language?: string | null): AppLocale {
  return normalizeWritingVoiceLang(language);
}

export function writingVoiceEnumForFilter(opts: {
  voiceCategory?: string | null;
  language?: string | null;
  locale?: AppLocale;
}): { enum: string[]; labels: string[] } {
  // 优先按成稿语言展示风格名/平台助记；locale 仅作缺省
  const labelLocale = labelLocaleForWritingLang(opts.language) || opts.locale || 'zh';
  const rows = listWritingVoicesForFilter(opts);
  return {
    enum: rows.map((v) => v.id),
    labels: rows.map((v) => writingVoiceChipLabel(v.id, labelLocale)),
  };
}

export const KB_WRITING_VOICE_ID = 'kb_writing';

export function isKbWritingVoiceId(id: string | null | undefined): boolean {
  return String(id || '').trim() === KB_WRITING_VOICE_ID;
}

/** 话题写作系统风格字段（非 MiniMax 音色） */
export function isTopicArticleVoiceIdField(field: {
  name: string;
  enum?: string[];
  'x-ui-type'?: string;
}): boolean {
  if (field.name !== 'voice_id') return false;
  if (field['x-ui-type'] === 'minimaxVoice') return false;
  const ids = field.enum ?? [];
  if (ids.length === 0) return false;
  return ids.some((id) => voiceById.has(String(id)) || isKbWritingVoiceId(id));
}

export function isTopicArticleVoiceCategoryField(name: string): boolean {
  return name === 'voice_category';
}

export function looksLikeWritingVoiceId(id: string): boolean {
  return voiceById.has(String(id || '').trim());
}
