/**
 * 文档格式化器
 * 将生成的文本转换为不同格式（Markdown、TXT、PDF）
 */

import { renderMarkdownToPdf } from './markdown-pdf-renderer';
import { normalizeMarkdownForPdf } from './markdown-normalize';

export type StorageFormat = 'markdown' | 'txt' | 'pdf' | 'md' | 'json' | 'csv';

/**
 * 格式化文档为 Markdown
 */
export function formatToMarkdown(
  text: string,
  title?: string,
  metadata?: Record<string, any>
): string {
  let markdown = '';

  // 添加标题
  if (title) {
    markdown += `# ${title}\n\n`;
  }

  // 不添加技术性元数据（writing_type、enable_markdown、prompt 等）
  // 只保留用户相关的元数据（如 author、tags 等），但暂时不显示任何元数据
  // 如果需要显示元数据，可以在这里过滤掉技术性字段：
  // const userMetadata = metadata ? Object.fromEntries(
  //   Object.entries(metadata).filter(([key]) => 
  //     !['writing_type', 'enable_markdown', 'prompt', 'source', 'format', 'wordCount', 'fileSize'].includes(key)
  //   )
  // ) : undefined;

  // 添加正文
  markdown += text;

  return markdown;
}

/**
 * 格式化文档为 TXT
 */
export function formatToTxt(
  text: string,
  title?: string,
  metadata?: Record<string, any>
): string {
  let txt = '';

  // 添加标题
  if (title) {
    txt += `${title}\n`;
    txt += '='.repeat(title.length) + '\n\n';
  }

  // 不添加技术性元数据（writing_type、enable_markdown、prompt 等）
  // 只保留用户相关的元数据，但暂时不显示任何元数据

  // 添加正文
  txt += text;

  return txt;
}

/**
 * 格式化文档为 JSON
 */
export function formatToJson(
  text: string,
  title?: string,
  metadata?: Record<string, any>
): string {
  // 如果文本已经是 JSON 格式，直接返回
  try {
    JSON.parse(text);
    return text;
  } catch {
    // 如果不是有效的 JSON，尝试构建 JSON 对象
    const jsonObj: Record<string, any> = {};
    if (title) {
      jsonObj.title = title;
    }
    jsonObj.content = text;
    if (metadata) {
      Object.assign(jsonObj, metadata);
    }
    return JSON.stringify(jsonObj, null, 2);
  }
}

/**
 * 格式化文档为 CSV（纯文本按行输出，若已是 CSV 则原样返回）
 */
export function formatToCsv(text: string, title?: string): string {
  const trimmed = text.trim();
  if (trimmed.includes(',') && trimmed.includes('\n')) {
    return text;
  }
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length <= 1) {
    const header = title ? `"${title.replace(/"/g, '""')}"` : '"content"';
    const body = `"${text.replace(/"/g, '""')}"`;
    return `${header}\n${body}`;
  }
  return lines.map((line) => `"${line.replace(/"/g, '""')}"`).join('\n');
}

export async function formatToPdf(text: string, title?: string): Promise<Buffer> {
  let markdown = normalizeMarkdownForPdf(text);
  if (title?.trim() && !/^#\s+/m.test(markdown.slice(0, 200))) {
    markdown = `# ${title.trim()}\n\n${markdown}`;
  }
  return renderMarkdownToPdf(markdown);
}

/**
 * 根据格式类型格式化文档
 */
export async function formatDocument(
  text: string,
  format: StorageFormat,
  title?: string,
  metadata?: Record<string, any>
): Promise<string | Buffer> {
  switch (format) {
    case 'markdown':
    case 'md':
      return formatToMarkdown(text, title, metadata);
    case 'txt':
      return formatToTxt(text, title, metadata);
    case 'json':
      return formatToJson(text, title, metadata);
    case 'csv':
      return formatToCsv(text, title);
    case 'pdf':
      return await formatToPdf(text, title, metadata);
    default:
      // 默认使用 Markdown
      return formatToMarkdown(text, title, metadata);
  }
}

/**
 * 获取文件扩展名
 */
export function getFileExtension(format: StorageFormat): string {
  switch (format) {
    case 'markdown':
    case 'md':
      return 'md';
    case 'txt':
      return 'txt';
    case 'json':
      return 'json';
    case 'csv':
      return 'csv';
    case 'pdf':
      return 'pdf';
    default:
      return 'md';
  }
}

/**
 * 获取 MIME 类型
 */
export function getMimeType(format: StorageFormat): string {
  switch (format) {
    case 'markdown':
    case 'md':
      return 'text/markdown';
    case 'txt':
      return 'text/plain';
    case 'json':
      return 'application/json';
    case 'csv':
      return 'text/csv';
    case 'pdf':
      return 'application/pdf';
    default:
      return 'text/markdown';
  }
}

