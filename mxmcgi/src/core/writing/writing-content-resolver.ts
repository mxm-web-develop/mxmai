import { RepositoryFactory } from '@mxmai/mxmdata';
import { taskManager } from '../../task/task-manager';
import { looksLikeMarkdown } from './markdown-normalize';

export type WritingContentSourceFormat = 'markdown' | 'txt' | 'pdf' | 'json' | string;

export type PdfStorageRef = {
  bucket?: string;
  key?: string;
  url?: string;
};

export interface ResolvedWritingContent {
  text: string;
  sourceFormat: WritingContentSourceFormat;
  /** 缓存 PDF（sidecar / 历史纯 PDF）；预览优先用此 buffer，不做实时转换 */
  rawPdfBuffer?: Buffer;
  /** 缓存 PPTX sidecar；导出用，不做实时重编译 */
  rawPptxBuffer?: Buffer;
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

function readPdfStorageRef(taskMetadata: Record<string, unknown>): PdfStorageRef | undefined {
  const raw = taskMetadata.pdfStorage;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const bucket = typeof o.bucket === 'string' ? o.bucket : undefined;
  const key = typeof o.key === 'string' ? o.key : undefined;
  if (!bucket || !key) return undefined;
  return {
    bucket,
    key,
    url: typeof o.url === 'string' ? o.url : undefined,
  };
}

function readPresentationStorageRef(taskMetadata: Record<string, unknown>): PdfStorageRef | undefined {
  const raw = taskMetadata.presentationStorage;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const bucket = typeof o.bucket === 'string' ? o.bucket : undefined;
  const key = typeof o.key === 'string' ? o.key : undefined;
  if (!bucket || !key) return undefined;
  return {
    bucket,
    key,
    url: typeof o.url === 'string' ? o.url : undefined,
  };
}

export type WritingPdfStreamTarget = {
  bucket: string;
  key: string;
  filename: string;
};

function assertWritingTaskOwner(task: { metadata?: { userId?: string } }, userId: string): void {
  if (task.metadata?.userId && task.metadata.userId !== userId) {
    throw Object.assign(new Error('Forbidden: You can only access your own media'), { statusCode: 403 });
  }
}

/**
 * 定位可流式预览的缓存 PDF（sidecar 或主存 PDF），不下载正文。
 * 供 GET /media/writing/:taskId 做 Range/stream，避免 Node 全量缓冲。
 */
export async function locateWritingCachedPdf(
  taskId: string,
  userId: string
): Promise<WritingPdfStreamTarget | null> {
  const { task } = await taskManager.getTask(taskId);
  assertWritingTaskOwner(task, userId);

  const taskMetadata = (task.result?.metadata || task.metadata || {}) as Record<string, unknown>;
  if (taskMetadata.pdfRenderStatus === 'failed') {
    return null;
  }

  const pdfRef = readPdfStorageRef(taskMetadata);
  if (pdfRef?.bucket && pdfRef.key) {
    return {
      bucket: pdfRef.bucket,
      key: pdfRef.key,
      filename: pdfRef.key.split('/').pop() || 'content.pdf',
    };
  }

  const storageInfo = task.result?.storageInfo as
    | { bucket?: string; key?: string; keys?: string[] }
    | undefined;
  if (!storageInfo?.bucket) return null;

  let key: string | undefined;
  if (storageInfo.keys && Array.isArray(storageInfo.keys) && storageInfo.keys.length > 0) {
    key = storageInfo.keys[0];
  } else if (storageInfo.key && typeof storageInfo.key === 'string') {
    key = storageInfo.key;
  }
  if (!key || !key.toLowerCase().endsWith('.pdf')) return null;

  return {
    bucket: storageInfo.bucket,
    key,
    filename: key.split('/').pop() || 'content.pdf',
  };
}

export type WritingPptxStreamTarget = WritingPdfStreamTarget;

/**
 * 定位可流式预览的 PPTX sidecar。
 * 演示文稿业务优先走此路径（无 PDF 时）。
 */
export async function locateWritingCachedPptx(
  taskId: string,
  userId: string
): Promise<WritingPptxStreamTarget | null> {
  const { task } = await taskManager.getTask(taskId);
  assertWritingTaskOwner(task, userId);

  const taskMetadata = (task.result?.metadata || task.metadata || {}) as Record<string, unknown>;
  if (taskMetadata.presentationRenderStatus === 'failed') {
    return null;
  }

  const pptxRef = readPresentationStorageRef(taskMetadata);
  if (!pptxRef?.bucket || !pptxRef.key) return null;

  return {
    bucket: pptxRef.bucket,
    key: pptxRef.key,
    filename: pptxRef.key.split('/').pop() || 'deck.pptx',
  };
}

/**
 * 加载写作任务正文（不改变存储）；供 media 预览与 export 共用。
 *
 * 阅读：有 pdfStorage 缓存则直接返回 PDF buffer（不实时转）。
 * 引入：resolved.text 始终尽量保留 Markdown 源。
 * 预览流式路径请优先用 locateWritingCachedPdf + streamStorageObjectToResponse。
 */
export async function resolveWritingTaskContent(
  taskId: string,
  userId: string
): Promise<ResolvedWritingContent> {
  const { task } = await taskManager.getTask(taskId);

  assertWritingTaskOwner(task, userId);

  const storageInfo = task.result?.storageInfo as
    | { bucket?: string; key?: string; keys?: string[] }
    | undefined;
  const taskMetadata = (task.result?.metadata || task.metadata || {}) as Record<string, unknown>;
  let markdownSource = extractMarkdownSource(taskMetadata);
  const pdfRef = readPdfStorageRef(taskMetadata);
  const pptxRef = readPresentationStorageRef(taskMetadata);
  const storageRepo = RepositoryFactory.createStorageRepository();

  let rawPptxBuffer: Buffer | undefined;
  if (pptxRef?.bucket && pptxRef.key && taskMetadata.presentationRenderStatus !== 'failed') {
    try {
      const pptxBuf = await storageRepo.downloadFile(pptxRef.bucket, pptxRef.key);
      if (pptxBuf?.length >= 4 && pptxBuf[0] === 0x50 && pptxBuf[1] === 0x4b) {
        rawPptxBuffer = pptxBuf;
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[WritingContent] presentationStorage 读取失败: ${msg}`);
    }
  }

  // 1) sidecar PDF 缓存优先（写作模块阅读 / 导出）
  if (pdfRef?.bucket && pdfRef.key) {
    try {
      const pdfBuf = await storageRepo.downloadFile(pdfRef.bucket, pdfRef.key);
      if (isPdfBuffer(pdfBuf)) {
        // 若主存仍是 md，补齐 text
        if (!markdownSource && storageInfo?.bucket && storageInfo.key && !storageInfo.key.endsWith('.pdf')) {
          try {
            const mdBuf = await storageRepo.downloadFile(storageInfo.bucket, storageInfo.key);
            const asText = mdBuf.toString('utf-8').trim();
            if (asText && !asText.startsWith('%PDF')) markdownSource = asText;
          } catch {
            /* ignore */
          }
        }
        return {
          text: markdownSource ?? '',
          sourceFormat: markdownSource ? 'markdown' : 'pdf',
          rawPdfBuffer: pdfBuf,
          rawPptxBuffer,
          suggestedFilename: pdfRef.key.split('/').pop() || 'content.pdf',
        };
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[WritingContent] pdfStorage 读取失败，回退主存: ${msg}`);
    }
  }

  // 2) 主 storageInfo
  if (storageInfo?.bucket) {
    let key: string | undefined;
    if (storageInfo.keys && Array.isArray(storageInfo.keys) && storageInfo.keys.length > 0) {
      key = storageInfo.keys[0];
    } else if (storageInfo.key && typeof storageInfo.key === 'string') {
      key = storageInfo.key;
    }

    if (key) {
      try {
        const fileBuffer = await storageRepo.downloadFile(storageInfo.bucket, key);
        const baseName = key.split('/').pop() || 'content';

        if (key.endsWith('.pdf')) {
          // 历史：主存即为 PDF。有 markdown 源时仍返回 text 供引入；预览用已存 PDF（不实时重渲）
          if (isPdfBuffer(fileBuffer)) {
            return {
              text: markdownSource ?? '',
              sourceFormat: 'pdf',
              rawPdfBuffer: fileBuffer,
              rawPptxBuffer,
              suggestedFilename: baseName,
            };
          }
          const asText = fileBuffer.toString('utf-8').trim();
          if (looksLikeMarkdown(asText)) {
            return {
              text: asText,
              sourceFormat: 'markdown',
              rawPptxBuffer,
              suggestedFilename: baseName.replace(/\.pdf$/i, '.md'),
            };
          }
        }

        const text = fileBuffer.toString('utf-8');
        const format =
          key.endsWith('.md') || key.endsWith('.markdown')
            ? 'markdown'
            : key.endsWith('.json')
              ? 'json'
              : key.endsWith('.csv')
                ? 'csv'
                : 'txt';
        return {
          text,
          sourceFormat: format,
          rawPptxBuffer,
          suggestedFilename: baseName,
        };
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(`[WritingContent] MinIO 读取失败，回退 metadata: ${msg}`);
      }
    }
  }

  // 3) metadata 文本
  if (markdownSource) {
    const format = String(taskMetadata.format || taskMetadata.storage_form || 'markdown');
    return {
      text: markdownSource,
      sourceFormat: format === 'pdf' ? 'markdown' : format,
      rawPptxBuffer,
      suggestedFilename: `content.${extensionForFormat(format === 'pdf' ? 'markdown' : format)}`,
    };
  }

  const formattedContent = taskMetadata.formattedContent;
  if (typeof formattedContent === 'string' && formattedContent.length > 0) {
    const format = String(taskMetadata.format || 'markdown');
    const text = decodeFormattedContent(formattedContent);
    return {
      text,
      sourceFormat: format,
      rawPptxBuffer,
      suggestedFilename: `content.${extensionForFormat(format)}`,
    };
  }

  if (rawPptxBuffer) {
    return {
      text: '',
      sourceFormat: 'pptx',
      rawPptxBuffer,
      suggestedFilename: pptxRef?.key?.split('/').pop() || 'deck.pptx',
    };
  }

  throw Object.assign(new Error('No content found for this task'), { statusCode: 404 });
}
