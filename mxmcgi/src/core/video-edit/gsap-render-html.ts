import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { findRepoRoot } from '../utils/repo-root';

const GSAP_SHARED_FILES = [
  'gsap-loader.js',
  'demo-helpers.js',
  'demo-base.js',
  'seek-render.js',
] as const;

export function resolveGsapSharedDir(): string {
  const root = findRepoRoot();
  const sharedDir = join(root, 'artifacts/gsap-playground/_shared');
  if (!existsSync(sharedDir)) {
    throw new Error(`GSAP shared assets not found: ${sharedDir}`);
  }
  return sharedDir;
}

export function isFullHtmlDocument(html: string): boolean {
  const t = html.trim().toLowerCase();
  return t.startsWith('<!doctype') || t.startsWith('<html');
}

/** Playwright 用内联脚本；浏览器预览用 /gsap-shared/ */
export function resolveGsapSharedAssetBase(opts?: { forBrowserOrigin?: boolean }): string {
  if (opts?.forBrowserOrigin) {
    return '/gsap-shared/';
  }
  return `${pathToFileURL(resolveGsapSharedDir()).href.replace(/\/$/, '')}/`;
}

export function inlineGsapSharedAssets(html: string): string {
  const sharedDir = resolveGsapSharedDir();
  let out = html;
  for (const file of GSAP_SHARED_FILES) {
    const content = readFileSync(join(sharedDir, file), 'utf8');
    const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(
      `<script[^>]+src=["'][^"']*${escaped}["'][^>]*>\\s*</script>`,
      'gi'
    );
    out = out.replace(pattern, `<script>${content}</script>`);
  }
  const cssPath = join(sharedDir, 'demo-base.css');
  if (existsSync(cssPath)) {
    const css = readFileSync(cssPath, 'utf8');
    out = out.replace(
      /<link[^>]+href=["'][^"']*demo-base\.css["'][^>]*>/gi,
      `<style>${css}</style>`
    );
  }
  return out;
}

export function rewriteGsapSharedAssetPaths(html: string, sharedBase: string): string {
  return html
    .replace(/(?:\.\.\/)+_shared\//g, sharedBase)
    .replace(/\.\/_shared\//g, sharedBase);
}

export function injectGsapSeekBridge(html: string, duration: number): string {
  if (/\bwindow\.__seek\s*=/.test(html)) {
    return html;
  }
  const bridge = `<script data-mxm-seek-bridge="1">
(function(){
  function bridgeSeek(t){
    if(typeof window.__mxmSeek==='function'){
      var d=window.__mxmDuration||${duration};
      return window.__mxmSeek(Math.max(0,Math.min(1,t/d)));
    }
    if(typeof master!=='undefined'&&master&&typeof master.seek==='function'){
      master.seek(t,false);
      return t;
    }
    return t;
  }
  window.__seek=bridgeSeek;
  var tries=0;
  var poll=setInterval(function(){
    if(typeof window.__mxmSeek==='function'||(typeof master!=='undefined'&&master)){
      clearInterval(poll);
      window.__seek=bridgeSeek;
    }
    if(++tries>600) clearInterval(poll);
  },50);
})();
</script>`;
  if (html.includes('</body>')) {
    return html.replace('</body>', `${bridge}</body>`);
  }
  return `${html}${bridge}`;
}

/** Playwright 逐帧导出：铺满画幅，隐藏 playground 控件，放大正文 */
export const GSAP_VIDEO_EXPORT_CSS = `
html,body,.demo-root,.stage,.frame{width:100%!important;height:100%!important;max-width:none!important;margin:0!important;padding:0!important}
.frame{aspect-ratio:unset!important;border-radius:0!important;border:none!important;box-shadow:none!important;background:transparent!important}
.controls,.scene-counter{display:none!important}
.scene-panel{position:absolute!important;inset:0!important}
[data-mxm-render="storyboard"] .list .item{font-size:clamp(26px,2.6vw,44px)!important;line-height:1.35!important}
[data-mxm-render="storyboard"] .scene .kw{font-size:clamp(48px,5vw,88px)!important}
[data-mxm-render="storyboard"] .scene .num{font-size:clamp(64px,7vw,120px)!important}
[data-mxm-render="storyboard"] .scene .title{font-size:clamp(36px,3.6vw,64px)!important}
[data-mxm-render="storyboard"] .scene .line{font-size:clamp(22px,2.2vw,36px)!important}
`.trim();

export function injectGsapVideoExportStyles(html: string): string {
  if (html.includes('data-mxm-video-export="1"')) return html;
  const block = `<style data-mxm-video-export="1">${GSAP_VIDEO_EXPORT_CSS}</style>`;
  if (html.includes('</head>')) {
    return html.replace('</head>', `${block}</head>`);
  }
  return `${block}${html}`;
}

export function prepareGsapRenderDocument(html: string, duration: number): string {
  let doc = inlineGsapSharedAssets(html);
  doc = rewriteGsapSharedAssetPaths(doc, resolveGsapSharedAssetBase());
  doc = injectGsapVideoExportStyles(doc);
  doc = injectGsapSeekBridge(doc, duration);
  return doc;
}

export function prepareGsapPreviewDocument(html: string, duration?: number): string {
  const sharedBase = resolveGsapSharedAssetBase({ forBrowserOrigin: true });
  let doc = rewriteGsapSharedAssetPaths(html, sharedBase);
  doc = injectGsapSeekBridge(doc, duration ?? 10);
  return doc;
}

export function aspectToSize(aspectRatio?: string): { width: number; height: number } {
  if (aspectRatio === '9:16') return { width: 1080, height: 1920 };
  if (aspectRatio === '1:1') return { width: 1080, height: 1080 };
  return { width: 1920, height: 1080 };
}

export interface GsapSceneHtmlInput {
  html: string;
  gsapTimeline: string;
  gsapEase?: string;
  duration: number;
  aspectRatio?: string;
}

export function buildSceneHtml(body: GsapSceneHtmlInput): string {
  const { width, height } = aspectToSize(body.aspectRatio);
  const duration = body.duration;

  if (isFullHtmlDocument(body.html)) {
    return prepareGsapRenderDocument(body.html, duration);
  }

  const timeline = body.gsapTimeline.trim();
  const usesMaster = /\b(var\s+)?master\s*=/.test(timeline);
  const timelineBody = timeline
    .replace(/^tl\s*=\s*/i, '')
    .replace(/^gsap\.timeline\([^)]*\)\s*;?/i, '');

  const gsapBlock = usesMaster
    ? timeline
    : `const tl = gsap.timeline({ paused: true, defaults: { ease: '${body.gsapEase ?? 'power3.out'}' } });\n${timelineBody}`;

  const seekTarget = usesMaster ? 'master' : 'tl';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/gsap.min.js"></script>
<style>html,body{margin:0;padding:0;width:${width}px;height:${height}px;overflow:hidden;background:#09090e;}</style>
</head><body>
<div id="stage" style="width:${width}px;height:${height}px;position:relative;">${body.html}</div>
<script>
  ${gsapBlock}
  window.__seek = (t) => ${seekTarget}.seek(t, false);
  window.__duration = ${duration};
</script></body></html>`;
}
