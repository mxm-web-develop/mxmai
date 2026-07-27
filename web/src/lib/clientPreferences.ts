import i18n from '../i18n/config';
import { fetchClientHints } from '../api/client';
import {
  type AppLocale,
  isAppLocale,
  resolveAppLocaleByCountry,
} from '../i18n/appLocale';

export type ThemeMode = 'light' | 'dark';
export type AppLanguage = AppLocale;

const THEME_STORAGE_KEY = 'mxm-theme';
const THEME_MANUAL_KEY = 'mxm-theme-manual';
const LANG_STORAGE_KEY = 'mxm-lang';
const LANG_MANUAL_KEY = 'mxm-lang-manual';

/** 本地 7:00–17:59 为亮色，其余为暗色 */
export function resolveThemeByLocalHour(hour: number): ThemeMode {
  return hour >= 7 && hour < 18 ? 'light' : 'dark';
}

export function resolveThemeByLocalTime(date = new Date()): ThemeMode {
  return resolveThemeByLocalHour(date.getHours());
}

/** 中国大陆 → 简中；台港澳 → 繁中；日本 → 日语；其余 → 英文 */
export function resolveLanguageByCountry(
  countryCode: string | null | undefined
): AppLanguage {
  return resolveAppLocaleByCountry(countryCode);
}

export function hasManualThemePreference(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(THEME_MANUAL_KEY) === '1';
}

export function hasManualLanguagePreference(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(LANG_MANUAL_KEY) === '1';
}

export function readStoredThemePreference(): ThemeMode | null {
  if (typeof window === 'undefined' || !hasManualThemePreference()) return null;
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null;
  return stored === 'light' || stored === 'dark' ? stored : null;
}

export function readStoredLanguagePreference(): AppLanguage | null {
  if (typeof window === 'undefined' || !hasManualLanguagePreference()) return null;
  const stored = window.localStorage.getItem(LANG_STORAGE_KEY);
  return isAppLocale(stored) ? stored : null;
}

export function readThemePreference(): ThemeMode {
  return readStoredThemePreference() ?? resolveThemeByLocalTime();
}

export function readLanguagePreference(): AppLanguage {
  return readStoredLanguagePreference() ?? 'en';
}

export function persistThemePreference(mode: ThemeMode): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  window.localStorage.setItem(THEME_MANUAL_KEY, '1');
}

export function persistLanguagePreference(lang: AppLanguage): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LANG_STORAGE_KEY, lang);
  window.localStorage.setItem(LANG_MANUAL_KEY, '1');
}

export function applyHtmlThemeClass(isDark: boolean): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (isDark) {
    root.classList.add('dark');
    root.classList.remove('light');
  } else {
    root.classList.remove('dark');
    root.classList.add('light');
  }
}

/** 首屏启动：无手动语言偏好时按 IP 推断 */
export async function bootstrapClientPreferences(): Promise<void> {
  applyHtmlThemeClass(readThemePreference() === 'dark');

  if (hasManualLanguagePreference()) return;

  try {
    const hints = await fetchClientHints();
    const lang = resolveLanguageByCountry(hints.countryCode);
    await i18n.changeLanguage(lang);
  } catch {
    await i18n.changeLanguage(resolveLanguageByCountry(null));
  }
}
