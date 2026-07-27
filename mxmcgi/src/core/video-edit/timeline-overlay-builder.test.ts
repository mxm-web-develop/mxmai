import { describe, expect, it } from 'vitest';
import {
  buildOpenReelOverlaysFromSegments,
  migrateGsapSegmentToOverlays,
  parseSegmentOverlays,
} from './timeline-overlay-builder';
import { normalizeMxmRenderMode } from './render-mode';
import { normalizeRenderPlanInput, resolveRenderModeFromPlan } from './render-plan';

describe('render-mode / render-plan (dual mode)', () => {
  it('normalizes legacy gsap to static-image', () => {
    expect(normalizeMxmRenderMode('gsap-html-animation')).toBe('static-image');
    expect(normalizeRenderPlanInput('gsap-only')).toEqual(['static-image']);
    expect(normalizeRenderPlanInput('hybrid-balanced')).toEqual(['static-image', 'ai-video-gen']);
  });

  it('round-robins two active modes', () => {
    const plan = ['static-image', 'ai-video-gen'];
    expect(resolveRenderModeFromPlan(plan, 0, 4)).toBe('static-image');
    expect(resolveRenderModeFromPlan(plan, 1, 4)).toBe('ai-video-gen');
  });
});

describe('timeline-overlay-builder', () => {
  it('parses overlays from shot-list item', () => {
    const overlays = parseSegmentOverlays([
      { kind: 'text', text: '芯片制程', animationPreset: 'pop', position: 'bottom' },
    ]);
    expect(overlays).toHaveLength(1);
    expect(overlays[0]?.text).toBe('芯片制程');
  });

  it('migrates legacy gsap brief to text overlay', () => {
    const overlays = migrateGsapSegmentToOverlays({
      startSeconds: 0,
      endSeconds: 6,
      text: '开场',
      mxmGsapSceneBrief: '标题卡 / 关键词动效',
      keywords: ['AI', '芯片'],
    });
    expect(overlays[0]?.kind).toBe('text');
    expect(overlays[0]?.text).toContain('AI');
  });

  it('builds textClips and transitions', () => {
    const pack = buildOpenReelOverlaysFromSegments(
      [
        {
          startSeconds: 0,
          endSeconds: 5,
          text: '段1',
          overlays: [{ kind: 'text', text: '标题', animationPreset: 'fade' }],
          transition: { type: 'crossfade', durationSeconds: 0.5 },
        },
        { startSeconds: 5, endSeconds: 10, text: '段2' },
      ],
      { projectWidth: 1920, projectHeight: 1080, editStyle: 'science-minimal' }
    );
    expect(pack.textClips.length).toBeGreaterThanOrEqual(1);
    const titled = pack.textClips.find((c) => c.text?.includes('标题')) ?? pack.textClips[0]!;
    // 短关键词 → B站风格靠右，避免压主体
    expect(titled.transform.position.x).toBeGreaterThan(0.5);
    expect(titled.style.fontSize).toBeGreaterThanOrEqual(56);
    expect(titled.style.strokeWidth).toBeGreaterThan(0);
    expect(pack.textTrack?.type).toBe('text');
    expect(pack.transitions).toHaveLength(1);
    expect(pack.transitions[0]?.type).toBe('crossfade');
  });

  it('uses role-driven styles for overlayLayers', () => {
    const pack = buildOpenReelOverlaysFromSegments(
      [
        {
          startSeconds: 0,
          endSeconds: 6,
          text: '段1',
          mxmBeatRole: 'opening',
          overlayLayers: [
            {
              role: 'keyword-pop',
              text: '人形机器人',
              position: 'center-right',
              enterAt: 0.2,
              exitAt: 4,
              emphasis: 'hot',
            },
            {
              role: 'title-card',
              text: '人形机器人量产前夜',
              enterAt: 0.1,
              exitAt: 2.5,
            },
          ],
        },
        {
          startSeconds: 6,
          endSeconds: 12,
          text: '结尾',
          mxmBeatRole: 'closing',
          overlayLayers: [{ role: 'outro-cta', text: '一键三连 · 点赞收藏关注', enterAt: 0.2, exitAt: 3 }],
        },
      ],
      { projectWidth: 1920, projectHeight: 1080 }
    );
    const keyword = pack.textClips.find((c) => c.text?.includes('人形机器人'));
    expect(keyword).toBeTruthy();
    expect(keyword!.style.fontSize).toBeGreaterThanOrEqual(88);
    expect(keyword!.transform.position.x).toBeGreaterThan(0.5);
  });
});
