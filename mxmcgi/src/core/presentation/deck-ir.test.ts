import { describe, expect, it } from 'vitest';
import {
  assembleDeckOutlineMarkdown,
  clampDeckPageCount,
  defaultLayoutHintForRole,
  expandSlidesSkeleton,
} from './deck-ir';
import { runExpandDeckSlidesStep } from './expand-deck-slides-step';
import type { TaskContext } from '../../tasks/types';

describe('deck-ir', () => {
  it('expands skeleton with cover and closing', () => {
    const slides = expandSlidesSkeleton({
      slideRoles: ['cover', 'agenda', 'content', 'content', 'closing'],
      pageCount: 5,
    });
    expect(slides).toHaveLength(5);
    expect(slides[0]!.role).toBe('cover');
    expect(slides[0]!.layout_hint).toBe('title_center');
    expect(slides[slides.length - 1]!.role).toBe('closing');
    expect(slides.map((s) => s.id)).toEqual(['s1', 's2', 's3', 's4', 's5']);
  });

  it('pads and clamps page count', () => {
    expect(clampDeckPageCount(99)).toBe(24);
    expect(clampDeckPageCount(0)).toBe(1);
    const slides = expandSlidesSkeleton({ slideRoles: ['cover'], pageCount: 4 });
    expect(slides).toHaveLength(4);
    expect(slides[0]!.role).toBe('cover');
    expect(slides[3]!.role).toBe('closing');
  });

  it('maps roles to layout hints', () => {
    expect(defaultLayoutHintForRole('agenda')).toBe('agenda_list');
    expect(defaultLayoutHintForRole('chart')).toBe('big_number');
  });

  it('assembles outline markdown', () => {
    const md = assembleDeckOutlineMarkdown({
      title: '品牌手册',
      deckType: 'brand',
      slides: [
        {
          id: 's1',
          order: 1,
          role: 'cover',
          title: '封面',
          layout_hint: 'title_center',
          bullets: [],
        },
        {
          id: 's2',
          order: 2,
          role: 'content',
          title: '色彩',
          layout_hint: 'three_cards',
          bullets: ['主色', '辅色'],
        },
      ],
    });
    expect(md).toContain('# 品牌手册');
    expect(md).toContain('色彩');
    expect(md).toContain('主色');
  });
});

describe('expandDeckSlides step', () => {
  it('writes slides from selected plan', async () => {
    const ctx: TaskContext = {
      scope: 'writing',
      taskKey: 'group',
      subtype: 'deck',
      userId: 'u1',
      params: {},
      state: {
        contract: {
          basic: { plan_id: 'p1', title: 'Demo' },
          business: {
            plans: [
              {
                id: 'p1',
                label: '标准 10 页',
                page_count: 4,
                density: 'balanced',
                slide_roles: ['cover', 'agenda', 'content', 'closing'],
              },
            ],
          },
        },
      },
    };
    const next = await runExpandDeckSlidesStep(ctx, { step: 'expandDeckSlides', params: {} });
    const slides = (next.state.contract as { business: { slides: unknown[] } }).business.slides;
    expect(slides).toHaveLength(4);
    expect(next.state.deckSlideCount).toBe(4);
    expect((next.state.contract as { basic: { page_count: number } }).basic.page_count).toBe(4);
  });
});
