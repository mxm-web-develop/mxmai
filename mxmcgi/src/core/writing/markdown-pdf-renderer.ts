import PDFDocument from 'pdfkit';
import { marked, type Token, type Tokens } from 'marked';
import { resolveWritingPdfFontPath } from './pdf-font';
import { normalizeMarkdownForPdf } from './markdown-normalize';

const HEADING_SIZES: Record<number, number> = {
  1: 22,
  2: 16.5,
  3: 13.5,
  4: 12,
  5: 11,
  6: 10,
};

/** 与 Web `.doc-reader-markdown` 对齐：偏松行距 + 段距，利于 A4 阅读 */
const BODY_SIZE = 11;
const CODE_SIZE = 9.5;
const BLOCKQUOTE_SIZE = 10.5;
const LINE_GAP = 7;
const PARA_GAP = 12;

const COLOR_BODY = '#0f172a';
const COLOR_HEADING = '#0f172a';
const COLOR_HEADING_SOFT = '#1e3a5f';
const COLOR_MUTED = '#475569';
const COLOR_ACCENT = '#0284c7';
const COLOR_ACCENT_SOFT = '#e0f2fe';
const COLOR_CODE_BG = '#f0f9ff';
const COLOR_RULE = '#bae6fd';
const COLOR_RULE_SOFT = '#e2e8f0';

type BlockTextOptions = {
  fontSize: number;
  color?: string;
  indent?: number;
  align?: 'left' | 'center';
  gapAfter?: number;
};

export type MarkdownPdfRenderOptions = {
  /** 封面主标题；缺省时取首个 H1 */
  title?: string;
  /** 封面副标题 */
  subtitle?: string;
  /** 是否生成封面页，默认 true */
  includeCover?: boolean;
  /** 是否生成目录页，默认 true */
  includeToc?: boolean;
};

export type TocEntry = {
  depth: number;
  text: string;
  /** 1-based 文档页码（含封面/目录）；渲染正文后回填 */
  page?: number;
};

/** 封面标题展示上限：过长会撑破单页，导致目录前多出空白日期页 */
export const COVER_TITLE_MAX_CHARS = 28;
const COVER_TITLE_FONT_MAX = 28;
const COVER_TITLE_FONT_MIN = 16;

/** 页脚距页底；须落在 bottom margin 之内，否则 PDFKit 会再开一页只剩页码 */
const FOOTER_OFFSET_FROM_BOTTOM = 44;
const BODY_BOTTOM_MARGIN = 64;
const FOOTER_SAFE_BOTTOM_MARGIN = 28;

/**
 * 封面用短标题：去掉【号外…】类钩子前缀，截到可读长度。
 * 不影响正文 Markdown；仅 PDF 封面排版。
 */
