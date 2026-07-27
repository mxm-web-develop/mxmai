import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VariableExecutor } from './variableExecutor';
import { BusinessExecutor } from './businessExecutor';
import { resolveSmartflowParams } from './resolve-smartflow-params';
import { runWithConcurrency } from '../utils/run-with-concurrency';
import { ESHOP_BATCH_ASSEMBLE_EXPRESSION } from '../../examples/eshop-clothes-batch-fixture';
import type { ExecutionContext, SmartflowNode } from '../models/types';

const runBusinessTaskMock = vi.fn(async (_scope: string, _taskKey: string, params: Record<string, unknown>) => ({
  success: true,
  taskId: `task-${String((params.garment_images as unknown[])?.[0] ?? 'x')}`,
  status: 'completed',
  scope: 'graph',
  taskKey: 'eshop',
  subtype: 'clothes',
  mediaUrls: ['https://cdn.example.com/out.png'],
  image_urls: ['https://cdn.example.com/out.png'],
  syncResult: { mediaUrls: ['https://cdn.example.com/out.png'] },
  params,
}));

vi.mock('./run-business-task', () => ({
  runBusinessTaskForSmartflow: (...args: unknown[]) => runBusinessTaskMock(...args),
}));

function baseCtx(input: Record<string, unknown>): ExecutionContext {
  return {
    execution: {
      id: 'exec-1',
      user_id: 'user-1',
      smartflow_id: 'eshop-clothes-batch-v1',
      input_data: input,
      status: 'running',
      progress: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as ExecutionContext['execution'],
    variables: { input, user_id: 'user-1' },
    nodeOutputs: {},
    smartflow: {
      id: 'eshop-clothes-batch-v1',
      name: 'batch',
      schema: { version: '1', nodes: [], edges: [] },
    },
  };
}

describe('eshop batch acceptance', () => {
  const variableExecutor = new VariableExecutor();
  const businessExecutor = new BusinessExecutor();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('assembles 3 garment tasks and creates 3 parallel business tasks with correct params', async () => {
    const input = {
      model_images: [{ content: 'https://cdn/model.png', type: 'main-subject' }],
      garments: [
        {
          label: 'A',
          images: [{ content: 'https://cdn/a.png', type: 'outfits' }],
          shoot_preset: 'beach_sunny_pier',
          garment_material: 'cotton',
        },
        {
          label: 'B',
          images: [{ content: 'https://cdn/b.png', type: 'outfits' }],
          shoot_preset: 'urban_street_day',
          garment_material: 'denim',
        },
        {
          label: 'C',
          images: [{ content: 'https://cdn/c.png', type: 'outfits' }],
        },
      ],
      model_participation: 'default',
      output_grid: '1x1',
      parallel_count: 3,
      shoot_preset_mode: 'auto',
      shoot_preset_fallback: 'studio_soft_gray',
      garment_material_fallback: 'use_reference_only',
      style_images: [],
      environment_images: [],
      prompt: '',
    };

    const ctx = baseCtx(input);

    const assembleResult = await variableExecutor.execute(
      {
        id: 'assemble_tasks',
        type: 'variable',
        operation: 'map',
        source_path: 'input.garments',
        expression: ESHOP_BATCH_ASSEMBLE_EXPRESSION,
        output_name: 'garment_tasks',
      } as SmartflowNode,
      ctx
    );

    const tasks = (assembleResult.output as { garment_tasks: Record<string, unknown>[] }).garment_tasks;
    expect(tasks).toHaveLength(3);
    expect(tasks[0].shoot_preset).toBe('beach_sunny_pier');
    expect(tasks[2].shoot_preset).toBe('studio_soft_gray');

    const businessNode: SmartflowNode = {
      id: 'run_eshop',
      type: 'business',
      business_scope: 'graph',
      taskKey: 'eshop',
      subtype: 'clothes',
      params: {
        model_images: '{{variables.task.model_images}}',
        garment_images: '{{variables.task.garment_images}}',
        shoot_preset: '{{variables.task.shoot_preset}}',
        garment_material: '{{variables.task.garment_material}}',
        model_participation: '{{variables.task.model_participation}}',
        output_grid: '{{variables.task.output_grid}}',
        parallel_count: '{{variables.task.parallel_count}}',
      },
    };

    const results = await runWithConcurrency(tasks, 3, async (task) => {
      const iterCtx: ExecutionContext = {
        ...ctx,
        variables: { ...ctx.variables, task },
      };
      const resolved = resolveSmartflowParams(businessNode.params ?? {}, iterCtx);
      expect(Array.isArray((resolved as Record<string, unknown>).garment_images)).toBe(true);
      expect((resolved as Record<string, unknown>).parallel_count).toBe(3);
      expect(typeof (resolved as Record<string, unknown>).parallel_count).toBe('number');
      const r = await businessExecutor.execute(businessNode, iterCtx);
      expect(r.success).toBe(true);
      return r.output;
    });

    expect(results).toHaveLength(3);
    expect(results.every((r) => r?.taskId)).toBe(true);
    expect(results.every((r) => Array.isArray((r as { mediaUrls?: string[] }).mediaUrls))).toBe(true);
    expect(results[0]).toMatchObject({
      taskId: expect.any(String),
      mediaUrls: ['https://cdn.example.com/out.png'],
    });
    expect(runBusinessTaskMock).toHaveBeenCalledTimes(3);
  });
});
