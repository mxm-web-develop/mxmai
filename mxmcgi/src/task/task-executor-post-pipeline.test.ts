import { describe, expect, it } from 'vitest';
import { mergeBusinessPipelineState } from '../tasks/manual-review';

/** applyBusinessPostPipeline 必须从 task.requestParams 读取 checkpoint（非 task.params） */
describe('applyBusinessPostPipeline requestParams contract', () => {
  it('mergeBusinessPipelineState 从 requestParams 根级读取审核后 checkpoint', () => {
    const approvedCheckpoint = {
      phase: 'post' as const,
      stepIndex: 1,
      completedGateIds: ['voiceover-science-pop-review'],
    };
    const merged = mergeBusinessPipelineState(
      {
        businessPipelineState: {
          reviewCheckpoint: approvedCheckpoint,
          videoEditScriptJson: { project: { timeline: { duration: 10, tracks: [] } } },
          businessPipelinePostDeferred: true,
        },
      },
      {},
      { taskV2: { scope: 'video', taskKey: 'edit', subtype: 'voiceover-science-pop' } }
    );

    expect(merged.reviewCheckpoint).toEqual(approvedCheckpoint);
    expect(merged.videoEditScriptJson).toBeTruthy();
    expect((merged.reviewCheckpoint as { stepIndex: number }).stepIndex).toBe(1);
  });

  it('空 taskParams（误读 task.params）会丢失 checkpoint', () => {
    const merged = mergeBusinessPipelineState({}, {}, {});
    expect(merged.reviewCheckpoint).toBeUndefined();
  });
});
