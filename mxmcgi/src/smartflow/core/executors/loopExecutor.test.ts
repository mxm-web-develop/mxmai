import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LoopExecutor } from './loopExecutor';
import { ExecutorFactory } from './index';
import type { ExecutionContext, SmartflowNode } from '../models/types';

vi.mock('./index', () => ({
  ExecutorFactory: {
    execute: vi.fn(),
  },
}));

function ctx(): ExecutionContext {
  return {
    execution: { user_id: 'u1', input_data: {}, smartflow_id: 'sf1' } as ExecutionContext['execution'],
    variables: { input: {} },
    nodeOutputs: {},
    smartflow: {
      id: 'sf1',
      name: 'test',
      schema: {
        version: '1',
        nodes: [{ id: 'run_eshop', type: 'business', name: 'biz' }],
        edges: [],
      },
    },
  };
}

function loopNode(overrides: Partial<SmartflowNode> = {}): SmartflowNode {
  return {
    id: 'loop_batch',
    type: 'loop',
    loop_mode: 'iteration',
    iterable: '{{assemble.garment_tasks}}',
    item_variable: 'task',
    loop_nodes: ['run_eshop'],
    collect_output: true,
    output_variable: 'results',
    ...overrides,
  };
}

describe('LoopExecutor parallel_iterations', () => {
  const executor = new LoopExecutor();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs iteration sub-graph concurrently when parallel_iterations is true', async () => {
    const start = Date.now();

    vi.mocked(ExecutorFactory.execute).mockImplementation(async () => {
      const delay = 80 + Math.floor(Math.random() * 20);
      await new Promise((r) => setTimeout(r, delay));
      return { success: true, output: { taskId: `t-${Date.now()}` } };
    });

    const node = loopNode({
      parallel_iterations: true,
      max_concurrency: 3,
    });

    const context = ctx();
    context.nodeOutputs.assemble = {
      garment_tasks: [{ id: 1 }, { id: 2 }, { id: 3 }],
    };

    const result = await executor.execute(node, context);
    const elapsed = Date.now() - start;

    expect(result.success).toBe(true);
    expect(result.output?.results).toHaveLength(3);
    expect(result.output?.results[0]).toMatchObject({ index: expect.any(Number), success: true });
    expect(ExecutorFactory.execute).toHaveBeenCalledTimes(3);
    expect(elapsed).toBeLessThan(200);
  });
});

describe('LoopExecutor on_iteration_error', () => {
  const executor = new LoopExecutor();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('collect_errors: 2 success 1 failure → 3 rows with failed_count', async () => {
    let call = 0;
    vi.mocked(ExecutorFactory.execute).mockImplementation(async () => {
      call++;
      if (call === 2) return { success: false, error: 'SKU failed' };
      return { success: true, output: { taskId: `t-${call}` } };
    });

    const context = ctx();
    context.nodeOutputs.assemble = { garment_tasks: [{}, {}, {}] };

    const result = await executor.execute(
      loopNode({ on_iteration_error: 'collect_errors' }),
      context
    );

    expect(result.success).toBe(true);
    expect(result.output?.results).toHaveLength(3);
    expect(result.output?.failed_count).toBe(1);
    expect(result.output?.success_count).toBe(2);
    expect(result.output?.results[1]).toMatchObject({ success: false, error: 'SKU failed' });
  });

  it('skip: only successful rows in results', async () => {
    let call = 0;
    vi.mocked(ExecutorFactory.execute).mockImplementation(async () => {
      call++;
      if (call === 2) return { success: false, error: 'fail' };
      return { success: true, output: { taskId: `t-${call}` } };
    });

    const context = ctx();
    context.nodeOutputs.assemble = { garment_tasks: [{}, {}, {}] };

    const result = await executor.execute(loopNode({ on_iteration_error: 'skip' }), context);

    expect(result.success).toBe(true);
    expect(result.output?.results).toHaveLength(2);
    expect(result.output?.results.every((r: { success: boolean }) => r.success)).toBe(true);
  });

  it('fail_fast serial: stops after first failure', async () => {
    let call = 0;
    vi.mocked(ExecutorFactory.execute).mockImplementation(async () => {
      call++;
      if (call === 2) return { success: false, error: 'stop here' };
      return { success: true, output: { taskId: `t-${call}` } };
    });

    const context = ctx();
    context.nodeOutputs.assemble = { garment_tasks: [{}, {}, {}] };

    const result = await executor.execute(loopNode({ on_iteration_error: 'fail_fast' }), context);

    expect(result.success).toBe(false);
    expect(ExecutorFactory.execute).toHaveBeenCalledTimes(2);
    expect(result.output?.results).toHaveLength(2);
    expect(result.output?.failed_count).toBe(1);
  });

  it('fail_fast parallel: abort prevents scheduling remaining items', async () => {
    const scheduled: number[] = [];
    vi.mocked(ExecutorFactory.execute).mockImplementation(async (_type, node) => {
      const idx = scheduled.length;
      scheduled.push(idx);
      await new Promise((r) => setTimeout(r, idx === 0 ? 5 : 50));
      if (idx === 0) return { success: false, error: 'first fail' };
      return { success: true, output: { taskId: 'ok' } };
    });

    const context = ctx();
    context.nodeOutputs.assemble = { garment_tasks: [{}, {}, {}, {}] };

    const result = await executor.execute(
      loopNode({ parallel_iterations: true, max_concurrency: 2, on_iteration_error: 'fail_fast' }),
      context
    );

    expect(result.success).toBe(false);
    expect(result.output?.results.length).toBeLessThan(4);
  });

  it('defaults to collect_errors when policy omitted', async () => {
    vi.mocked(ExecutorFactory.execute).mockResolvedValueOnce({ success: false, error: 'x' });

    const context = ctx();
    context.nodeOutputs.assemble = { garment_tasks: [{}] };

    const result = await executor.execute(loopNode(), context);

    expect(result.output?.on_iteration_error).toBe('collect_errors');
    expect(result.output?.results[0]).toMatchObject({ success: false, error: 'x' });
  });

  it('extracts taskId into structured row', async () => {
    vi.mocked(ExecutorFactory.execute).mockResolvedValue({
      success: true,
      output: { data: { taskId: 'task-abc' } },
    });

    const context = ctx();
    context.nodeOutputs.assemble = { garment_tasks: [{}] };

    const result = await executor.execute(loopNode(), context);

    expect(result.output?.results[0]).toMatchObject({
      index: 0,
      success: true,
      taskId: 'task-abc',
    });
  });
});
