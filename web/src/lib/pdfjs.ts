import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PDFDocumentProxy } from 'pdfjs-dist';

export type PdfDocumentSource = string | ArrayBuffer | Uint8Array | File | Blob;

let workerReady = false;

async function ensurePdfjs() {
  const pdfjs = await import('pdfjs-dist');
  if (!workerReady) {
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
    workerReady = true;
  }
  return pdfjs;
}

async function normalizeSource(
  source: PdfDocumentSource,
): Promise<{ data?: ArrayBuffer | Uint8Array; url?: string }> {
  if (typeof source === 'string') {
    // blob URL 经 worker 加载易失败，先拉取为 ArrayBuffer
    if (source.startsWith('blob:')) {
      const res = await fetch(source);
      if (!res.ok) throw new Error('PDF 读取失败');
      return { data: await res.arrayBuffer() };
    }
    return { url: source };
  }
  if (source instanceof File || source instanceof Blob) {
    return { data: await source.arrayBuffer() };
  }
  return { data: source };
}

/** 加载 PDF 文档（blob URL / ArrayBuffer / File） */
export async function loadPdfDocument(source: PdfDocumentSource): Promise<PDFDocumentProxy> {
  const pdfjs = await ensurePdfjs();
  const params = await normalizeSource(source);
  return pdfjs.getDocument(params).promise;
}

/** 从已加载文档提取纯文本 */
export async function extractTextFromPdfDocument(doc: PDFDocumentProxy): Promise<string> {
  const parts: string[] = [];

  for (let page = 1; page <= doc.numPages; page += 1) {
    const pageObj = await doc.getPage(page);
    const content = await pageObj.getTextContent();
    const line = content.items
      .map((item) => ('str' in item ? String(item.str) : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (line) parts.push(line);
  }

  const text = parts.join('\n\n').trim();
  if (!text) {
    throw new Error('PDF 中未识别到可提取文字，请换用可复制文本的 PDF 或直接粘贴');
  }
  return text;
}

/** 计算 canvas 渲染缩放：适应容器宽度 × 用户缩放系数 */
export function computePdfPageScale(
  containerWidth: number,
  viewportWidth: number,
  zoomFactor: number,
): number {
  if (containerWidth <= 0 || viewportWidth <= 0) return Math.max(0.1, zoomFactor);
  return (containerWidth / viewportWidth) * zoomFactor;
}

export const PDF_ZOOM_MIN = 0.75;
export const PDF_ZOOM_MAX = 1.5;
export const PDF_ZOOM_STEP = 0.1;

export function clampPdfZoom(zoom: number): number {
  return Math.min(PDF_ZOOM_MAX, Math.max(PDF_ZOOM_MIN, zoom));
}

/** 将 PDF 页渲染到 canvas（HiDPI 正确，不使用 transform 矩阵） */
export async function renderPdfPageToCanvas(
  page: Awaited<ReturnType<PDFDocumentProxy['getPage']>>,
  canvas: HTMLCanvasElement,
  containerWidth: number,
  zoom: number,
  onTask?: (task: { cancel: () => void }) => void,
): Promise<{ displayWidth: number; displayHeight: number }> {
  const baseViewport = page.getViewport({ scale: 1 });
  const displayScale = computePdfPageScale(containerWidth, baseViewport.width, zoom);
  const outputScale = Math.min(window.devicePixelRatio || 1, 2);
  const renderScale = displayScale * outputScale;
  const viewport = page.getViewport({ scale: renderScale });

  const displayWidth = Math.floor(viewport.width / outputScale);
  const displayHeight = Math.floor(viewport.height / outputScale);

  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.style.width = `${displayWidth}px`;
  canvas.style.height = `${displayHeight}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D 不可用');

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const task = page.render({ canvasContext: ctx, viewport });
  onTask?.(task);
  await task.promise;

  return { displayWidth, displayHeight };
}
