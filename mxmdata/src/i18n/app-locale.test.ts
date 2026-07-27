import { describe, expect, it } from 'vitest';
import {
  normalizeAppLocale,
  normalizeAppLocaleFromAcceptLanguage,
  pickDisplayLocalizedString,
  pickLocalizedString,
  resolveAppLocaleByCountry,
  toBcp47,
} from './app-locale';

describe('normalizeAppLocale', () => {
  it('normalizes common tags', () => {
    expect(normalizeAppLocale('en')).toBe('en');
    expect(normalizeAppLocale('en-US')).toBe('en');
    expect(normalizeAppLocale('zh')).toBe('zh');
    expect(normalizeAppLocale('zh-CN')).toBe('zh');
    expect(normalizeAppLocale('zh-TW')).toBe('zh-TW');
    expect(normalizeAppLocale('zh-Hant')).toBe('zh-TW');
    expect(normalizeAppLocale('zh-HK')).toBe('zh-TW');
    expect(normalizeAppLocale('ja')).toBe('ja');
    expect(normalizeAppLocale('ja-JP')).toBe('ja');
  });

  it('defaults unknown to zh', () => {
    expect(normalizeAppLocale(undefined)).toBe('zh');
    expect(normalizeAppLocale('fr')).toBe('zh');
  });
});

describe('pickLocalizedString', () => {
  it('falls back zh-TW → zh → en', () => {
    expect(
      pickLocalizedString({ zh: '简体', en: 'EN' }, 'zh-TW')
    ).toBe('简体');
    expect(pickLocalizedString({ en: 'EN' }, 'zh-TW')).toBe('EN');
  });

  it('falls back ja → en → zh', () => {
    expect(pickLocalizedString({ en: 'EN', zh: '中' }, 'ja')).toBe('EN');
    expect(pickLocalizedString({ zh: '中' }, 'ja')).toBe('中');
  });
});

describe('pickDisplayLocalizedString', () => {
  it('prefers Chinese primary over en-only map', () => {
    expect(pickDisplayLocalizedString('文稿', { en: 'Editorial' }, 'zh')).toBe('文稿');
    expect(
      pickDisplayLocalizedString(
        '按行业方向检索热点',
        { en: 'Trend search by industry' },
        'zh'
      )
    ).toBe('按行业方向检索热点');
  });

  it('uses en from map for English locale', () => {
    expect(pickDisplayLocalizedString('文稿', { en: 'Editorial' }, 'en')).toBe('Editorial');
  });
});

describe('resolveAppLocaleByCountry / toBcp47 / Accept-Language', () => {
  it('maps country', () => {
    expect(resolveAppLocaleByCountry('CN')).toBe('zh');
    expect(resolveAppLocaleByCountry('TW')).toBe('zh-TW');
    expect(resolveAppLocaleByCountry('JP')).toBe('ja');
    expect(resolveAppLocaleByCountry('US')).toBe('en');
  });

  it('toBcp47', () => {
    expect(toBcp47('zh')).toBe('zh-CN');
    expect(toBcp47('zh-TW')).toBe('zh-TW');
    expect(toBcp47('ja')).toBe('ja-JP');
  });

  it('parses Accept-Language', () => {
    expect(normalizeAppLocaleFromAcceptLanguage('ja-JP,ja;q=0.9')).toBe('ja');
    expect(normalizeAppLocaleFromAcceptLanguage('zh-TW,zh;q=0.8')).toBe('zh-TW');
  });
});
