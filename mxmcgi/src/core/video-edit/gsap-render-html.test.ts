import { describe, expect, it } from 'vitest';
import {
  buildSceneHtml,
  injectGsapSeekBridge,
  isFullHtmlDocument,
  prepareGsapRenderDocument,
  rewriteGsapSharedAssetPaths,
} from './gsap-render-html';

describe('gsap-render-html', () => {
  it('detects full HTML documents', () => {
    expect(isFullHtmlDocument('<!doctype html><html></html>')).toBe(true);
    expect(isFullHtmlDocument('<div>panel</div>')).toBe(false);
  });

  it('rewrites shared asset paths', () => {
    const out = rewriteGsapSharedAssetPaths(
      '<script src="../../_shared/gsap-loader.js"></script>',
      'file:///tmp/shared/'
    );
    expect(out).toContain('file:///tmp/shared/gsap-loader.js');
  });

  it('buildSceneHtml uses master timeline for storyboard gsapInit', () => {
    const html = buildSceneHtml({
      html: '<div class="scene">x</div>',
      gsapTimeline: 'var master = gsap.timeline({ paused: true }); master.to(".scene", { opacity: 1 });',
      duration: 5,
    });
    expect(html).toContain('master.to(".scene"');
    expect(html).toContain('window.__seek = (t) => master.seek(t, false)');
    expect(html).not.toContain('const tl = gsap.timeline');
  });

  it('prepareGsapRenderDocument injects full-bleed export styles', () => {
    const full = `<!doctype html><html><head></head><body><div class="frame"></div></body></html>`;
    const out = prepareGsapRenderDocument(full, 3);
    expect(out).toContain('data-mxm-video-export="1"');
    expect(out).toContain('width:100%!important');
  });

  it('prepareGsapRenderDocument does not nest full doc inside stage', () => {
    const full = `<!doctype html><html><head></head><body>
<script src="../../_shared/seek-render.js"></script>
<script>window.MxmSeekRender.installSeek(gsap.timeline(), { duration: 3 });</script>
</body></html>`;
    const out = prepareGsapRenderDocument(full, 3);
    expect(out).not.toContain('<div id="stage">');
    expect(out).toContain('data-mxm-seek-bridge');
    expect(out).toContain('window.__seek=bridgeSeek');
  });

  it('injectGsapSeekBridge is idempotent', () => {
    const once = injectGsapSeekBridge('<html><body></body></html>', 2);
    const twice = injectGsapSeekBridge(once, 2);
    expect((twice.match(/data-mxm-seek-bridge/g) ?? []).length).toBe(1);
  });
});
