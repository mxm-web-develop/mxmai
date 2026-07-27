import { RepositoryFactory } from '@mxmai/mxmdata';
import { taskManager } from '../../task/task-manager';
import { formatToPdf } from './document-formatter';
import { looksLikeMarkdown } from './markdown-normalize';

export type WritingContentSourceFormat = 'markdown' | 'txt' | 'pdf' | 'json' | string;

export interface ResolvedWritingContent {
  text: string;
  sourceFormat: WritingContentSourceFormat;
  /** 若 MinIO 中已是 PDF，转换接口可直接回传 */
  rawPdfBuffer?: Buffer;
  suggestedFilename: string;
}

function decodeFormattedContent(formattedContent: string): string {
  const cleanedContent = formattedContent.replace(/\s/g, '');
  const isBase64 =
    formattedContent.length > 100 &&
    cleanedContent.length > 0 &&
    /^[A-Za-z0-9+/=]+$/.test(cleanedContent) &&
    cleanedContent.length % 4 === 0 &&
    !formattedContent.includes('#') &&
    !formattedContent.includes('*') &&
    !formattedContent.includes('`') &&
    !formattedContent.includes('[') &&
    !formattedContent.includes('---');

  if (!isBase64) {
    return formattedContent;
  }
  try {
    const decodedStr = Buffer.from(formattedContent, 'base64').toString('utf-8');
    if (decodedStr && decodedStr.length > 0 && /[\x20-\x7E\u4e00-\u9fa5]/.test(decodedStr)) {
      return decodedStr;
    }
  } catch {
    /* fall through */
  }
  return formattedContent;
}

function extensionForFormat(format: string): string {
  if (format === 'markdown' || format === 'md') return 'md';
  if (format === 'txt') return 'txt';
  if (format === 'pdf') return 'pdf';
  if (format === 'csv') return 'csv';
  if (format === 'json') return 'json';
  return 'txt';
}

function extractMarkdownSource(taskMetadata: Record<string, unknown>): string | undefined {
  const metaText = taskMetadata.text;
  if (typeof metaText === 'string' && metaText.trim()) {
    return metaText.trim();
  }

  const formattedContent = taskMetadata.formattedContent;
  if (typeof formattedContent === 'string' && formattedContent.length > 0) {
    const decoded = decodeFormattedContent(formattedContent).trim();
    if (decoded && !decoded.startsWith('%PDF') && looksLikeMarkdown(decoded)) {
      return decoded;
    }
  }

  return undefined;
}

function isPdfBuffer(buf: Buffer): boolean {
  return buf.length >= 4 && buf.subarray(0, 4).toString('ascii') === '%PDF';
}

async function renderPdfFromMarkdown(
  markdown: string,
  options?: { title?: string; filename?: string }
): Promise<ResolvedWritingContent> {
  const title = options?.title;
  const rawPdfBuffer = await formatToPdf(markdown, title);
  return {
    text: markdown,
    sourceFormat: 'pdf',
    rawPdfBuffer,
    suggestedFilename: options?.filename ?? 'content.pdf',
  };
}

/**
 * 加载写作任务正文（不改变存储）；供 media 预览与 export 共用。
 */
export async function resolveWritingTaskContent(
  taskId: string,
  userId: string
): Promise<ResolvedWritingContent> {
  const { task } = await taskManager.getTask(taskId);

  if (task.metadata?.userId && task.metadata.userId !== userId) {
    throw Object.assign(new Error('Forbidden: You can only access your own media'), { statusCode: 403 });
  }

  const storageInfo = task.result?.storageInfo as
    | { bucket?: string; key?: string; keys?: string[] }
    | undefined;
  const taskMetadata = (task.result?.metadata || task.metadata || {}) as Record<string, unknown>;
  const title = typeof taskMetadata.title === 'string' ? taskMetadata.title : undefined;
  const markdownSource = extractMarkdownSource(taskMetadata);

  if (storageInfo?.bucket) {
    let key: string | undefined;
    if (storageInfo.keys && Array.isArray(storageInfo.keys) && storageInfo.keys.length > 0) {
      key = storageInfo.keys[0];
    } else if (storageInfo.key && typeof storageInfo.key === 'string') {
      key = storageInfo.key;
    }

    if (key) {
      const storageRepo = RepositoryFactory.createStorageRepository();
      try {
        const fileBuffer = await storageRepo.downloadFile(storageInfo.bucket, key);
        const baseName = key.split('/').pop() || 'content';

        if (key.endsWith('.pdf')) {
          // 优先用 metadata 中的 Markdown 重新排版 PDF（修复历史未渲染 PDF / 假 PDF）
          if (markdownSource) {
            return renderPdfFromMarkdown(markdownSource, { title, filename: baseName });
          }

          if (!isPdfBuffer(fileBuffer)) {
            const asText = fileBuffer.toString('utf-8').trim();
            if (looksLikeMarkdown(asText)) {
              return renderPdfFromMarkdown(asText, { title, filename: baseName });
            }
          }

          return {
            text: markdownSource ?? '',
            sourceFormat: 'pdf',
            rawPdfBuffer: fileBuffer,
            suggestedFilename: baseName,
          };
        }

        const text = fileBuffer.toString('utf-8');
        const format = key.endsWith('.md') || key.endsWith('.markdown') ? 'markdown' : 'txt';
        return {
          text,
          sourceFormat: format,
          suggestedFilename: baseName,
        };
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(`[WritingContent] MinIO 读取失败，回退 metadata: ${msg}`);
      }
    }
  }

  if (markdownSource) {
    const format = String(taskMetadata.format || taskMetadata.storage_form || 'markdown');
    if (format === 'pdf') {
      return renderPdfFromMarkdown(markdownSource, {
        title,
        filename: `content.${extensionForFormat(format)}`,
      });
    }
    return {
      text: markdownSource,
      sourceFormat: format,
      suggestedFilename: `content.${extensionForFormat(format)}`,
    };
  }

  const formattedContent = taskMetadata.formattedContent;
  if (typeof formattedContent === 'string' && formattedContent.length > 0) {
    const format = String(taskMetadata.format || 'markdown');
    const text = decodeFormattedContent(formattedContent);
    return {
      text,
      sourceFormat: format,
      suggestedFilename: `content.${extensionForFormat(format)}`,
    };
  }

  throw Object.assign(new Error('No content found for this task'), { statusCode: 404 });
}
