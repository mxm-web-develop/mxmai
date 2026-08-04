import { describe, expect, it } from 'vitest';
import {
  filterUserFacingListTasks,
  isInternalListTask,
} from './task-list-visibility';

const PIPELINE_NODE_VIDEO_TIMELINE_RENDER = 'pipeline:video-timeline-render';

describe('isInternalListTask', () => {
  it('hides batch parent types', () => {
    expect(isInternalListTask({ type: 'video-batch-parent' })).toBe(true);
    expect(isInternalListTask({ type: 'task-v2-batch-parent' })).toBe(true);
  });

  it('hides videoTimelineRender pipeline child', () => {
    expect(
      isInternalListTask({
        type: 'video',
        metadata: {
          pipelineInternal: true,
          hideFromUserList: true,
          parentPipelineTaskId: 'parent-1',
          pipelineNode: PIPELINE_NODE_VIDEO_TIMELINE_RENDER,
          model: 'video-edit-dispatcher',
          videoSubtype: 'render',
        },
      })
    ).toBe(true);
  });

  it('hides legacy render dispatcher without pipeline flags', () => {
    expect(
      isInternalListTask({
        type: 'video',
        metadata: { model: 'video-edit-dispatcher', videoSubtype: 'render' },
      })
    ).toBe(true);
  });

  it('hides Admin pipeline debug monitor runs from user list', () => {
    expect(
      isInternalListTask({
        type: 'writing',
        metadata: { adminPipelineDebug: true, hideFromUserList: true, label: '【Admin 调试】' },
      })
    ).toBe(true);
    expect(
      isInternalListTask({
        type: 'writing',
        requestParams: { __adminPipelineDebug: true, taskV2: { taskKey: 'generator' } },
      })
    ).toBe(true);
  });

  it('keeps user-facing autocut and generator tasks', () => {
    expect(
      isInternalListTask({
        type: 'video',
        metadata: { model: 'some-model', videoSubtype: 'autocut' },
        requestParams: { taskKey: 'voiceover-science-pop', subtype: 'default' },
      })
    ).toBe(false);
    expect(
      isInternalListTask({
        type: 'video',
        metadata: { model: 'kling', videoSubtype: 'generator' },
        requestParams: { taskKey: 'text-to-video', subtype: 'default' },
      })
    ).toBe(false);
  });
});

describe('filterUserFacingListTasks', () => {
  it('removes internal tasks from list', () => {
    const tasks = [
      { type: 'video', metadata: { label: '口播分镜' } },
      { type: 'video', metadata: { model: 'video-edit-dispatcher', videoSubtype: 'render' } },
    ];
    const visible = filterUserFacingListTasks(tasks);
    expect(visible).toHaveLength(1);
    expect(visible[0].metadata?.label).toBe('口播分镜');
  });
});
