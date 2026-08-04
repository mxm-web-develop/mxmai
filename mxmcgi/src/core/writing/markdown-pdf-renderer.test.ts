import { describe, expect, it } from 'vitest';
import {
  estimateTocPageCount,
  extractMarkdownToc,
  fitCoverTitleForDisplay,
  renderMarkdownToPdf,
} from './markdown-pdf-renderer';

function countPdfPages(buf: Buffer): number {
  const latin = buf.toString('latin1');
  return (latin.match(/\/Type\s*\/Page(?!s)\b/g) || []).length;
}

describe('fitCoverTitleForDisplay', () => {
  it('strips hook brackets and truncates long premise titles', () => {
    const raw =
      '【号外，重生大佬掉马甲了呀】同学会现场被嘲讽是靠关系的花瓶，她把上一世签下的并购意向书摊开，前任上司当场起立';
    const fitted = fitCoverTitleForDisplay(raw);
    expect(fitted).not.toMatch(/【|】/);
    expect([...fitted].length).toBeLessThanOrEqual(29);
    expect(fitted.endsWith('…') || [...fitted].length <= 28).toBe(true);
  });
});

describe('estimateTocPageCount', () => {
  it('reserves a single toc page when there are entries', () => {
    expect(estimateTocPageCount(0)).toBe(0);
    expect(estimateTocPageCount(3)).toBe(1);
    expect(estimateTocPageCount(40)).toBe(1);
  });
});

describe('renderMarkdownToPdf', () => {
  it('renders multi-paragraph article with cover and toc', async () => {
    const md = [
      '# 沉默的证词',
      '',
      '## 一份来自未来的档案',
      '',
      '**【新闻稿发布】** 公元2173年，人类文明记忆库。',
      '',
      '这是第一段正文，应当单独成行显示。',
      '',
      '这是第二段正文，与上一段之间应有间距，不能叠在一起。',
      '',
      '---',
      '',
      '- 列表项一',
      '- 列表项二',
      '',
      '### 1. 钟楼与寂静',
      '',
      '林深站在钟楼顶端，风从城市的废墟间穿过。',
    ].join('\n');

    const toc = extractMarkdownToc(md);
    expect(toc.some((e) => e.text.includes('沉默的证词'))).toBe(true);
    expect(toc.some((e) => e.depth === 2)).toBe(true);

    const buf = await renderMarkdownToPdf(md, { includeCover: true, includeToc: true });
    expect(buf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(buf.length).toBeGreaterThan(800);
    expect(countPdfPages(buf)).toBeGreaterThanOrEqual(3);
  });

  it('keeps cover to one page even with extremely long H1', async () => {
    const longTitle =
      '【号外，重生大佬掉马甲了呀】同学会现场被嘲讽是靠关系的花瓶，她把上一世签下的并购意向书摊开，前任上司当场起立';
    const md = [
      `# ${longTitle}`,
      '',
      '## 开场',
      '',
      '短正文一段。',
      '',
      '## 收束',
      '',
      '落点。',
    ].join('\n');

    const withLong = await renderMarkdownToPdf(md, { includeCover: true, includeToc: true });
    const withShort = await renderMarkdownToPdf(
      ['# 同学会掉马甲', '', '## 开场', '', '短正文一段。', '', '## 收束', '', '落点。'].join(
        '\n'
      ),
      { includeCover: true, includeToc: true }
    );

    expect(countPdfPages(withLong)).toBe(countPdfPages(withShort));
    expect(countPdfPages(withLong)).toBeGreaterThanOrEqual(3);
  });

  it('assigns toc page numbers and body footers without crashing on multi-section docs', async () => {
    const sections = Array.from({ length: 8 }, (_, i) =>
      [`## 章节 ${i + 1}`, '', `这是第 ${i + 1} 章的正文。`.repeat(40), ''].join('\n')
    );
    const md = ['# 长文页码测试', '', ...sections].join('\n');
    const buf = await renderMarkdownToPdf(md, { includeCover: true, includeToc: true });
    expect(buf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(countPdfPages(buf)).toBeGreaterThanOrEqual(4);
  });

  it('can skip cover and toc', async () => {
    const buf = await renderMarkdownToPdf('# Hello\n\nWorld', {
      includeCover: false,
      includeToc: false,
    });
    expect(buf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(countPdfPages(buf)).toBeGreaterThanOrEqual(1);
  });
});
