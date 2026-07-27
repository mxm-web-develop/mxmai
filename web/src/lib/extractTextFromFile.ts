import { extractTextFromPdfDocument, loadPdfDocument } from './pdfjs';

const TEXT_EXTENSIONS = new Set(['txt', 'md', 'markdown', 'csv', 'json', 'log', 'text']);

function extensionOf(file: File): string {
  const name = file.name.trim();
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : '';
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.onload = () => {
      const res = reader.result;
      if (typeof res === 'string') resolve(res);
      else reject(new Error('无法读取为文本'));
    };
    reader.readAsText(file, 'utf-8');
  });
}

async function readPdfAsText(file: File): Promise<string> {
  const doc = await loadPdfDocument(file);
  return extractTextFromPdfDocument(doc);
}

/** 从本地文本类文件提取纯文本（.txt / .md / .pdf 等） */
export async function extractTextFromFile(file: File): Promise<string> {
  const ext = extensionOf(file);
  const mime = (file.type || '').toLowerCase();

  if (mime === 'application/pdf' || ext === 'pdf') {
    return readPdfAsText(file);
  }

  if (mime.startsWith('text/') || TEXT_EXTENSIONS.has(ext)) {
    const text = (await readFileAsText(file)).trim();
    if (!text) throw new Error('文件内容为空');
    return text;
  }

  throw new Error(`暂不支持 .${ext || '未知'} 格式，请使用 .txt、.md 或 .pdf`);
}

export function isPdfFile(file: File): boolean {
  const ext = extensionOf(file);
  const mime = (file.type || '').toLowerCase();
  return mime === 'application/pdf' || ext === 'pdf';
}

export function isMarkdownFile(file: File): boolean {
  const ext = extensionOf(file);
  const mime = (file.type || '').toLowerCase();
  return ext === 'md' || ext === 'markdown' || mime === 'text/markdown';
}

export const DEFAULT_TEXT_FILE_ACCEPT = '.txt,.md,.markdown,.pdf,text/plain,text/markdown,application/pdf';
