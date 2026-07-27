import { describe, expect, it } from 'vitest';
import { buildTaskSnapshot } from './task-snapshot';
import type { Task } from './types';

function baseTask(over: Partial<Task> = {}): Task {
  return {
    id: 't1',
    type: 'writing',
    status: 'completed',
    progress: { status: 'completed', progress: 100 },
    metadata: { userId: 'u1', label: '小幽默' },
    createdAt: new Date('2026-07-25T13:56:00Z'),
    updatedAt: new Date('2026-07-25T13:56:00Z'),
    ...over,
  } as Task;
}

describe('buildTaskSnapshot', () => {
  it('includes contentPreview from metadata.listContentPreview for writing tasks', () => {
    const snap = buildTaskSnapshot(
      baseTask({
        metadata: {
          userId: 'u1',
          label: '小幽默',
          listContentPreview: '# 英超20队赴美\n\n蹭完世界杯再赚一笔',
        },
        result: { mediaUrls: [], metadata: {} },
      })
    );
    expect(snap.contentPreview).toContain('英超');
    expect(snap.hasResult).toBe(true);
  });

  it('falls back to result.metadata.text when listContentPreview missing', () => {
    const snap = buildTaskSnapshot(
      baseTask({
        result: {
          mediaUrls: [],
          metadata: { text: '# 比特币跌破6.4万\n\nETF 净流出' },
        },
      })
    );
    expect(snap.contentPreview).toContain('比特币');
    expect(snap.hasResult).toBe(true);
  });
});
