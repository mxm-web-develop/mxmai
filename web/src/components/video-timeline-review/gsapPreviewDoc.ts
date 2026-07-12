/** GSAP 预览 iframe（GSAP 3.13 + SplitText，支持 storyboard 完整 HTML） */
export const GSAP_PREVIEW_SCRIPT_URL =
  'https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/gsap.min.js';
export const SPLITTEXT_PREVIEW_URL =
  'https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/SplitText.min.js';

function isFullHtmlDocument(html: string): boolean {
  const t = html.trim().toLowerCase();
  return t.startsWith('<!doctype') || t.startsWith('<html');
}

function rewriteGsapSharedAssetPaths(html: string): string {
  return html
    .replace(/(?:\.\.\/)+_shared\//g, '/gsap-shared/')
    .replace(/\.\/_shared\//g, '/gsap-shared/');
}

export function buildGsapPreviewSrcDoc(htmlContent: string, gsapTimeline?: string): string {
  const trimmed = htmlContent.trim();
  if (isFullHtmlDocument(trimmed)) {
    return rewriteGsapSharedAssetPaths(trimmed);
  }

  const timeline = gsapTimeline?.replace(/^tl\s*=\s*/i, '').replace(/^var\s+master\s*=\s*/i, '') ?? '';
  const usesSplit = timeline.includes('SplitText') || htmlContent.includes('split-chars');
  const usesMaster = /\b(var\s+)?master\s*=/.test(gsapTimeline ?? '');

  const timelineScript = usesMaster
    ? `${gsapTimeline ?? ''}`
    : `const tl=gsap.timeline({paused:true});${timeline}`;

  const playScript = usesMaster
    ? 'master.play(0);'
    : 'tl.play(0);';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><script src="${GSAP_PREVIEW_SCRIPT_URL}"></script>${
    usesSplit ? `<script src="${SPLITTEXT_PREVIEW_URL}"></script>` : ''
  }<style>html,body{margin:0;height:100%;background:#09090e;color:#fff;font-family:system-ui,sans-serif;overflow:hidden;}</style></head><body>${htmlContent}<script>try{${timelineScript};${playScript}}catch(e){console.error(e);}</script></body></html>`;
}
