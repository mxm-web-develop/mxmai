/**
 * Web 端 AppLocale 镜像（与 @mxmai/mxmdata `src/i18n/app-locale.ts` 对齐）。
 * 避免把整包 mxmdata 拉进 Vite 浏览器包。
 */

export const SUPPORTED_APP_LOCALES = ['zh', 'zh-TW', 'en', 'ja'] as const;

export type AppLocale = (typeof SUPPORTED_APP_LOCALES)[number];

export const DEFAULT_APP_LOCALE: AppLocale = 'zh';

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
  if (s.startsWith('zh-')) return 'zh-TW';
  if (s === 'en' || s.startsWith('en-')) return 'en';
  if (s === 'ja' || s.startsWith('ja-')) return 'ja';

  return DEFAULT_APP_LOCALE;
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
 * 缺 `zh` 键时不得用 `en` 盖住中文 primary（历史包常只有 *.en）。
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

/** i18next language → AppLocale */
export function toAppLang(lng: string | undefined): AppLocale {
  return normalizeAppLocale(lng);
}

export const APP_LOCALE_LABELS: Record<AppLocale, string> = {
  zh: '简体',
  'zh-TW': '繁體',
  en: 'EN',
  ja: '日本語',
};
