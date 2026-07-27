import { formatToPdf } from './document-formatter';
import type { ResolvedWritingContent } from './writing-content-resolver';
import type { DocumentRenderSpecV1 } from '../document-render/types';
import { renderDocumentPdfBuffer } from '../document-render/render-document-pdf';

export type WritingExportFormat = 'pdf' | 'markdown' | 'md' | 'txt';

export interface WritingExportResult {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

function sanitizeFilenameBase(name: string): string {
  const trimmed = name.trim().slice(0, 80) || 'writing';
  return trimmed.replace(/[/\\?%*:|"<>]/g, '_');
}

/**
 * 按请求格式生成下载用 Buffer（不写入 MinIO）
 */
export async function buildWritingExport(
  content: ResolvedWritingContent,
  format: WritingExportFormat,
  options?: {
    title?: string;
    taskId?: string;
    documentRenderSpec?: DocumentRenderSpecV1;
    pdfRenderer?: 'markdown' | 'styled' | 'html';
    designStyle?: string;
    structured?: unknown;
  }
): Promise<WritingExportResult> {
  const base =
    sanitizeFilenameBase(options?.title || '') ||
    sanitizeFilenameBase(content.suggestedFilename.replace(/\.[^.]+$/, '')) ||
    options?.taskId ||
    'writing';

  if (format === 'pdf') {
    const spec = options?.documentRenderSpec as DocumentRenderSpecV1 | undefined;
    const renderer =
      (options?.pdfRenderer as 'markdown' | 'styled' | 'html' | undefined) ?? 'styled';
    if (content.text?.trim() && spec && typeof spec === 'object') {
      const rendered = await renderDocumentPdfBuffer({
        context: {
          markdown: content.text,
          structured: options?.structured,
          renderer,
          designStyle: String(options?.designStyle ?? spec.theme?.designStyle ?? 'modern_sidebar'),
          assets: Array.isArray(spec.assets) ? spec.assets : [],
        },
        spec,
        title: options?.title,
      });
      return {
        buffer: rendered.buffer,
        contentType: 'application/pdf',
        filename: `${base}.pdf`,
      };
    }
    if (content.text?.trim()) {
      const pdf = await formatToPdf(content.text, options?.title);
      return {
        buffer: pdf,
        contentType: 'application/pdf',
        filename: `${base}.pdf`,
      };
    }
    if (content.rawPdfBuffer && content.rawPdfBuffer.length > 0) {
      return {
        buffer: content.rawPdfBuffer,
        contentType: 'application/pdf',
        filename: `${base}.pdf`,
      };
    }
    const pdf = await formatToPdf(content.text, options?.title);
    return {
      buffer: pdf,
      contentType: 'application/pdf',
      filename: `${base}.pdf`,
    };
  }

  const ext = format === 'txt' ? 'txt' : 'md';
  const mime =
    format === 'txt' ? 'text/plain; charset=utf-8' : 'text/markdown; charset=utf-8';
  return {
    buffer: Buffer.from(content.text, 'utf-8'),
    contentType: mime,
    filename: `${base}.${ext}`,
  };
}
