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

/**
 * 将 Markdown 渲染为版式 PDF（每段独立排版，避免 pdfkit continued 导致行重叠）
 */
export async function renderMarkdownToPdf(markdown: string): Promise<Buffer> {
  const fontPath = resolveWritingPdfFontPath();
  if (!fontPath) {
    console.warn(
      '[renderMarkdownToPdf] 未找到中文字体，PDF 可能出现乱码。请部署 mxmcgi/assets/fonts/NotoSansSC-Regular.otf 或设置 WRITING_PDF_FONT_PATH'
    );
  }
  const tokens = marked.lexer(normalizeMarkdownForPdf(markdown), { gfm: true, breaks: true });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margins: { top: 64, bottom: 64, left: 60, right: 60 },
      autoFirstPage: true,
      size: 'A4',
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const marginLeft = doc.page.margins.left;
    const contentWidth = doc.page.width - marginLeft - doc.page.margins.right;

    try {
      const renderer = new MarkdownPdfRenderer(doc, fontPath, marginLeft, contentWidth);
      renderer.renderBlocks(tokens);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

class MarkdownPdfRenderer {
  private listDepth = 0;
  private orderedCounters: number[] = [];

  constructor(
    private readonly doc: InstanceType<typeof PDFDocument>,
    private readonly fontPath: string | undefined,
    private readonly marginLeft: number,
    private readonly contentWidth: number
  ) {}

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
    if (!tokens?.length) return '';
    const parts: string[] = [];
    for (const t of tokens) {
      if (t.type === 'text') {
        parts.push((t as Tokens.Text).text);
      } else if (t.type === 'strong' || t.type === 'em' || t.type === 'del') {
        parts.push(this.inlineToPlain((t as Tokens.Strong).tokens));
      } else if (t.type === 'codespan') {
        parts.push((t as Tokens.Codespan).text);
      } else if (t.type === 'br') {
        parts.push('\n');
      } else if ('tokens' in t && Array.isArray((t as { tokens?: Token[] }).tokens)) {
        parts.push(this.inlineToPlain((t as { tokens: Token[] }).tokens));
      }
    }
    return parts.join('');
  }
}
