import { describe, expect, it, vi } from 'vitest';

vi.mock('../../folder-index/virtual-folder-index-service', () => ({
  virtualFolderIndexService: { search: vi.fn() },
}));

import {
  PIPELINE_NODE_VIDEO_TIMELINE_RENDER,
  isVideoTimelineRenderPipelineStep,
  resolveVideoTimelineRenderInput,
} from './pipeline-timeline-render';
import type { PipelineStep, TaskContext } from '../../tasks/types';

describe('pipeline-timeline-render', () => {
  it('识别 videoTimelineRender 与 legacy nestedVideo', () => {
    expect(isVideoTimelineRenderPipelineStep({ step: 'videoTimelineRender' })).toBe(true);
    expect(isVideoTimelineRenderPipelineStep({ step: 'nestedVideo' })).toBe(true);
    expect(isVideoTimelineRenderPipelineStep({ step: 'manualReview' })).toBe(false);
  });

  it('从 state 解析 videoEditScriptJson', () => {
    const ctx: TaskContext = {
      scope: 'video',
      taskKey: 'autocut',
      taskId: 'parent-1',
      params: {},
      state: {
        videoEditScriptJson: { project: { timeline: { tracks: [] } } },
      },
    };
    const step: PipelineStep = {
      step: 'videoTimelineRender',
      params: { renderOptions: { concatFinal: true } },
    };
    const input = resolveVideoTimelineRenderInput(ctx, step);
    expect(input.videoEditScriptJson).toEqual({ project: { timeline: { tracks: [] } } });
    expect(input.renderOptions).toEqual({ concatFinal: true });
  });

  it('pipeline node 常量非 business key', () => {
    expect(PIPELINE_NODE_VIDEO_TIMELINE_RENDER).toBe('pipeline:video-timeline-render');
    expect(PIPELINE_NODE_VIDEO_TIMELINE_RENDER.startsWith('video/')).toBe(false);
  });
});
