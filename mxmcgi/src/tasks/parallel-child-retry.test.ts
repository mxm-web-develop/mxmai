import { describe, expect, it, vi } from 'vitest';
import { maybeScheduleParallelChildRetry } from './parallel-child-retry';
import type { Task } from '../task/types';

vi.mock('../task/task-executor', () => ({
  taskExecutor: {
    getTaskManager: () => ({
      updateTaskStatus: vi.fn(),
      getTask: vi.fn(),
      storage: null,
    }),
  },
}));

function fakeTask(partial: Partial<Task> & { type: string }): Task {
  return {
    id: 't1',
    type: partial.type as Task['type'],
    status: 'failed',
    createdAt: new Date(),
    updatedAt: new Date(),
    metadata: {
      parentTaskId: 'parent-1',
      parallelIndex: 0,
      parallelTotal: 2,
      ...(partial.metadata as object),
    },
    requestParams: {},
    progress: { progress: 0 },
    ...partial,
  } as Task;
}

describe('maybeScheduleParallelChildRetry', () => {
  it('never auto-retries video tasks', async () => {
    const ok = await maybeScheduleParallelChildRetry(
      'vid-1',
      fakeTask({ type: 'video' }),
      'seedance failed'
    );
    expect(ok).toBe(false);
  });

  it('never auto-retries video-batch-parent', async () => {
    const ok = await maybeScheduleParallelChildRetry(
      'vid-batch-1',
      fakeTask({ type: 'video-batch-parent' }),
      'batch child failed'
    );
    expect(ok).toBe(false);
  });
});
