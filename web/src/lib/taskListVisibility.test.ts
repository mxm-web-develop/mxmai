import { describe, expect, it } from 'vitest';
import type { WritingTaskItem } from '../api/client';
import {
  shouldShowInTaskList,
  taskMatchesListScope,
} from './taskListVisibility';

function task(partial: Partial<WritingTaskItem> & Pick<WritingTaskItem, 'id' | 'type'>): WritingTaskItem {
  return {
    status: 'processing',
    ...partial,
  };
}

describe('taskListVisibility scope filter', () => {
  it('graph list accepts graph and legacy image type', () => {
    expect(taskMatchesListScope(task({ id: '1', type: 'graph' }), 'graph')).toBe(true);
    expect(taskMatchesListScope(task({ id: '2', type: 'image' }), 'graph')).toBe(true);
    expect(taskMatchesListScope(task({ id: '3', type: 'video' }), 'graph')).toBe(false);
  });

  it('video task must not appear in graph list (WS leak fix)', () => {
    const videoTask = task({
      id: '6a5954dd',
      type: 'video',
      metadata: { label: '口播音频分镜成片-20260709' },
    });
    expect(shouldShowInTaskList(videoTask, 'graph')).toBe(false);
    expect(shouldShowInTaskList(videoTask, 'video')).toBe(true);
  });

  it('hides pipeline internal video render from video list', () => {
    const internal = task({
      id: 'x',
      type: 'video',
      metadata: { model: 'video-edit-dispatcher', videoSubtype: 'render' },
    });
    expect(shouldShowInTaskList(internal, 'video')).toBe(false);
  });
});
