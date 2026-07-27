import { describe, expect, it } from 'vitest';
import {
  buildWarpProgressUpdate,
  messageForPipelineStep,
  progressWithinPhase,
  WARP_UI_PHASES,
} from './warp-progress';

describe('warp-progress', () => {
  it('keeps phase bands monotonic across stages', () => {
    const pre = buildWarpProgressUpdate({ phase: 'pre', stepIndex: 0, stepTotal: 2 });
    const input = buildWarpProgressUpdate({ phase: 'input' });
    const enrich = buildWarpProgressUpdate({ phase: 'enrich', stepIndex: 0, stepTotal: 3 });
    const output = buildWarpProgressUpdate({ phase: 'output' });
    const post = buildWarpProgressUpdate({ phase: 'post', stepIndex: 0, stepTotal: 1 });
    expect(pre.progress).toBeLessThan(input.progress);
    expect(input.progress).toBeLessThanOrEqual(enrich.progress);
    expect(enrich.progress).toBeLessThan(output.progress);
    expect(output.progress).toBeLessThan(post.progress);
    expect(post.progress).toBeLessThan(100);
  });

  it('advances within a phase by step index', () => {
    const a = progressWithinPhase('enrich', 0, 4);
    const b = progressWithinPhase('enrich', 3, 4);
    expect(b).toBeGreaterThan(a);
  });

  it('maps pipeline steps to user-facing copy without leaking keys', () => {
    expect(messageForPipelineStep({ step: 'webSearch' })).toContain('检索');
    expect(messageForPipelineStep({ step: 'extractHotTopics' })).toContain('热点');
    const nested = messageForPipelineStep({
      step: 'nestedText',
      nestedTextTaskKey: 'text/expert/industry-daily-structure',
    });
    expect(nested).not.toMatch(/industry-daily|nestedText|taskKey/i);
    expect(nested.length).toBeGreaterThan(2);
  });

  it('exposes five UI phases', () => {
    expect(WARP_UI_PHASES).toHaveLength(5);
    expect(WARP_UI_PHASES.map((p) => p.id)).toEqual([
      'pre',
      'input',
      'enrich',
      'output',
      'post',
    ]);
  });
});
