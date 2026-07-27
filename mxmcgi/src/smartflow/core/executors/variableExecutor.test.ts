import { describe, it, expect } from 'vitest';
import { VariableExecutor } from './variableExecutor';
import { ESHOP_BATCH_ASSEMBLE_EXPRESSION } from '../../examples/eshop-clothes-batch-fixture';
import type { ExecutionContext, SmartflowNode } from '../models/types';

function ctx(vars: Record<string, unknown>, nodeOutputs: Record<string, unknown> = {}): ExecutionContext {
  return {
    execution: { user_id: 'u1', input_data: {}, smartflow_id: 'sf1' } as ExecutionContext['execution'],
    variables: vars,
    nodeOutputs,
    smartflow: { schema: { version: '1', nodes: [], edges: [] } } as ExecutionContext['smartflow'],
  };
}

describe('VariableExecutor', () => {
  const executor = new VariableExecutor();

  it('map assembles garment_tasks from per-SKU fields and fallbacks', async () => {
    const node: SmartflowNode = {
      id: 'assemble',
      type: 'variable',
      operation: 'map',
      source_path: 'input.garments',
      expression: ESHOP_BATCH_ASSEMBLE_EXPRESSION,
      output_name: 'garment_tasks',
    };

    const result = await executor.execute(
      node,
      ctx({
        input: {
          model_images: [{ content: 'https://model.png', type: 'main-subject' }],
          garments: [
            {
              label: 'A',
              images: [{ content: 'https://a.png', type: 'outfits' }],
              shoot_preset: 'beach_sunny_pier',
              garment_material: 'cotton',
            },
            {
              label: 'B',
              images: [{ content: 'https://b.png', type: 'outfits' }],
              shoot_preset: 'urban_street_day',
              garment_material: 'denim',
            },
          ],
          model_participation: 'default',
          output_grid: '1x1',
          shoot_preset_mode: 'auto',
          shoot_preset_fallback: 'studio_soft_gray',
          garment_material_fallback: 'use_reference_only',
          prompt: '',
        },
      })
    );

    expect(result.success).toBe(true);
    const tasks = result.output?.garment_tasks as Record<string, unknown>[];
    expect(tasks).toHaveLength(2);
    expect(tasks[0].shoot_preset).toBe('beach_sunny_pier');
    expect(tasks[1].garment_material).toBe('denim');
    expect((tasks[0].garment_images as { content: string }[])[0].content).toContain('a.png');
    expect((tasks[0].model_images as { content: string }[])[0].content).toContain('model.png');
  });

  it('json_parse extracts fenced JSON from business syncResult.text', async () => {
    const node: SmartflowNode = {
      id: 'parse_plan',
      type: 'variable',
      operation: 'json_parse',
      source_node: 'plan_garments',
      source_path: 'syncResult.text',
      output_name: 'parsed',
      default_value: { garment_tasks: [] },
    };

    const result = await executor.execute(
      node,
      ctx(
        {},
        {
          plan_garments: {
            syncResult: {
              text: '```json\n{"garment_tasks":[{"shoot_preset":"beach_sunny_pier","garment_material":"cotton"}]}\n```',
            },
          },
        }
      )
    );

    expect(result.success).toBe(true);
    const parsed = result.output?.parsed as { garment_tasks: { shoot_preset: string }[] };
    expect(parsed.garment_tasks[0].shoot_preset).toBe('beach_sunny_pier');
  });

  it('map merges plan_tasks with SKU overrides', async () => {
    const node: SmartflowNode = {
      id: 'assemble',
      type: 'variable',
      operation: 'map',
      source_path: 'input.garments',
      plan_tasks_from: '{{parse_plan.parsed.garment_tasks}}',
      expression: ESHOP_BATCH_ASSEMBLE_EXPRESSION,
      output_name: 'garment_tasks',
    };

    const result = await executor.execute(
      node,
      ctx(
        {
          input: {
            model_images: [],
            garments: [
              {
                images: [{ content: 'https://a.png', type: 'outfits' }],
                shoot_preset: 'urban_street_day',
              },
            ],
            shoot_preset_mode: 'auto',
            shoot_preset_fallback: 'studio_soft_gray',
            garment_material_fallback: 'use_reference_only',
            model_participation: 'default',
            output_grid: '1x1',
            prompt: '',
          },
        },
        {
          parse_plan: {
            parsed: {
              garment_tasks: [{ shoot_preset: 'beach_sunny_pier', garment_material: 'cotton', prompt: 'plan hint' }],
            },
          },
        }
      )
    );

    const tasks = result.output?.garment_tasks as Record<string, unknown>[];
    expect(tasks[0].shoot_preset).toBe('urban_street_day');
    expect(tasks[0].garment_material).toBe('cotton');
  });

  it('map defaults model_images to [] when omitted from input', async () => {
    const node: SmartflowNode = {
      id: 'assemble',
      type: 'variable',
      operation: 'map',
      source_path: 'input.garments',
      plan_tasks_from: '{{parse_plan.parsed.garment_tasks}}',
      expression: ESHOP_BATCH_ASSEMBLE_EXPRESSION,
      output_name: 'garment_tasks',
    };

    const result = await executor.execute(
      node,
      ctx(
        {
          input: {
            garments: [{ images: [{ content: 'https://sku.png', type: 'outfits' }] }],
            shoot_preset_mode: 'auto',
            shoot_preset_fallback: 'studio_soft_gray',
            garment_material_fallback: 'use_reference_only',
            model_participation: 'default',
            output_grid: '2x2',
            style_images: [],
            environment_images: [],
            prompt: '',
          },
        },
        { parse_plan: { parsed: { garment_tasks: [] } } }
      )
    );

    expect(result.success).toBe(true);
    const tasks = result.output?.garment_tasks as Record<string, unknown>[];
    expect(tasks[0].model_images).toEqual([]);
  });

  it('auto mode prefers AI plan shoot_preset over fallback', async () => {
    const node: SmartflowNode = {
      id: 'assemble',
      type: 'variable',
      operation: 'map',
      source_path: 'input.garments',
      plan_tasks_from: '{{parse_plan.parsed.garment_tasks}}',
      expression: ESHOP_BATCH_ASSEMBLE_EXPRESSION,
      output_name: 'garment_tasks',
    };

    const result = await executor.execute(
      node,
      ctx(
        {
          input: {
            garments: [{ images: [{ content: 'https://sku.png', type: 'outfits' }] }],
            shoot_preset_mode: 'auto',
            shoot_preset_fallback: 'studio_soft_gray',
            garment_material_fallback: 'use_reference_only',
            model_participation: 'default',
            output_grid: '1x1',
            parallel_count: 2,
          },
        },
        {
          parse_plan: {
            parsed: { garment_tasks: [{ shoot_preset: 'beach_sunny_pier', garment_material: 'cotton' }] },
          },
        }
      )
    );

    const tasks = result.output?.garment_tasks as Record<string, unknown>[];
    expect(tasks[0].shoot_preset).toBe('beach_sunny_pier');
    expect(tasks[0].parallel_count).toBe(2);
  });
});
