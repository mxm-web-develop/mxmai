import { describe, expect, it } from 'vitest';
import {
  stripClosingInvestmentBlurb,
  stripEditorialChromeLabels,
} from './citation-appendix';

describe('stripClosingInvestmentBlurb', () => {
  it('removes 本周小结 chapter and disclaimer', () => {
    const raw = `# t

事实一段。

## 四、本周小结

| 维度 | 关键判断 |
|------|---------|
| **板块催化** | 估值修复具备空间 |

*本报告基于公开信息整理，数据截至2026年7月31日。*
`;
    const out = stripClosingInvestmentBlurb(raw);
    expect(out).toContain('事实一段');
    expect(out).not.toMatch(/小结/);
    expect(out).not.toMatch(/估值修复/);
    expect(out).not.toMatch(/公开信息整理/);
  });

  it('removes **小结**： blurb', () => {
    const raw = '# t\n\n事实一段。\n\n**小结**：本周呈现三重催化，板块业绩确定性较强。\n';
    const out = stripClosingInvestmentBlurb(raw);
    expect(out).not.toMatch(/小结/);
    expect(out).not.toMatch(/确定性/);
    expect(out).toContain('事实一段');
  });
});

describe('stripEditorialChromeLabels', () => {
  it('strips 副标： and 开篇 | prefixes', () => {
    const raw = `# 芯片三国杀

副标：FOMC决议与长鑫上市同框。

## 开篇 | 三股力拧成麻花

正文段落。
`;
    const out = stripEditorialChromeLabels(raw);
    expect(out).not.toMatch(/副标/);
    expect(out).toContain('FOMC决议与长鑫上市同框');
    expect(out).toMatch(/^##\s+三股力拧成麻花/m);
    expect(out).not.toMatch(/开篇\s*\|/);
  });
});
