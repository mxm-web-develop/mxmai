import { describe, expect, it } from 'vitest';
import {
  normalizeRenderPlanInput,
  resolveRenderModeFromPlan,
} from './render-plan';

describe('render-plan', () => {
  it('normalizes legacy single-select values', () => {
    expect(normalizeRenderPlanInput('gsap-only')).toEqual(['static-image']);
    expect(normalizeRenderPlanInput('hybrid-balanced')).toEqual([
      'static-image',
      'ai-video-gen',
    ]);
  });

  it('normalizes multi-select array', () => {
    expect(normalizeRenderPlanInput(['static-image', 'ai-video-gen'])).toEqual([
      'static-image',
      'ai-video-gen',
    ]);
    expect(normalizeRenderPlanInput(['gsap-html-animation', 'static-image'])).toEqual([
      'static-image',
    ]);
  });

  it('single mode applies to all indices', () => {
    expect(resolveRenderModeFromPlan(['static-image'], 0, 5)).toBe('static-image');
    expect(resolveRenderModeFromPlan(['static-image'], 4, 5)).toBe('static-image');
  });

  it('multi mode alternates without gsap priority', () => {
    const plan = ['static-image', 'ai-video-gen'];
    expect(resolveRenderModeFromPlan(plan, 0, 6)).toBe('static-image');
    expect(resolveRenderModeFromPlan(plan, 5, 6)).toBe('ai-video-gen');
  });
});
