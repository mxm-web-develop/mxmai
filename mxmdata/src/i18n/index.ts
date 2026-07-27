export {
  SUPPORTED_APP_LOCALES,
  DEFAULT_APP_LOCALE,
  isAppLocale,
  normalizeAppLocale,
  normalizeAppLocaleFromAcceptLanguage,
  toBcp47,
  resolveAppLocaleByCountry,
  getLocaleFallbackChain,
  pickLocalizedString,
  pickDisplayLocalizedString,
  localeOutputInstruction,
  appLocaleDisplayName,
} from './app-locale';
export type { AppLocale } from './app-locale';
