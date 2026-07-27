import { describe, it, expect } from 'vitest';
import { VariableExecutor } from './variableExecutor';
import { resolveSmartflowParams } from './resolve-smartflow-params';
import { getEshopBatchAssembleExpression } from '../../examples/eshop-clothes-batch-fixture';
import { validateWithJsonSchema } from '../../../tasks/schema-validator';
import { mergePlatformFieldsIntoFormSchema } from '../../../tasks/platform-fields';
import {
  cloneFormSchemaWithReferenceImageEnrichment,
  prepareGraphTaskParams,
} from '../../../tasks/graph-reference-slots';
import graphConfig from '../../../tasks/examples/graph-eshop-clothes.config.json';
import type { ExecutionContext } from '../models/types';

const formSchema = mergePlatformFieldsIntoFormSchema(
  graphConfig.taskTemplate.formSchema as import('../../../tasks/types').JsonSchemaV2,
  'graph'
);
const fs = cloneFormSchemaWithReferenceImageEnrichment(formSchema)!;

const businessParams = {
  model_images: '{{variables.task.model_images}}',
  garment_images: '{{variables.task.garment_images}}',
  shoot_preset: '{{variables.task.shoot_preset}}',
  garment_material: '{{variables.task.garment_material}}',
  model_participation: '{{variables.task.model_participation}}',
  output_grid: '{{variables.task.output_grid}}',
  parallel_count: '{{variables.task.parallel_count}}',
};

describe('eshop batch schema validation', () => {
  it('resolved params pass graph/eshop/clothes JSON Schema', async () => {
    const input = {
      model_images: [{ content: 'https://cdn/model.png', type: 'main-subject' }],
      garments: [
        { label: 'A', images: [{ content: 'https://cdn/a.png', type: 'outfits' }] },
        { label: 'B', images: [{ content: 'https://cdn/b.png', type: 'outfits' }] },
      ],
      model_participation: 'default',
      output_grid: '1x1',
      parallel_count: 3,
      shoot_preset_mode: 'auto',
      shoot_preset_fallback: 'studio_soft_gray',
      garment_material_fallback: 'use_reference_only',
      style_images: [] as unknown[],
      environment_images: [] as unknown[],
      prompt: '',
    };

    const ctx: ExecutionContext = {
      execution: { user_id: 'u1', input_data: input } as ExecutionContext['execution'],
      variables: { input },
      nodeOutputs: {},
      smartflow: { schema: { version: '1', nodes: [], edges: [] } } as ExecutionContext['smartflow'],
    };

    const ve = new VariableExecutor();
    const assembleResult = await ve.execute(
      {
        id: 'assemble_tasks',
        type: 'variable',
        operation: 'map',
        source_path: 'input.garments',
        plan_tasks_from: '{{parse_plan.parsed.garment_tasks}}',
        expression: getEshopBatchAssembleExpression(),
        output_name: 'garment_tasks',
      } as import('../models/types').SmartflowNode,
      ctx
    );

    const tasks = (assembleResult.output as { garment_tasks: Record<string, unknown>[] }).garment_tasks;

    for (const task of tasks) {
      const iterCtx: ExecutionContext = {
        ...ctx,
        variables: { ...ctx.variables, task },
      };
      const resolved = resolveSmartflowParams(businessParams, iterCtx) as Record<string, unknown>;
      const prepared = prepareGraphTaskParams(resolved, fs, {
        taskKey: 'eshop',
        subtype: 'clothes',
      });
      expect(() => validateWithJsonSchema(fs, prepared)).not.toThrow();
    }
  });
});
