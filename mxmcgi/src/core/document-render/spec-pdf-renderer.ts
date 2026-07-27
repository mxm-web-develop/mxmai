import PDFDocument from 'pdfkit';
import { marked, type Token, type Tokens } from 'marked';
import { resolveWritingPdfFontPath } from '../writing/pdf-font';
import { normalizeMarkdownForPdf } from '../writing/markdown-normalize';
import type { DocumentRenderBlock, DocumentRenderSpecV1 } from './types';
import {
  resolveAssetUrl,
  resolveBinding,
  resolveStructuredHighlights,
  resolveStructuredMetaTitle,
  resolveThemeColors,
} from './theme-registry';

const HEADING_SIZES: Record<number, number> = { 1: 22, 2: 17, 3: 14, 4: 12, 5: 11, 6: 10 };

async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  try {
    if (url.startsWith('data:')) {
      const comma = url.indexOf(',');
      if (comma < 0) return null;
      const meta = url.slice(0, comma);
      const data = url.slice(comma + 1);
      if (meta.includes(';base64')) {
        return Buffer.from(data, 'base64');
      }
      return Buffer.from(decodeURIComponent(data), 'utf-8');
    }
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}

function inlineToPlain(tokens: Token[] | undefined): string {
  if (!tokens?.length) return '';
  let out = '';
  for (const token of tokens) {
    switch (token.type) {
      case 'text':
        out += (token as Tokens.Text).text;
        break;
      case 'strong':
      case 'em':
      case 'del':
        out += inlineToPlain((token as Tokens.Strong).tokens);
        break;
      case 'codespan':
        out += (token as Tokens.Codespan).text;
        break;
      case 'link':
        out += inlineToPlain((token as Tokens.Link).tokens);
        break;
      case 'br':
        out += '\n';
        break;
      default:
        if ('tokens' in token && Array.isArray((token as { tokens?: Token[] }).tokens)) {
          out += inlineToPlain((token as { tokens: Token[] }).tokens);
        } else if ('text' in token && typeof (token as { text?: string }).text === 'string') {
          out += (token as { text: string }).text;
        }
        break;
    }
  }
  return out;
}

class SpecPdfRenderer {
  private readonly colors: ReturnType<typeof resolveThemeColors>;
  private readonly fontPath: string | undefined;
  private readonly tocEntries: { title: string; page: number }[] = [];
  private pendingToc = false;

  constructor(
    private readonly doc: InstanceType<typeof PDFDocument>,
    private readonly spec: DocumentRenderSpecV1,
    private readonly markdown: string,
    private readonly structured: unknown,
    private readonly marginLeft: number,
    private readonly contentWidth: number
  ) {
    this.colors = resolveThemeColors(spec);
    this.fontPath = resolveWritingPdfFontPath();
  }

  private fontRegular(): string {
    return this.fontPath ?? 'Helvetica';
  }