export function fitCoverTitleForDisplay(raw: string, maxChars = COVER_TITLE_MAX_CHARS): string {
  let s = String(raw || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return '文稿';
  // 网文选题常带【钩子】前缀，封面只留后半句或截断
  s = s.replace(/^【[^】]{0,48}】\s*/u, '').trim() || s;
  if ([...s].length <= maxChars) return s;
  const chars = [...s];
  const cut = chars.slice(0, Math.max(4, maxChars - 1)).join('');
  return `${cut}…`;
}

/** 从 Markdown 抽取标题树，供目录页使用 */
export function extractMarkdownToc(markdown: string, maxDepth = 3): TocEntry[] {
  const tokens = marked.lexer(normalizeMarkdownForPdf(markdown), { gfm: true, breaks: true });
  const entries: TocEntry[] = [];
  for (const token of tokens) {
    if (token.type !== 'heading') continue;
    const heading = token as Tokens.Heading;
    if (heading.depth > maxDepth) continue;
    const text = inlineTokensToPlain(heading.tokens).trim();
    if (!text) continue;
    entries.push({ depth: heading.depth, text });
  }
  return entries;
}

function inlineTokensToPlain(tokens: Token[] | undefined): string {
  if (!tokens?.length) return '';
  const parts: string[] = [];
  for (const t of tokens) {
    if (t.type === 'text') {
      parts.push((t as Tokens.Text).text);
    } else if (t.type === 'strong' || t.type === 'em' || t.type === 'del') {
      parts.push(inlineTokensToPlain((t as Tokens.Strong).tokens));
    } else if (t.type === 'codespan') {
      parts.push((t as Tokens.Codespan).text);
    } else if (t.type === 'br') {
      parts.push('\n');
    } else if ('tokens' in t && Array.isArray((t as { tokens?: Token[] }).tokens)) {
      parts.push(inlineTokensToPlain((t as { tokens: Token[] }).tokens));
    }
  }
  return parts.join('');
}

function resolveDocumentTitle(markdown: string, explicit?: string): string {
  const trimmed = explicit?.trim();
  if (trimmed) return trimmed;
  const firstH1 = extractMarkdownToc(markdown, 1).find((e) => e.depth === 1);
  return firstH1?.text || '文稿';
}

/**
 * 将 Markdown 渲染为版式 PDF（封面 + 目录带页码 + 正文；正文页脚页码）
 */
export async function renderMarkdownToPdf(
  markdown: string,
  options?: MarkdownPdfRenderOptions
): Promise<Buffer> {
  const fontPath = resolveWritingPdfFontPath();
  if (!fontPath) {
    console.warn(
      '[renderMarkdownToPdf] 未找到中文字体，PDF 可能出现乱码。请部署 mxmcgi/assets/fonts/NotoSansSC-Regular.otf 或设置 WRITING_PDF_FONT_PATH'
    );
  }

  const normalized = normalizeMarkdownForPdf(markdown);
  const includeCover = options?.includeCover !== false;
  const includeToc = options?.includeToc !== false;
  const title = resolveDocumentTitle(normalized, options?.title);
  const subtitle = options?.subtitle?.trim() || undefined;
  const toc: TocEntry[] = includeToc ? extractMarkdownToc(normalized, 3) : [];
  const tokens = marked.lexer(normalized, { gfm: true, breaks: true });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margins: { top: 64, bottom: BODY_BOTTOM_MARGIN, left: 60, right: 60 },
      autoFirstPage: false,
      size: 'A4',
      bufferPages: true,
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    try {
      const marginLeft = 60;
      const marginRight = 60;
      // A4 width 595.28 — addPage 前不要读 doc.page
      const width = 595.28 - marginLeft - marginRight;

      if (includeCover) {
        doc.addPage();
        renderCoverPage(doc, fontPath, title, subtitle);
      }

      // 先预留目录页，再渲染正文以采集真实页码，最后回填目录（避免 TOC 页数变化导致页码漂移）
      const tocPageIndices: number[] = [];
      if (includeToc && toc.length > 0) {
        const reserved = estimateTocPageCount(toc.length);
        for (let i = 0; i < reserved; i++) {
          doc.addPage();
          tocPageIndices.push(currentPageIndex(doc));
        }
      }

      doc.addPage();
      const bodyStartIndex = currentPageIndex(doc);
      let tocAssignIndex = 0;
      const renderer = new MarkdownPdfRenderer(doc, fontPath, marginLeft, width);
      renderer.setHeadingListener((depth) => {
        if (depth > 3) return;
        if (tocAssignIndex >= toc.length) return;
        toc[tocAssignIndex]!.page = currentPageNumber(doc);
        tocAssignIndex += 1;
      });
      renderer.renderBlocks(tokens);

      if (tocPageIndices.length > 0) {
        fillTocPages(doc, fontPath, toc, tocPageIndices);
      }

      paintBodyPageFooters(doc, fontPath, bodyStartIndex);

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/** 当前页 0-based 索引（bufferPages） */
function currentPageIndex(doc: InstanceType<typeof PDFDocument>): number {
  const range = doc.bufferedPageRange();
  return range.start + range.count - 1;
}

/** 当前页 1-based 页码（与 PDF 阅读器页码一致） */
function currentPageNumber(doc: InstanceType<typeof PDFDocument>): number {
  return currentPageIndex(doc) + 1;
}

/** 目录预留页数：固定 1 页，回填时按条目数压缩行距，避免多预留造成空白页 */
export function estimateTocPageCount(entryCount: number): number {
  return entryCount > 0 ? 1 : 0;
}

function fontOrHelv(fontPath: string | undefined): string {
  return fontPath ?? 'Helvetica';
}

function renderCoverPage(
  doc: InstanceType<typeof PDFDocument>,
  fontPath: string | undefined,
  title: string,
  subtitle?: string
): void {
  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const margin = 60;
  const contentWidth = pageW - margin * 2;
  const coverIndex = currentPageIndex(doc);
  const fontName = fontOrHelv(fontPath);

  doc.rect(0, 0, pageW, pageH).fill('#f8fafc');
  doc.rect(0, 0, 8, pageH).fill(COLOR_ACCENT);

  const displayTitle = fitCoverTitleForDisplay(title);
  const titleTop = pageH * 0.34;

  let fontSize = COVER_TITLE_FONT_MAX;
  doc.font(fontName);
  while (fontSize > COVER_TITLE_FONT_MIN) {
    doc.fontSize(fontSize);
    const lines = wrapTextLines(doc, displayTitle, contentWidth, 4);
    const blockH = lines.length * (fontSize + 6);
    if (blockH <= pageH * 0.28) break;
    fontSize -= 2;
  }

  doc.font(fontName).fontSize(fontSize).fillColor(COLOR_HEADING);
  const titleLines = wrapTextLines(doc, displayTitle, contentWidth, 4);
  let y = titleTop;
  for (const line of titleLines) {
    // lineBreak:false —— 禁止 PDFKit 自动加页（否则封面与目录间会多出空白页）
    doc.text(line, margin, y, { width: contentWidth, lineBreak: false });
    y += fontSize + 6;
  }

  const ruleY = y + 14;
  doc
    .strokeColor(COLOR_ACCENT)
    .lineWidth(2)
    .moveTo(margin, ruleY)
    .lineTo(margin + 72, ruleY)
    .stroke();

  if (subtitle) {
    const sub = fitCoverTitleForDisplay(subtitle, 48);
    doc.font(fontName).fontSize(12).fillColor(COLOR_MUTED);
    const subLines = wrapTextLines(doc, sub, contentWidth, 2);
    let sy = ruleY + 18;
    for (const line of subLines) {
      doc.text(line, margin, sy, { width: contentWidth, lineBreak: false });
      sy += 16;
    }
  }

  const dateLabel = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const prevBottom = doc.page.margins.bottom;
  doc.page.margins.bottom = FOOTER_SAFE_BOTTOM_MARGIN;
  doc
    .font(fontName)
    .fontSize(10)
    .fillColor(COLOR_MUTED)
    .text(dateLabel, margin, pageH - 56, {
      width: contentWidth,
      align: 'left',
      lineBreak: false,
    });
  doc.page.margins.bottom = prevBottom;

  doc.switchToPage(coverIndex);
  doc.x = margin;
  doc.y = pageH - 64;
}

/** 按宽度贪心断行（用于封面等禁止自动换页的场景） */
function wrapTextLines(
  doc: InstanceType<typeof PDFDocument>,
  text: string,
  width: number,
  maxLines: number
): string[] {
  const chars = [...String(text || '')];
  if (chars.length === 0) return [];
  const lines: string[] = [];
  let current = '';
  for (const ch of chars) {
    const trial = current + ch;
    if (doc.widthOfString(trial) <= width || current.length === 0) {
      current = trial;
      continue;
    }
    lines.push(current);
    current = ch;
    if (lines.length >= maxLines) {
      current = '';
      break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);

  const joinedLen = lines.join('').length;
  if (lines.length === maxLines && joinedLen < chars.length) {
    let last = lines[maxLines - 1] ?? '';
    while (last.length > 1 && doc.widthOfString(`${last}…`) > width) {
      last = [...last].slice(0, -1).join('');
    }
    lines[maxLines - 1] = `${last}…`;
  }
  return lines;
}

/** 在预留目录页上回填带页码的目录（单页自适应行距） */
function fillTocPages(
  doc: InstanceType<typeof PDFDocument>,
  fontPath: string | undefined,
  toc: TocEntry[],
  tocPageIndices: number[]
): void {
  if (tocPageIndices.length === 0 || toc.length === 0) return;

  doc.switchToPage(tocPageIndices[0]!);
  const marginLeft = 60;
  const contentWidth = doc.page.width - marginLeft - 60;
  const pageBottom = doc.page.height - BODY_BOTTOM_MARGIN;
  const fontName = fontOrHelv(fontPath);

  doc.rect(0, 0, doc.page.width, doc.page.height).fill('#ffffff');
  doc.rect(0, 0, 8, doc.page.height).fill(COLOR_ACCENT_SOFT);

  doc
    .font(fontName)
    .fontSize(20)
    .fillColor(COLOR_HEADING)
    .text('目录', marginLeft, doc.page.margins.top, {
      width: contentWidth,
      align: 'left',
    });

  const ruleY = doc.y + 8;
  doc
    .strokeColor(COLOR_RULE)
    .lineWidth(1.2)
    .moveTo(marginLeft, ruleY)
    .lineTo(marginLeft + contentWidth, ruleY)
    .stroke();

  const listTop = ruleY + 20;
  const available = Math.max(120, pageBottom - listTop);
  const rowHeight = Math.min(26, Math.max(13, available / toc.length));
  const fontSize = rowHeight >= 22 ? 12 : rowHeight >= 17 ? 10.5 : 9;

  let y = listTop;
  for (const entry of toc) {
    const indent = Math.max(0, entry.depth - 1) * 14;
    const color = entry.depth === 1 ? COLOR_HEADING : COLOR_MUTED;
    drawTocRow(doc, fontName, {
      text: entry.text,
      page: entry.page,
      x: marginLeft + indent,
      y,
      width: contentWidth - indent,
      fontSize: entry.depth === 1 ? fontSize : Math.max(9, fontSize - 0.5),
      color,
    });
    y += rowHeight;
    if (y > pageBottom - 4) break;
  }
}

function drawTocRow(
  doc: InstanceType<typeof PDFDocument>,
  fontName: string,
  opts: {
    text: string;
    page?: number;
    x: number;
    y: number;
    width: number;
    fontSize: number;
    color: string;
  }
): void {
  const pageLabel = opts.page != null && opts.page > 0 ? String(opts.page) : '';
  doc.font(fontName).fontSize(opts.fontSize);
  const pageWidth = pageLabel ? doc.widthOfString(pageLabel) : 0;
  const gap = pageLabel ? 10 : 0;
  const titleMax = Math.max(40, opts.width - pageWidth - gap);

  doc.fillColor(opts.color).text(opts.text, opts.x, opts.y, {
    width: titleMax,
    height: opts.fontSize + 4,
    ellipsis: true,
    lineBreak: false,
  });

  const titleDrawn = Math.min(doc.widthOfString(opts.text), titleMax);
  const dotsStart = opts.x + titleDrawn + 6;
  const dotsEnd = opts.x + opts.width - pageWidth - 4;

  if (pageLabel && dotsEnd > dotsStart + 12) {
    doc.font(fontName).fontSize(opts.fontSize).fillColor(COLOR_RULE);
    const dotW = Math.max(doc.widthOfString('.'), 1);
    const count = Math.floor((dotsEnd - dotsStart) / dotW);
    if (count > 0) {
      doc.text('.'.repeat(count), dotsStart, opts.y, { lineBreak: false });
    }
  }

  if (pageLabel) {
    doc
      .font(fontName)
      .fontSize(opts.fontSize)
      .fillColor(opts.color)
      .text(pageLabel, opts.x + opts.width - pageWidth, opts.y, { lineBreak: false });
  }
}

/** 正文页（不含封面/目录）底部居中页码注脚 */
function paintBodyPageFooters(
  doc: InstanceType<typeof PDFDocument>,
  fontPath: string | undefined,
  bodyStartIndex: number
): void {
  const range = doc.bufferedPageRange();
  const endExclusive = range.start + range.count;
  const fontName = fontOrHelv(fontPath);

  for (let i = bodyStartIndex; i < endExclusive; i++) {
    doc.switchToPage(i);
    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const label = String(i + 1);
    const prevBottom = doc.page.margins.bottom;
    // 页脚画在底边距内；不降低 margin 时 PDFKit 会自动加页，出现「只有页码」的空白页
    doc.page.margins.bottom = FOOTER_SAFE_BOTTOM_MARGIN;

    doc
      .strokeColor(COLOR_RULE_SOFT)
      .lineWidth(0.6)
      .moveTo(60, pageH - FOOTER_OFFSET_FROM_BOTTOM - 8)
      .lineTo(pageW - 60, pageH - FOOTER_OFFSET_FROM_BOTTOM - 8)
      .stroke();

    doc
      .font(fontName)
      .fontSize(9)
      .fillColor(COLOR_MUTED)
      .text(label, 60, pageH - FOOTER_OFFSET_FROM_BOTTOM, {
        width: pageW - 120,
        align: 'center',
        lineBreak: false,
      });

    doc.page.margins.bottom = prevBottom;
  }
}

class MarkdownPdfRenderer {
  private listDepth = 0;
  private orderedCounters: number[] = [];
  private headingListener: ((depth: number, text: string) => void) | null = null;

  constructor(
    private readonly doc: InstanceType<typeof PDFDocument>,
    private readonly fontPath: string | undefined,
    private readonly marginLeft: number,
    private readonly contentWidth: number
  ) {}

  setHeadingListener(listener: (depth: number, text: string) => void): void {
    this.headingListener = listener;
  }

  private fontRegular(): string {
    return this.fontPath ?? 'Helvetica';
  }

  private resetX(indent = 0): void {
    this.doc.x = this.marginLeft + indent;
  }

  /** 单段文本：不用 continued、不手动传 y，由 pdfkit 自动换行推进光标 */
  private writeParagraph(text: string, options: BlockTextOptions): void {
    const trimmed = text.trim();
    if (!trimmed) return;

    const indent = options.indent ?? 0;
    const width = this.contentWidth - indent;
    this.resetX(indent);

    this.doc
      .font(this.fontRegular())
      .fontSize(options.fontSize)
      .fillColor(options.color ?? COLOR_BODY)
      .text(trimmed, {
        width,
        align: options.align ?? 'left',
        lineGap: LINE_GAP,
        paragraphGap: PARA_GAP,
      });

    const gap = options.gapAfter ?? 6;
    if (gap > 0) {
      this.doc.moveDown(gap / options.fontSize);
    }
  }

  renderBlocks(tokens: Token[]): void {
    for (const token of tokens) {
      this.renderBlock(token);
    }
  }

  private renderBlock(token: Token): void {
    switch (token.type) {
      case 'space':
        return;
      case 'heading':
        this.renderHeading(token as Tokens.Heading);
        return;
      case 'paragraph':
        this.writeParagraph(this.inlineToPlain((token as Tokens.Paragraph).tokens), {
          fontSize: BODY_SIZE,
          gapAfter: PARA_GAP,
        });
        return;
      case 'blockquote':
        this.renderBlockquote(token as Tokens.Blockquote);
        return;
      case 'code':
        this.renderCodeBlock(token as Tokens.Code);
        return;
      case 'hr':
        this.renderHr();
        return;
      case 'list':
        this.renderList(token as Tokens.List);
        return;
      case 'table':
        this.renderTable(token as Tokens.Table);
        return;
      case 'html': {
        const plain = (token as Tokens.HTML).text.replace(/<[^>]+>/g, '').trim();
        if (plain) {
          this.writeParagraph(plain, { fontSize: BODY_SIZE, gapAfter: PARA_GAP });
        }
        return;
      }
      default:
        return;
    }
  }

  private renderHeading(token: Tokens.Heading): void {
    const size = HEADING_SIZES[token.depth] ?? BODY_SIZE;
    const text = this.inlineToPlain(token.tokens);
    if (!text) return;

    this.doc.moveDown(token.depth <= 2 ? 0.85 : 0.55);
    // 换页后再记页码，保证目录与标题所在页一致
    this.headingListener?.(token.depth, text);
    this.writeParagraph(text, {
      fontSize: size,
      color: token.depth === 1 ? COLOR_HEADING : COLOR_HEADING_SOFT,
      gapAfter: token.depth === 1 ? 2 : 4,
    });

    if (token.depth === 1) {
      const y = this.doc.y + 2;
      this.doc
        .strokeColor(COLOR_RULE)
        .lineWidth(1.25)
        .moveTo(this.marginLeft, y)
        .lineTo(this.marginLeft + this.contentWidth, y)
        .stroke();
      this.doc
        .strokeColor(COLOR_ACCENT)
        .lineWidth(1)
        .moveTo(this.marginLeft, y + 2.5)
        .lineTo(this.marginLeft + Math.min(72, this.contentWidth * 0.22), y + 2.5)
        .stroke();
      this.doc.y = y + 18;
    } else if (token.depth === 2) {
      const y = this.doc.y + 1;
      this.doc
        .strokeColor(COLOR_RULE_SOFT)
        .lineWidth(0.8)
        .moveTo(this.marginLeft, y)
        .lineTo(this.marginLeft + this.contentWidth, y)
        .stroke();
      this.doc.y = y + 14;
    }
  }

  private renderBlockquote(token: Tokens.Blockquote): void {
    const pad = 12;
    const paragraphs: string[] = [];
    for (const child of token.tokens) {
      if (child.type === 'paragraph') {
        const plain = this.inlineToPlain((child as Tokens.Paragraph).tokens).trim();
        if (plain) paragraphs.push(plain);
      }
    }
    if (!paragraphs.length) {
      for (const child of token.tokens) this.renderBlock(child);
      return;
    }

    const innerWidth = this.contentWidth - pad * 2;
    this.doc.font(this.fontRegular()).fontSize(BLOCKQUOTE_SIZE);
    let contentHeight = 0;
    for (let i = 0; i < paragraphs.length; i++) {
      contentHeight += this.doc.heightOfString(paragraphs[i], {
        width: innerWidth,
        lineGap: LINE_GAP,
      });
      if (i < paragraphs.length - 1) contentHeight += 8;
    }
    const boxHeight = contentHeight + pad * 2;
    const yStart = this.doc.y;

    this.doc.rect(this.marginLeft, yStart, this.contentWidth, boxHeight).fill(COLOR_ACCENT_SOFT);

    this.doc.y = yStart + pad;
    for (let i = 0; i < paragraphs.length; i++) {
      this.writeParagraph(paragraphs[i], {
        fontSize: BLOCKQUOTE_SIZE,
        color: COLOR_MUTED,
        indent: pad,
        gapAfter: i < paragraphs.length - 1 ? 8 : 0,
      });
    }
    this.doc.y = yStart + boxHeight + 12;
    this.resetX(0);
  }

  private renderCodeBlock(token: Tokens.Code): void {
    const text = token.text.replace(/\n$/, '');
    if (!text) return;

    this.doc.moveDown(0.35);
    const padding = 10;
    const x = this.marginLeft;
    const y = this.doc.y;
    const innerWidth = this.contentWidth - padding * 2;
    const lineCount = Math.max(1, text.split('\n').length);
    const boxHeight = lineCount * (CODE_SIZE + 4) + padding * 2;

    this.doc.rect(x, y, this.contentWidth, boxHeight).fill(COLOR_CODE_BG);

    this.resetX(padding);
    this.doc
      .font(this.fontRegular())
      .fontSize(CODE_SIZE)
      .fillColor('#27272a')
      .text(text, x + padding, y + padding, {
        width: innerWidth,
        lineGap: 3,
      });

    this.doc.y = y + boxHeight + 10;
    this.resetX(0);
  }

  private renderHr(): void {
    this.doc.moveDown(0.65);
    const y = this.doc.y;
    this.doc
      .strokeColor(COLOR_RULE)
      .lineWidth(1)
      .moveTo(this.marginLeft, y)
      .lineTo(this.marginLeft + this.contentWidth, y)
      .stroke();
    this.doc.y = y + 20;
    this.resetX(0);
  }

  private renderList(token: Tokens.List): void {
    this.listDepth += 1;
    if (token.ordered) {
      this.orderedCounters.push(0);
    }

    for (const item of token.items) {
      this.renderListItem(item as Tokens.ListItem, token.ordered);
    }

    if (token.ordered) {
      this.orderedCounters.pop();
    }
    this.listDepth -= 1;
    this.doc.moveDown(0.2);
  }

  private renderListItem(item: Tokens.ListItem, ordered: boolean): void {
    const indent = 18 + (this.listDepth - 1) * 14;
    const counterIndex = this.orderedCounters.length - 1;

    let prefix = '• ';
    if (ordered && counterIndex >= 0) {
      this.orderedCounters[counterIndex] += 1;
      prefix = `${this.orderedCounters[counterIndex]}. `;
    }

    let subPrefix = prefix;
    for (const child of item.tokens) {
      if (child.type === 'list') {
        this.renderList(child as Tokens.List);
        continue;
      }
      if (child.type !== 'paragraph') {
        this.renderBlock(child);
        continue;
      }
      const body = this.inlineToPlain((child as Tokens.Paragraph).tokens);
      this.writeParagraph(`${subPrefix}${body}`, {
        fontSize: BODY_SIZE,
        indent,
        gapAfter: 7,
      });
      subPrefix = '   ';
    }
  }

  private renderTable(token: Tokens.Table): void {
    const header = token.header.map((cell) => this.inlineToPlain(cell.tokens)).join(' | ');
    const rows = token.rows.map((row) =>
      row.map((cell) => this.inlineToPlain(cell.tokens)).join(' | ')
    );
    for (const line of [header, ...rows]) {
      this.writeParagraph(line, { fontSize: BODY_SIZE, gapAfter: 4 });
    }
    this.doc.moveDown(0.15);
  }

  private inlineToPlain(tokens: Token[] | undefined): string {
    return inlineTokensToPlain(tokens);
  }
}
