import { describe, expect, it } from 'vitest';
import { resolvePipelineMappingValue } from './business-pipeline';
import type { TaskContext } from './types';

function ctx(overrides?: Partial<TaskContext>): TaskContext {
  return {
    scope: 'video',
    taskKey: 'edit',
    subtype: 'voiceover-science-pop',
    userId: 'u1',
    taskId: 't1',
    params: {},
    state: {},
    ...overrides,
  };
}

describe('resolvePipelineMappingValue', () => {
  it('preserves array for pure params placeholder', () => {
    const renderPlan = ['gsap-html-animation', 'static-image'];
    const result = resolvePipelineMappingValue('${params.render_plan}', ctx({ params: { render_plan: renderPlan } }));
    expect(result).toEqual(renderPlan);
    expect(Array.isArray(result)).toBe(true);
  });

  it('preserves number for pure params placeholder', () => {
    const result = resolvePipelineMappingValue('${params.audio_duration_seconds}', ctx({ params: { audio_duration_seconds: 42 } }));
    expect(result).toBe(42);
  });

  it('stringifies array in mixed template', () => {
    const result = resolvePipelineMappingValue('plan=${params.render_plan}', ctx({ params: { render_plan: ['ai-video-gen'] } }));
    expect(result).toBe('plan=["ai-video-gen"]');
  });
});