  private writeText(
    text: string,
    options: { size?: number; color?: string; align?: 'left' | 'center' | 'right'; gap?: number } = {}
  ): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    this.doc
      .font(this.fontRegular())
      .fontSize(options.size ?? 11)
      .fillColor(options.color ?? this.colors.text)
      .text(trimmed, {
        width: this.contentWidth,
        align: options.align ?? 'left',
        lineGap: 4,
        paragraphGap: 6,
      });
    if (options.gap) this.doc.moveDown(options.gap);
  }

  private renderMarkdownChunk(md: string): void {
    const tokens = marked.lexer(normalizeMarkdownForPdf(md), { gfm: true, breaks: true });
    for (const token of tokens) {
      if (token.type === 'heading') {
        const heading = token as Tokens.Heading;
        const text = inlineToPlain(heading.tokens);
        if (!text) continue;
        if (this.pendingToc) {
          this.tocEntries.push({ title: text, page: this.doc.bufferedPageRange().count });
        }
        this.writeText(text, { size: HEADING_SIZES[heading.depth] ?? 12, color: this.colors.primary, gap: 0.2 });
      } else if (token.type === 'paragraph') {
        this.writeText(inlineToPlain((token as Tokens.Paragraph).tokens), { gap: 0.15 });
      } else if (token.type === 'list') {
        const list = token as Tokens.List;
        for (const item of list.items) {
          const prefix = list.ordered ? '• ' : '• ';
          this.writeText(`${prefix}${inlineToPlain(item.tokens)}`, { gap: 0.05 });
        }
      } else if (token.type === 'hr') {
        this.doc.moveDown(0.2);
      }
    }
  }

  private async renderBlock(block: DocumentRenderBlock): Promise<void> {
    switch (block.type) {
      case 'cover': {
        const title =
          block.title?.trim() ||
          resolveStructuredMetaTitle(this.structured) ||
          'Document';
        const subtitle = block.subtitle?.trim() || '';
        const bgUrl = block.assetId
          ? resolveAssetUrl(this.spec, block.assetId)
          : this.spec.page.backgroundImage;
        if (bgUrl) {
          const buf = await fetchImageBuffer(bgUrl);
          if (buf) {
            try {
              this.doc.image(buf, 0, 0, { width: this.doc.page.width, height: this.doc.page.height });
            } catch {
              /* ignore bad image */
            }
          }
        } else {
          this.doc.rect(0, 0, this.doc.page.width, this.doc.page.height).fill(this.colors.background);
        }
        this.doc.y = this.doc.page.height * 0.28;
        this.writeText(title, { size: 28, color: this.colors.primary, align: 'center', gap: 0.3 });
        if (subtitle) {
          this.writeText(subtitle, { size: 14, color: this.colors.muted, align: 'center', gap: 0.5 });
        }
        const profileUrl = resolveAssetUrl(this.spec, 'profile_photo');
        if (profileUrl) {
          const buf = await fetchImageBuffer(profileUrl);
          if (buf) {
            try {
              const size = 96;
              const x = (this.doc.page.width - size) / 2;
              this.doc.image(buf, x, this.doc.y, { width: size, height: size });
              this.doc.y += size + 12;
            } catch {
              /* ignore */
            }
          }
        }
        this.doc.addPage();
        return;
      }
      case 'toc': {
        this.pendingToc = true;
        this.writeText('目录', { size: 18, color: this.colors.primary, gap: 0.3 });
        const depth = block.depth ?? 2;
        const entries = this.tocEntries.slice(0, 40);
        if (entries.length === 0) {
          const tokens = marked.lexer(normalizeMarkdownForPdf(this.markdown), { gfm: true });
          for (const token of tokens) {
            if (token.type !== 'heading') continue;
            const heading = token as Tokens.Heading;
            if (heading.depth > depth) continue;
            const text = inlineToPlain(heading.tokens);
            if (text) entries.push({ title: text, page: 0 });
          }
        }
        for (const entry of entries) {
          this.writeText(`${entry.title}${entry.page ? `  ·  ${entry.page}` : ''}`, {
            size: 11,
            color: this.colors.text,
            gap: 0.08,
          });
        }
        this.pendingToc = false;
        this.doc.moveDown(0.4);
        return;
      }
      case 'section': {
        const title = block.title?.trim() || 'Section';
        this.writeText(title, { size: 16, color: this.colors.primary, gap: 0.15 });
        const body = resolveBinding(block.contentBinding, this.markdown, this.structured);
        if (body) this.renderMarkdownChunk(body);
        return;
      }
      case 'markdown': {
        const body = resolveBinding(block.contentBinding ?? 'markdown', this.markdown, this.structured);
        if (body) this.renderMarkdownChunk(body);
        return;
      }
      case 'highlights': {
        const items =
          block.items?.length ? block.items : resolveStructuredHighlights(this.structured);
        if (!items.length) return;
        this.writeText('亮点', { size: 14, color: this.colors.secondary, gap: 0.1 });
        for (const item of items.slice(0, 12)) {
          this.writeText(`• ${item}`, { size: 10.5, gap: 0.05 });
        }
        this.doc.moveDown(0.2);
        return;
      }
      case 'image': {
        const url = block.assetId ? resolveAssetUrl(this.spec, block.assetId) : undefined;
        if (!url) return;
        const buf = await fetchImageBuffer(url);
        if (!buf) return;
        try {
          const maxW = this.contentWidth * 0.55;
          this.doc.image(buf, this.marginLeft, this.doc.y, { width: maxW });
          this.doc.y += maxW * 0.75;
        } catch {
          /* ignore */
        }
        return;
      }
      case 'twoColumn': {
        const leftBlocks = block.left ?? [];
        const rightBlocks = block.right ?? [];
        const startY = this.doc.y;
        const colWidth = (this.contentWidth - 16) / 2;
        for (const child of leftBlocks) {
          await this.renderBlock(child);
        }
        const leftEndY = this.doc.y;
        this.doc.y = startY;
        const savedMargin = this.marginLeft;
        (this as { marginLeft: number }).marginLeft = savedMargin + colWidth + 16;
        for (const child of rightBlocks) {
          await this.renderBlock(child);
        }
        (this as { marginLeft: number }).marginLeft = savedMargin;
        this.doc.y = Math.max(leftEndY, this.doc.y);
        return;
      }
      case 'spacer': {
        this.doc.moveDown(Math.max(0.2, (block.height ?? 24) / 24));
        return;
      }
      default:
        return;
    }
  }

  async renderAll(blocks: DocumentRenderBlock[]): Promise<void> {
    const coverIndex = blocks.findIndex((b) => b.type === 'cover');
    const tocIndex = blocks.findIndex((b) => b.type === 'toc');
    const ordered =
      coverIndex >= 0
        ? [
            blocks[coverIndex],
            ...blocks.filter((_, i) => i !== coverIndex && i !== tocIndex),
            ...(tocIndex >= 0 ? [blocks[tocIndex]] : []),
          ]
        : blocks;

    for (const block of ordered) {
      await this.renderBlock(block);
    }
  }
}

export async function renderSpecToPdf(
  spec: DocumentRenderSpecV1,
  markdown: string,
  structured?: unknown
): Promise<Buffer> {
  const margin = spec.page.margin ?? [48, 48, 48, 48];
  const pageSize = spec.page.size === 'Letter' ? 'LETTER' : 'A4';

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: pageSize,
      margins: { top: margin[0], bottom: margin[2], left: margin[3], right: margin[1] },
      autoFirstPage: true,
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const marginLeft = doc.page.margins.left;
    const contentWidth = doc.page.width - marginLeft - doc.page.margins.right;
    const renderer = new SpecPdfRenderer(doc, spec, markdown, structured, marginLeft, contentWidth);

    renderer
      .renderAll(spec.blocks)
      .then(() => doc.end())
      .catch(reject);
  });
}
