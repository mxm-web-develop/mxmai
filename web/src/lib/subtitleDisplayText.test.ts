import { describe, expect, it } from 'vitest';
import { stripSubtitlePunctuation } from './subtitleDisplayText';

describe('stripSubtitlePunctuation', () => {
  it('removes Chinese punctuation', () => {
    expect(stripSubtitlePunctuation('各位听众，')).toBe('各位听众');
    expect(stripSubtitlePunctuation('但底层有三条主线在同步加速推进，')).toBe(
      '但底层有三条主线在同步加速推进'
    );
  });

  it('removes English punctuation', () => {
    expect(stripSubtitlePunctuation('Hello, world!')).toBe('Hello world');
  });

  it('collapses whitespace', () => {
    expect(stripSubtitlePunctuation('  你好  ，  世界  ')).toBe('你好 世界');
  });
});
