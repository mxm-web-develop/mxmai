import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { readStoredLanguagePreference } from '../lib/clientPreferences';
import { zhTranslation } from './locales/zh';
import { zhTWTranslation } from './locales/zh-TW';
import { enTranslation } from './locales/en';
import { jaTranslation } from './locales/ja';

const resources = {
  zh: { translation: zhTranslation },
  'zh-TW': { translation: zhTWTranslation },
  en: { translation: enTranslation },
  ja: { translation: jaTranslation },
};

void i18n.use(initReactI18next).init({
  resources,
  lng: readStoredLanguagePreference() ?? 'en',
  fallbackLng: {
    'zh-TW': ['zh', 'en'],
    ja: ['en', 'zh'],
    zh: ['zh', 'en'],
    en: ['en', 'zh'],
    default: ['zh'],
  },
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
