/**
 * seek 文风 / 文体 UI 标签（与 mxmcgi seek-voice-presets 同步；含 region 分组）
 */
import type { AppLocale } from '../i18n/appLocale';
import data from './seekVoicePresets.json';

export type SeekVoiceRegion = 'cn_mainland' | 'zh_gat' | 'ja' | 'en';

export type SeekVoiceLabelRow = {
  id: string;
  region?: string;
  label: Record<string, string>;
  blurb?: Record<string, string>;
};

export type SeekGenreLabelRow = {
  id: string;
  label: Record<string, string>;
  blurb?: Record<string, string>;
};

const voices = data.voices as SeekVoiceLabelRow[];
const genres = data.genres as SeekGenreLabelRow[];
const voiceById = new Map(voices.map((v) => [v.id, v]));

export const SEEK_VOICE_REGION_ORDER: SeekVoiceRegion[] = [
  'cn_mainland',
  'zh_gat',
  'ja',
  'en',
];

/** 分组 tab 文案：随 UI 语言变化；chip 标签用该组对应语言 */
const REGION_TAB_LABELS: Record<SeekVoiceRegion, Record<AppLocale, string>> = {
  cn_mainland: {
    zh: '简中文风',
    'zh-TW': '簡中文風',
    en: 'Mainland Chinese',
    ja: '中国大陸',
  },
  zh_gat: {
    zh: '港台文风',
    'zh-TW': '港台文風',
    en: 'HK / Taiwan',
    ja: '港澳台',
  },
  ja: {
    zh: '日语文风',
    'zh-TW': '日語文風',
    en: 'Japanese',
    ja: '日本語',
  },
  en: {
    zh: '英文文风',
    'zh-TW': '英文文風',
    en: 'English',
    ja: '英語',
  },
};

function pickLabel(map: Record<string, string> | undefined, locale: AppLocale): string {
  if (!map) return '';
  if (locale === 'zh-TW') return map['zh-TW'] || map.zh || map.en || '';
  if (locale === 'en') return map.en || map.zh || '';
  if (locale === 'ja') return map.ja || map.en || map.zh || '';
  return map.zh || map.en || '';
}

export function isSeekVoiceRegion(value: unknown): value is SeekVoiceRegion {
  return (
    typeof value === 'string' &&
    (SEEK_VOICE_REGION_ORDER as readonly string[]).includes(value)
  );
}

/** App / 系统语言 → 默认文风分组 */
export function defaultSeekVoiceRegion(locale: AppLocale): SeekVoiceRegion {
  if (locale === 'zh-TW') return 'zh_gat';
  if (locale === 'ja') return 'ja';
  if (locale === 'en') return 'en';
  return 'cn_mainland';
}

/** 该分组内 chip 使用的展示语言（与作者语言对齐，非 UI 语言） */
export function labelLocaleForSeekRegion(region: SeekVoiceRegion): AppLocale {
  if (region === 'zh_gat') return 'zh-TW';
  if (region === 'ja') return 'ja';
  if (region === 'en') return 'en';
  return 'zh';
}

export function seekVoiceRegionOf(id: string): SeekVoiceRegion {
  const r = voiceById.get(String(id || '').trim())?.region;
  return isSeekVoiceRegion(r) ? r : 'cn_mainland';
}

export function seekVoiceRegionTabLabel(region: SeekVoiceRegion, uiLocale: AppLocale): string {
  return REGION_TAB_LABELS[region][uiLocale] || REGION_TAB_LABELS[region].zh;
}

export function listSeekVoiceRegionsForUi(uiLocale: AppLocale): Array<{
  id: SeekVoiceRegion;
  label: string;
}> {
  return SEEK_VOICE_REGION_ORDER.map((id) => ({
    id,
    label: seekVoiceRegionTabLabel(id, uiLocale),
  }));
}

export function seekVoicesInRegion(region: SeekVoiceRegion): SeekVoiceLabelRow[] {
  return voices.filter((v) => seekVoiceRegionOf(v.id) === region);
}

/** 单条文风展示名：按所属分组语言（跨组已选回显也一致） */
export function seekVoiceDisplayLabel(id: string, fallbackLocale?: AppLocale): string {
  const row = voiceById.get(String(id || '').trim());
  if (!row) return id;
  const locale = labelLocaleForSeekRegion(seekVoiceRegionOf(id));
  return pickLabel(row.label, locale) || pickLabel(row.label, fallbackLocale || 'zh') || id;
}

/** 全量枚举（提交校验仍用全量 id）；labels 按各自分组语言 */
export function seekVoiceEnumForLocale(locale: AppLocale): { enum: string[]; labels: string[] } {
  return {
    enum: voices.map((v) => v.id),
    labels: voices.map((v) => seekVoiceDisplayLabel(v.id, locale)),
  };
}

/** 当前分组内的枚举 + 对应语言标签 */
export function seekVoiceEnumForRegion(region: SeekVoiceRegion): {
  enum: string[];
  labels: string[];
} {
  const rows = seekVoicesInRegion(region);
  const labelLocale = labelLocaleForSeekRegion(region);
  return {
    enum: rows.map((v) => v.id),
    labels: rows.map((v) => pickLabel(v.label, labelLocale) || v.id),
  };
}

/** 文体 chips：名称 — 说明（与先前对齐的 8 项） */
export function seekGenreEnumForLocale(locale: AppLocale): { enum: string[]; labels: string[] } {
  return {
    enum: genres.map((g) => g.id),
    labels: genres.map((g) => {
      const name = pickLabel(g.label, locale) || g.id;
      const brief = pickLabel(g.blurb, locale);
      return brief ? `${name} — ${brief}` : name;
    }),
  };
}

export function isSeekVoiceFieldName(name: string): boolean {
  return name === 'voice_ids' || name === 'voices' || name === 'style_ids';
}

export function isSeekGenreFieldName(name: string): boolean {
  return name === 'genre' || name === 'article_genre';
}
