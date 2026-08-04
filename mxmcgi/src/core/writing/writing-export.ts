import { formatToPdf } from './document-formatter';
import type { ResolvedWritingContent } from './writing-content-resolver';
import type { DocumentRenderSpecV1 } from '../document-render/types';
import { renderDocumentPdfBuffer } from '../document-render/render-document-pdf';

export type WritingExportFormat = 'pdf' | 'markdown' | 'md' | 'txt' | 'pptx';

export interface WritingExportResult {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

function sanitizeFilenameBase(name: string): string {
  const trimmed = name.trim().slice(0, 80) || 'writing';
  return trimmed.replace(/[/\\?%*:|"<>]/g, '_');
}

function isPdfBuffer(buf: Buffer): boolean {
  return buf.length >= 4 && buf.subarray(0, 4).toString('ascii') === '%PDF';
}

function isPptxBuffer(buf: Buffer): boolean {
  return buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b;
}

/**
 * 按请求格式生成下载用 Buffer（不写入 MinIO）
 * PDF：优先 sidecar 缓存；无缓存时再从 Markdown 生成（仅下载，不用于预览）。
 * PPTX：仅从 presentationStorage sidecar 读取（不实时重编译）。
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

  if (format === 'pptx') {
    if (content.rawPptxBuffer && isPptxBuffer(content.rawPptxBuffer)) {
      return {
        buffer: content.rawPptxBuffer,
        contentType:
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        filename: `${base}.pptx`,
      };
    }
    throw new Error('无可导出的 PPTX（尚未生成或生成失败）');
  }

  if (format === 'pdf') {
    const spec = options?.documentRenderSpec as DocumentRenderSpecV1 | undefined;
    if (content.rawPdfBuffer && isPdfBuffer(content.rawPdfBuffer) && !spec) {
      return {
        buffer: content.rawPdfBuffer,
        contentType: 'application/pdf',
        filename: `${base}.pdf`,
      };
    }

    const renderer =
      (options?.pdfRenderer as 'markdown' | 'styled' | 'html' | undefined) ?? 'markdown';
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
        pdfOptions: { includeCover: true, includeToc: true },
      });
      return {
        buffer: rendered.buffer,
        contentType: 'application/pdf',
        filename: `${base}.pdf`,
      };
    }
    if (content.rawPdfBuffer && isPdfBuffer(content.rawPdfBuffer)) {
      return {
        buffer: content.rawPdfBuffer,
        contentType: 'application/pdf',
        filename: `${base}.pdf`,
      };
    }
    if (content.text?.trim()) {
      const pdf = await formatToPdf(content.text, options?.title, {
        includeCover: true,
        includeToc: true,
      });
      return {
        buffer: pdf,
        contentType: 'application/pdf',
        filename: `${base}.pdf`,
      };
    }
    throw new Error('无可导出的 PDF 内容');
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
