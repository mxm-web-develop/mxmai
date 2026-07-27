import { describe, expect, it } from 'vitest';
import {
  buildManuscriptLanguageDirective,
  buildProseDeaiInstruction,
  normalizeManuscriptLanguage,
} from './manuscript-language-directive';

describe('normalizeManuscriptLanguage', () => {
  it('maps common aliases to zh / zh-TW / en / ja', () => {
    expect(normalizeManuscriptLanguage('zh')).toBe('zh');
    expect(normalizeManuscriptLanguage('zh-CN')).toBe('zh');
    expect(normalizeManuscriptLanguage('zh-TW')).toBe('zh-TW');
    expect(normalizeManuscriptLanguage('en-US')).toBe('en');
    expect(normalizeManuscriptLanguage('ja-JP')).toBe('ja');
  });
});

describe('buildManuscriptLanguageDirective', () => {
  it('expands zh into simplified Chinese hard rules with blacklist', () => {
    const d = buildManuscriptLanguageDirective('zh');
    expect(d).toContain('简体中文母语书面语');
    expect(d).toContain('所以先抛立场');
    expect(d).toContain('押在那张泛');
    expect(d).toContain('违反即失败');
  });

  it('expands zh-TW into traditional rules', () => {
    const d = buildManuscriptLanguageDirective('zh-TW');
    expect(d).toContain('繁體台灣書面語');
  });
});

describe('buildProseDeaiInstruction', () => {
  it('covers all four platform languages', () => {
    for (const lang of ['zh', 'zh-TW', 'en', 'ja'] as const) {
      const inst = buildProseDeaiInstruction(lang);
      expect(inst).toContain(`Target language code: ${lang === 'zh-TW' ? 'zh-TW' : lang}`);
      expect(inst).toContain('### zh —');
      expect(inst).toContain('### zh-TW —');
      expect(inst).toContain('### en —');
      expect(inst).toContain('### ja —');
    }
  });
});
