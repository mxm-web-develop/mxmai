import type { DocumentRenderSpecV1 } from './types';
import {
  resolveAssetUrl,
  resolveBinding,
  resolveStructuredHighlights,
  resolveStructuredMetaTitle,
  resolveThemeColors,
} from './theme-registry';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function markdownToSimpleHtml(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const parts: string[] = [];
  let inList = false;

  const closeList = () => {
    if (inList) {
      parts.push('</ul>');
      inList = false;
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      closeList();
      continue;
    }
    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      parts.push(`<h${level}>${escapeHtml(heading[2])}</h${level}>`);
      continue;
    }
    if (/^[-*]\s+/.test(trimmed)) {
      if (!inList) {
        parts.push('<ul>');
        inList = true;
      }
      parts.push(`<li>${escapeHtml(trimmed.replace(/^[-*]\s+/, ''))}</li>`);
      continue;
    }
    closeList();
    parts.push(`<p>${escapeHtml(trimmed)}</p>`);
  }
  closeList();
  return parts.join('\n');
}

function renderBlocksHtml(
  spec: DocumentRenderSpecV1,
  markdown: string,
  structured: unknown
): string {
  const colors = resolveThemeColors(spec);
  const chunks: string[] = [];

  for (const block of spec.blocks) {
    switch (block.type) {
      case 'cover': {
        const title =
          block.title?.trim() ||
          resolveStructuredMetaTitle(structured) ||
          'Document';
        const subtitle = block.subtitle?.trim() || '';
        const bg = block.assetId
          ? resolveAssetUrl(spec, block.assetId)
          : spec.page.backgroundImage;
        chunks.push(
          `<section class="cover" style="background:${colors.background};${bg ? `background-image:url('${escapeHtml(bg)}');background-size:cover;` : ''}">` +
            `<h1>${escapeHtml(title)}</h1>` +
            (subtitle ? `<p class="subtitle">${escapeHtml(subtitle)}</p>` : '') +
            `</section>`
        );
        break;
      }
      case 'toc':
        chunks.push('<section class="toc"><h2>目录</h2><ul>');
        for (const line of markdown.split('\n')) {
          const m = line.match(/^#{1,3}\s+(.*)$/);
          if (m) chunks.push(`<li>${escapeHtml(m[1])}</li>`);
        }
        chunks.push('</ul></section>');
        break;
      case 'section':
        chunks.push(
          `<section><h2>${escapeHtml(block.title ?? 'Section')}</h2>${markdownToSimpleHtml(
            resolveBinding(block.contentBinding, markdown, structured)
          )}</section>`
        );
        break;
      case 'markdown':
        chunks.push(
          `<section>${markdownToSimpleHtml(
            resolveBinding(block.contentBinding ?? 'markdown', markdown, structured)
          )}</section>`
        );
        break;
      case 'highlights': {
        const items = block.items?.length ? block.items : resolveStructuredHighlights(structured);
        chunks.push('<section class="highlights"><h3>亮点</h3><ul>');
        for (const item of items) {
          chunks.push(`<li>${escapeHtml(item)}</li>`);
        }
        chunks.push('</ul></section>');
        break;
      }
      case 'image': {
        const url = block.assetId ? resolveAssetUrl(spec, block.assetId) : undefined;
        if (url) chunks.push(`<figure><img src="${escapeHtml(url)}" alt="" /></figure>`);
        break;
      }
      case 'twoColumn':
        chunks.push('<div class="two-column"><div class="col">');
        for (const child of block.left ?? []) {
          chunks.push(renderBlocksHtml({ ...spec, blocks: [child] }, markdown, structured));
        }
        chunks.push('</div><div class="col">');
        for (const child of block.right ?? []) {
          chunks.push(renderBlocksHtml({ ...spec, blocks: [child] }, markdown, structured));
        }
        chunks.push('</div></div>');
        break;
      case 'spacer':
        chunks.push(`<div style="height:${block.height ?? 24}px"></div>`);
        break;
      default:
        break;
    }
  }
  return chunks.join('\n');
}

function buildHtmlDocument(spec: DocumentRenderSpecV1, body: string): string {
  const colors = resolveThemeColors(spec);
  const extra = spec.layoutHtml?.trim();
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: ${spec.page.size}; margin: ${(spec.page.margin ?? [48, 48, 48, 48]).map((n) => `${n}px`).join(' ')}; }
    body { font-family: "Noto Sans SC", "PingFang SC", sans-serif; color: ${colors.text}; background: ${colors.background}; line-height: 1.55; font-size: 11pt; }
    h1,h2,h3 { color: ${colors.primary}; }
    .cover { min-height: 90vh; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; page-break-after: always; }
    .cover h1 { font-size: 28pt; }
    .subtitle { color: ${colors.muted}; font-size: 14pt; }
    .toc { page-break-after: always; }
    .two-column { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    img { max-width: 55%; height: auto; }
    section { margin-bottom: 16px; }
    ul { padding-left: 1.2em; }
  </style>
</head>
<body>
${body}
${extra ? `<div class="layout-extra">${extra}</div>` : ''}
</body>
</html>`;
}

let htmlRenderActive = 0;

function parseMaxConcurrent(): number {
  const raw = process.env.DOCUMENT_PDF_HTML_MAX_CONCURRENT;
  const n = raw ? Number(raw) : 2;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 2;
}

export async function renderHtmlPrintToPdf(
  spec: DocumentRenderSpecV1,
  markdown: string,
  structured?: unknown
): Promise<Buffer> {
  if (process.env.DOCUMENT_PDF_HTML_ENABLED === 'false') {
    throw new Error('HTML PDF 渲染已禁用（DOCUMENT_PDF_HTML_ENABLED=false）');
  }

  const maxConcurrent = parseMaxConcurrent();
  while (htmlRenderActive >= maxConcurrent) {
    await new Promise((r) => setTimeout(r, 200));
  }
  htmlRenderActive += 1;

  try {
    let playwright: typeof import('playwright');
    try {
      playwright = await import('playwright');
    } catch {
      throw new Error(
        'HTML PDF 需要 playwright 依赖，请在 mxmcgi 安装 playwright 并执行 playwright install chromium'
      );
    }

    const body = renderBlocksHtml(spec, markdown, structured ?? null);
    const html = buildHtmlDocument(spec, body);
    const browser = await playwright.chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle' });
      const pdf = await page.pdf({
        format: spec.page.size === 'Letter' ? 'Letter' : 'A4',
        printBackground: true,
      });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  } finally {
    htmlRenderActive -= 1;
  }
}
