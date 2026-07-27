import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runBusinessTaskForSmartflow } from './run-business-task';

const runTaskV2Mock = vi.fn();
const getTaskMock = vi.fn();
const waitForTaskCompletionMock = vi.fn();

vi.mock('../../../tasks/task-engine', () => ({
  runTaskV2: (...args: unknown[]) => runTaskV2Mock(...args),
}));

vi.mock('../../../task/task-executor', () => ({
  taskExecutor: {
    getTaskManager: () => ({
      getTask: (...args: unknown[]) => getTaskMock(...args),
    }),
  },
}));

vi.mock('../../../task/wait-for-task', () => ({
  waitForTaskCompletion: (...args: unknown[]) => waitForTaskCompletionMock(...args),
}));

describe('runBusinessTaskForSmartflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns syncResult for text scope without waiting', async () => {
    runTaskV2Mock.mockResolvedValue({
      success: true,
      taskId: 'sync-text-1',
      status: 'completed',
      scope: 'text',
      taskKey: 'plan',
      subtype: 'eshop-garment-batch',
      syncResult: { text: '{"garment_tasks":[]}' },
    });

    const out = await runBusinessTaskForSmartflow(
      'text',
      'plan',
      { garments: [] },
      'user-1',
      { subtype: 'eshop-garment-batch' }
    );

    expect(out.status).toBe('completed');
    expect(out.syncResult?.text).toContain('garment_tasks');
    expect(waitForTaskCompletionMock).not.toHaveBeenCalled();
  });

  it('waits for graph task and returns mediaUrls', async () => {
    runTaskV2Mock.mockResolvedValue({
      success: true,
      taskId: 'graph-task-1',
      status: 'pending',
      scope: 'graph',
      taskKey: 'eshop',
      subtype: 'clothes',
    });
    getTaskMock.mockResolvedValue({ task: { status: 'processing' } });
    waitForTaskCompletionMock.mockResolvedValue({
      timedOut: false,
      task: {
        id: 'graph-task-1',
        status: 'completed',
        metadata: { generated_prompt: 'A professional e-commerce fashion photo with studio lighting and model wearing the garment SKU.' },
        result: {
          mediaUrls: ['https://cdn.example.com/out.png'],
          metadata: { model: 'gpt-image-2-all' },
        },
      },
    });

    const out = await runBusinessTaskForSmartflow(
      'graph',
      'eshop',
      { garment_images: [] },
      'user-1',
      { subtype: 'clothes' }
    );

    expect(waitForTaskCompletionMock).toHaveBeenCalledWith('graph-task-1', expect.any(Object));
    expect(out.status).toBe('completed');
    expect(out.mediaUrls).toEqual(['https://cdn.example.com/out.png']);
    expect(out.image_urls).toEqual(['https://cdn.example.com/out.png']);
    expect(out.syncResult?.mediaUrls).toEqual(['https://cdn.example.com/out.png']);
  });

  it('throws when graph completes without mediaUrls', async () => {
    runTaskV2Mock.mockResolvedValue({
      success: true,
      taskId: 'graph-task-2',
      status: 'pending',
      scope: 'graph',
      taskKey: 'eshop',
      subtype: 'clothes',
    });
    getTaskMock.mockResolvedValue({ task: { status: 'processing' } });
    waitForTaskCompletionMock.mockResolvedValue({
      timedOut: false,
      task: {
        id: 'graph-task-2',
        status: 'completed',
        result: { mediaUrls: [], metadata: {} },
      },
    });

    await expect(
      runBusinessTaskForSmartflow('graph', 'eshop', {}, 'user-1', { subtype: 'clothes' })
    ).rejects.toThrow(/mediaUrls 为空/);
  });

  it('uses already completed task from getTask without wait', async () => {
    runTaskV2Mock.mockResolvedValue({
      success: true,
      taskId: 'graph-task-3',
      status: 'pending',
      scope: 'graph',
      taskKey: 'eshop',
      subtype: 'clothes',
    });
    getTaskMock.mockResolvedValue({
      task: {
        id: 'graph-task-3',
        status: 'completed',
        metadata: { generated_prompt: 'A professional e-commerce fashion photo with studio lighting and model wearing the garment SKU.' },
        result: {
          mediaUrls: ['https://cdn.example.com/done.png'],
          metadata: {},
        },
      },
    });

    const out = await runBusinessTaskForSmartflow('graph', 'eshop', {}, 'user-1', { subtype: 'clothes' });

    expect(waitForTaskCompletionMock).not.toHaveBeenCalled();
    expect(out.mediaUrls).toEqual(['https://cdn.example.com/done.png']);
  });
});
