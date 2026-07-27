import { describe, expect, it } from 'vitest';
import {
  demoteSingleRowTables,
  dedupeNearDuplicateParagraphs,
  normalizeChinesePunctuation,
  polishEditorialMarkdown,
  shortenOversizedDocumentTitle,
  stripEditorialMetaDiscourse,
} from './markdown-polish';

describe('normalizeChinesePunctuation', () => {
  it('fixes half-width punctuation between CJK', () => {
    expect(normalizeChinesePunctuation('从 Prime Video 续命赛博朋克 IP,到诺兰')).toContain('IP，到');
    expect(normalizeChinesePunctuation('定档秋季:2026 年')).toContain('定档秋季：2026');
  });
});

describe('demoteSingleRowTables', () => {
  it('converts header+one row to bullets', () => {
    const md = `| 平台 | 首播 |\n|------|------|\n| Prime | 11月 |\n\n正文继续`;
    const out = demoteSingleRowTables(md);
    expect(out).not.toMatch(/^\|/m);
    expect(out).toMatch(/\*\*平台\*\*/);
    expect(out).toContain('正文继续');
  });

  it('keeps multi-row tables', () => {
    const md = `| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |`;
    expect(demoteSingleRowTables(md)).toContain('| 1 | 2 |');
  });
});

describe('dedupeNearDuplicateParagraphs', () => {
  it('drops near-duplicate consecutive paras', () => {
    const md = `本周北美娱乐头条由银翼杀手撑起。\n\n本周北美娱乐头条由银翼杀手撑起，行业端出现新因素。\n\n## 下一章\n\n新内容。`;
    const out = dedupeNearDuplicateParagraphs(md);
    expect(out.split('\n\n').filter((p) => p.includes('北美娱乐头条')).length).toBe(1);
  });
});

describe('stripEditorialMetaDiscourse', () => {
  it('removes 源中未给出 lines', () => {
    const out = stripEditorialMetaDiscourse('事实一句。\n\n源中未给出具体巡演阶段与门票数据。\n\n下一句。');
    expect(out).not.toMatch(/源中未给出/);
  });

  it('drops self-referential 叙事主轴 clause but keeps facts', () => {
    const out = stripEditorialMetaDiscourse(
      'AI投入、通胀、利率三条主线集中定价，构成本期日报的叙事主轴。次日纳指续跌。'
    );
    expect(out).not.toMatch(/叙事主轴/);
    expect(out).not.toMatch(/本期日报/);
    expect(out).toContain('三条主线集中定价。');
    expect(out).toContain('次日纳指续跌。');
  });

  it('removes 本期日报以… whole meta lines', () => {
    const out = stripEditorialMetaDiscourse('事实。\n\n本期日报以美股重挫为主轴展开。\n\n继续。');
    expect(out).not.toMatch(/本期日报/);
    expect(out).toContain('事实。');
  });

  it('strips 如前所述 sentence opener', () => {
    const out = stripEditorialMetaDiscourse('油价站上100美元。如前所述，通胀预期升温。');
    expect(out).not.toMatch(/如前所述/);
    expect(out).toContain('通胀预期升温。');
  });
});

describe('shortenOversizedDocumentTitle', () => {
  it('splits sentence-length H1 into title + lead', () => {
    const md = `# 美股科技板块重挫：纳指连跌两周。2026-07-25 当周收盘纳指单日跌逾2%，特斯拉财报后重挫近15%。\n\n## 触发事件\n\n正文`;
    const out = shortenOversizedDocumentTitle(md);
    const h1 = out.split('\n').find((l) => /^#\s/.test(l) && !/^##/.test(l)) ?? '';
    expect(h1).toMatch(/^# 美股科技板块重挫/);
    expect(h1).not.toMatch(/特斯拉财报/);
    expect(out).toContain('2026-07-25');
    expect(out).toContain('## 触发事件');
  });

  it('keeps short titles unchanged', () => {
    const md = `# 美股科技重挫：AI支出担忧升温（7/25）\n\n导语。`;
    expect(shortenOversizedDocumentTitle(md)).toContain('# 美股科技重挫：AI支出担忧升温（7/25）');
  });
});

describe('polishEditorialMarkdown', () => {
  it('runs full pipeline for zh', () => {
    const md = `# 标题\n\n从 IP,到诺兰。\n\n| 平台 | 档期 |\n|------|------|\n| Prime | 秋季 |\n\n源中未给出后续安排。\n`;
    const out = polishEditorialMarkdown(md, { language: 'zh' });
    expect(out).toContain('IP，到');
    expect(out).not.toMatch(/源中未给出/);
    expect(out).toMatch(/\*\*平台\*\*/);
  });

  it('strips Chinese AI workshop phrases', () => {
    const md = `# 标题\n\n所以先抛立场，车队其实已经换了策略。\n\n值得注意的是，积分榜上差距拉开了。\n`;
    const out = polishEditorialMarkdown(md, { language: 'zh' });
    expect(out).not.toMatch(/先抛立场/);
    expect(out).not.toMatch(/值得注意的是/);
    expect(out).toContain('车队其实已经换了策略');
    expect(out).toContain('积分榜上差距拉开了');
  });
});
