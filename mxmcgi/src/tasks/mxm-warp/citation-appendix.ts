/**
 * 成稿确定性后处理（不改阅读体验结构）：
 * - 关闭主观分析时去掉文末投资评论式小结 / 研报表 / 免责脚注
 * - 去掉泄漏到成稿的排版/字段标签（副标：、开篇 | 等）
 */

const SUMMARY_HEADING_RE =
  /^#{1,3}\s*(?:[\d一二三四五六七八九十百]+[、.．)]\s*)?(?:(?:本周)?小结|收束|展望|板块催化|投资看点|下周看点|本周看点)\s*$/m;

const DISCLAIMER_RE =
  /^\s*\*?本报告基于公开信息整理[^*\n]*\*?\s*$/gm;

const INVESTMENT_LINE_RE =
  /[^\n]*(?:估值修复|业绩确定性|三重催化|配置窗口|投资价值|板块催化|注入新预期)[^\n]*/g;

/** 模型常把内部字段/排版字印进成稿 */
const CHROME_LINE_PREFIX_RE =
  /^(#{1,3}\s*)?(?:\*{0,2})(?:副标|导语|开篇|本周主线|时段大势|dek|opening_hook|period_overview)(?:\*{0,2})\s*[|：:]\s*/gim;

/**
 * 去掉成稿里的排版标签前缀（保留后面正文）
 */
export function stripEditorialChromeLabels(markdown: string): string {
  let s = String(markdown || '');
  s = s
    .split('\n')
    .map((line) => line.replace(CHROME_LINE_PREFIX_RE, (_m, hashes?: string) => hashes || ''))
    .join('\n');
  s = s.replace(/(^|\n)\s*副标\s*[：:]\s*/g, '$1');
  return s.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trimEnd() + '\n';
}

/**
 * 关闭主观分析时：去掉小结专章、研报腔收尾、公开信息免责脚注
 */
export function stripClosingInvestmentBlurb(markdown: string): string {
  let s = String(markdown || '');

  // 从「小结/展望」类标题起截到文末（专章整段删）
  const headingIdx = s.search(SUMMARY_HEADING_RE);
  if (headingIdx >= 0) {
    s = s.slice(0, headingIdx).trimEnd();
  }

  // 「**小结**：…」段落
  s = s.replace(
    /\n{1,2}\*{0,2}小结\*{0,2}[：:][^\n]*(?:\n(?!\n|#)[^\n]*)*/g,
    ''
  );

  // 免脚注
  s = s.replace(DISCLAIMER_RE, '');

  // 残留投资判断句
  s = s.replace(INVESTMENT_LINE_RE, '');

  // 文末孤立表格（小结表被标题删掉后可能残留）
  s = s.replace(
    /\n{1,2}\|?\s*维度\s*\|[^\n]*关键判断[^\n]*\|[\s\S]*$/i,
    '\n'
  );

  return s.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trimEnd() + '\n';
}
