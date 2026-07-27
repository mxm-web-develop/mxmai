/**
 * 产品层应用语言码（短码，与 i18next / DB / x-user-lang 对齐）
 * BCP-47 仅用于 Intl / antd / html lang，见 toBcp47。
 */

export const SUPPORTED_APP_LOCALES = ['zh', 'zh-TW', 'en', 'ja'] as const;

export type AppLocale = (typeof SUPPORTED_APP_LOCALES)[number];

export const DEFAULT_APP_LOCALE: AppLocale = 'zh';

/** 缺文案时的回退链（首项为自身） */
const FALLBACK_CHAINS: Record<AppLocale, readonly AppLocale[]> = {
  zh: ['zh', 'en'],
  'zh-TW': ['zh-TW', 'zh', 'en'],
  en: ['en', 'zh'],
  ja: ['ja', 'en', 'zh'],
};

export function isAppLocale(value: unknown): value is AppLocale {
  return (
    typeof value === 'string' &&
    (SUPPORTED_APP_LOCALES as readonly string[]).includes(value)
  );
}

/**
 * 将任意语言标记归一为 AppLocale。
 * 接受 en / en-US / zh / zh-CN / zh-TW / zh-Hant / ja / ja-JP 等；未知 → zh。
 */
export function normalizeAppLocale(raw: string | null | undefined): AppLocale {
  if (!raw || typeof raw !== 'string') return DEFAULT_APP_LOCALE;
  const s = raw.trim().toLowerCase().replace(/_/g, '-');
  if (!s) return DEFAULT_APP_LOCALE;

  if (s === 'zh-tw' || s.startsWith('zh-tw') || s === 'zh-hant' || s.startsWith('zh-hant')) {
    return 'zh-TW';
  }
  if (s === 'zh' || s === 'zh-cn' || s.startsWith('zh-hans') || s.startsWith('zh-cn')) {
    return 'zh';
  }
  // 其它 zh-*（如 zh-hk）按繁中处理
  if (s.startsWith('zh-')) {
    return 'zh-TW';
  }
  if (s === 'en' || s.startsWith('en-')) return 'en';
  if (s === 'ja' || s.startsWith('ja-')) return 'ja';

  return DEFAULT_APP_LOCALE;
}

/** Accept-Language 头：取第一个可识别的语言标签 */
export function normalizeAppLocaleFromAcceptLanguage(
  header: string | null | undefined
): AppLocale {
  if (!header || typeof header !== 'string') return DEFAULT_APP_LOCALE;
  const first = header.split(',')[0]?.trim().split(';')[0]?.trim();
  return normalizeAppLocale(first);
}

export function toBcp47(locale: AppLocale): string {
  switch (locale) {
    case 'zh':
      return 'zh-CN';
    case 'zh-TW':
      return 'zh-TW';
    case 'en':
      return 'en-US';
    case 'ja':
      return 'ja-JP';
    default:
      return 'zh-CN';
  }
}

/** 按国家/地区码推断 UI 语言（无手动偏好时） */
export function resolveAppLocaleByCountry(
  countryCode: string | null | undefined
): AppLocale {
  const cc = (countryCode || '').toUpperCase();
  if (cc === 'CN') return 'zh';
  if (cc === 'TW' || cc === 'HK' || cc === 'MO') return 'zh-TW';
  if (cc === 'JP') return 'ja';
  return 'en';
}

export function getLocaleFallbackChain(locale: AppLocale): readonly AppLocale[] {
  return FALLBACK_CHAINS[locale] ?? FALLBACK_CHAINS.zh;
}

/**
 * 从 locale → string 的 map 中按回退链取文案。
 * 空字符串视为缺失。
 * 注意：纯 map 场景；若另有「简体默认 primary」字段，请用 pickDisplayLocalizedString。
 */
export function pickLocalizedString(
  map: Record<string, string> | null | undefined,
  locale: AppLocale | string
): string | undefined {
  if (!map || typeof map !== 'object') return undefined;
  const appLocale = isAppLocale(locale) ? locale : normalizeAppLocale(locale);
  for (const key of getLocaleFallbackChain(appLocale)) {
    const v = map[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

/**
 * 业务显示名 / 描述：primary 为简体默认（taskLabel、description 等），map 为各语覆盖。
 * 缺 `zh` 键时不得用 `en` 盖住中文 primary。
 */
export function pickDisplayLocalizedString(
  primary: string | null | undefined,
  map: Record<string, string> | null | undefined,
  locale: AppLocale | string,
  fallback = ''
): string {
  const appLocale = isAppLocale(locale) ? locale : normalizeAppLocale(locale);
  const m = map && typeof map === 'object' ? map : undefined;
  const exact = m?.[appLocale]?.trim();
  if (exact) return exact;

  const primaryTrim = (primary || '').trim();
  const zhFromMap = m?.zh?.trim();
  const enFromMap = m?.en?.trim();

  switch (appLocale) {
    case 'zh':
      return primaryTrim || zhFromMap || enFromMap || fallback;
    case 'zh-TW':
      return zhFromMap || primaryTrim || enFromMap || fallback;
    case 'ja':
      return enFromMap || primaryTrim || zhFromMap || fallback;
    case 'en':
      return enFromMap || primaryTrim || zhFromMap || fallback;
    default:
      return primaryTrim || fallback;
  }
}

/** 生成内容 / Agent system 用的自然语言指令片段 */
export function localeOutputInstruction(locale: AppLocale): string {
  switch (locale) {
    case 'en':
      return 'Respond in English.';
    case 'zh-TW':
      return '請使用繁體中文回覆。';
    case 'ja':
      return '日本語で回答してください。';
    case 'zh':
    default:
      return '请使用简体中文回复。';
  }
}

/** 人类可读语言名（Admin / 调试） */
export function appLocaleDisplayName(locale: AppLocale, inLocale: AppLocale = 'zh'): string {
  const names: Record<AppLocale, Record<AppLocale, string>> = {
    zh: { zh: '简体中文', 'zh-TW': '簡體中文', en: 'Simplified Chinese', ja: '簡体字中国語' },
    'zh-TW': { zh: '繁体中文', 'zh-TW': '繁體中文', en: 'Traditional Chinese', ja: '繁体字中国語' },
    en: { zh: '英语', 'zh-TW': '英語', en: 'English', ja: '英語' },
    ja: { zh: '日语', 'zh-TW': '日語', en: 'Japanese', ja: '日本語' },
  };
  return names[locale][inLocale] ?? locale;
}
