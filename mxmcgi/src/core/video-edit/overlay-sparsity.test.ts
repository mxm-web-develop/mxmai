import { describe, expect, it } from 'vitest';
import {
  buildClosingCtaLayers,
  buildOpeningIdentityLayers,
  ensureOpeningClosingOverlays,
  sparsifySegmentOverlays,
} from './overlay-sparsity';
import type { TimelineVisualSegment } from './timeline-segment-types';

function seg(
  partial: Partial<TimelineVisualSegment> &
    Pick<TimelineVisualSegment, 'startSeconds' | 'endSeconds' | 'text'>
): TimelineVisualSegment {
  return { ...partial };
}

describe('opening/closing identity overlays', () => {
  it('buildOpeningIdentityLayers stacks show / title / subtitle / host', () => {
    const layers = buildOpeningIdentityLayers(
      {
        title: '人形机器人为什么突然火了',
        subtitle: '从实验室走到产线',
        showName: 'MXM 科技周报',
        hostName: '李明',
      },
      6
    );
    expect(layers.map((l) => l.role)).toEqual([
      'show-badge',
      'title-card',
      'chapter-cover',
      'lower-third',
    ]);
    expect(layers.find((l) => l.role === 'title-card')?.text).toContain('人形机器人');
    expect(layers.find((l) => l.role === 'lower-third')?.text).toBe('UP主 · 李明');
    expect(layers.every((l) => !/本期开场|开场$/.test(l.text))).toBe(true);
  });

  it('buildClosingCtaLayers uses 一键三连 instead of 感谢收看', () => {
    const layers = buildClosingCtaLayers({ showName: 'MXM 科技周报' }, 5);
    expect(layers[0]?.role).toBe('outro-cta');
    expect(layers[0]?.text).toMatch(/一键三连/);
    expect(layers[0]?.text).toMatch(/关注/);
    expect(layers[0]?.text).not.toMatch(/^感谢收看/);
  });

  it('ensureOpeningClosingOverlays replaces placeholder text with identity', () => {
    const result = ensureOpeningClosingOverlays(
      [
        seg({
          startSeconds: 0,
          endSeconds: 6,
          text: '智能机器人来了',
          mxmBeatRole: 'opening',
          overlayLayers: [{ role: 'title-card', text: '本期开场' }],
        }),
        seg({ startSeconds: 6, endSeconds: 12, text: '正文', mxmBeatRole: 'body' }),
        seg({
          startSeconds: 12,
          endSeconds: 18,
          text: '收尾',
          mxmBeatRole: 'closing',
          overlayLayers: [{ role: 'outro-cta', text: '感谢收看' }],
        }),
      ],
      {
        title: '智能机器人',
        subtitle: '量产前夜',
        showName: 'MXM',
        hostName: '阿华',
      }
    );
    const openRoles = result[0]?.overlayLayers?.map((l) => l.role) ?? [];
    expect(openRoles).toContain('show-badge');
    expect(openRoles).toContain('title-card');
    expect(openRoles).toContain('lower-third');
    expect(result[0]?.overlayLayers?.some((l) => l.text === '本期开场')).toBe(false);
    expect(result[0]?.overlayLayers?.find((l) => l.role === 'title-card')?.text).toBe(
      '智能机器人'
    );

    const outro = result[2]?.overlayLayers?.find((l) => l.role === 'outro-cta');
    expect(outro?.text).toMatch(/一键三连/);
    expect(outro?.text).not.toBe('感谢收看');
  });

  it('does not inject hollow 本期开场 when no identity fields', () => {
    const result = ensureOpeningClosingOverlays([
      seg({ startSeconds: 0, endSeconds: 6, text: '智能机器人来了', mxmBeatRole: 'opening' }),
      seg({ startSeconds: 6, endSeconds: 12, text: '正文', mxmBeatRole: 'body' }),
      seg({ startSeconds: 12, endSeconds: 18, text: '收尾', mxmBeatRole: 'closing' }),
    ]);
    expect(result[0]?.overlayLayers?.some((l) => l.text === '本期开场')).toBeFalsy();
    // 结尾仍给行动号召 CTA（不依赖身份字段）
    expect(result[2]?.overlayLayers?.some((l) => /一键三连/.test(l.text))).toBe(true);
  });
});

describe('sparsifySegmentOverlays', () => {
  it('strips keyword-pop from body beats', () => {
    const result = sparsifySegmentOverlays(
      [
        seg({
          startSeconds: 0,
          endSeconds: 5,
          text: '开场',
          mxmBeatRole: 'opening',
          overlayLayers: [{ role: 'title-card', text: 'MXM 周报' }],
        }),
        seg({
          startSeconds: 5,
          endSeconds: 12,
          text: '叙述',
          mxmBeatRole: 'body',
          overlayLayers: [{ role: 'keyword-pop', text: 'Embodied AI' }],
        }),
        seg({
          startSeconds: 12,
          endSeconds: 18,
          text: '章节',
          mxmBeatRole: 'transition',
          overlayLayers: [{ role: 'chapter-cover', text: 'PART 02 · 拐点' }],
        }),
      ],
      { title: 'MXM 周报', showName: 'MXM' }
    );
    expect(result[0]?.overlayLayers?.some((l) => l.role === 'title-card')).toBe(true);
    expect(result[1]?.overlayLayers).toBeUndefined();
    expect(result[2]?.overlayLayers?.some((l) => l.role === 'chapter-cover')).toBe(true);
  });

  it('keeps fact-card with digits on body', () => {
    const result = sparsifySegmentOverlays([
      seg({
        startSeconds: 20,
        endSeconds: 28,
        text: '数据',
        mxmBeatRole: 'body',
        overlayLayers: [{ role: 'fact-card', text: '2025 Q1' }],
      }),
    ]);
    expect(result[0]?.overlayLayers?.some((l) => l.text === '2025 Q1')).toBe(true);
  });

  it('throttles dense keyword-pop when beat role missing', () => {
    const segs = Array.from({ length: 8 }, (_, i) =>
      seg({
        startSeconds: i * 6,
        endSeconds: i * 6 + 6,
        text: `段${i}`,
        overlayLayers: [{ role: 'keyword-pop', text: `词${i}` }],
      })
    );
    const result = sparsifySegmentOverlays(segs, { title: '主题测试', showName: '节目' });
    expect(result[0]?.overlayLayers?.some((l) => l.role === 'title-card')).toBe(true);
    expect(result[7]?.overlayLayers?.some((l) => l.role === 'outro-cta')).toBe(true);
    expect(result[7]?.overlayLayers?.some((l) => /一键三连/.test(l.text))).toBe(true);
  });
});
