/**
 * mxm-warp 五段执行器：pre → input → enrich → output → post
 */
import type { JsonSchemaV2, PipelineStep, TaskContext, TaskTemplate } from '../types';
import { getContract, runInputStage, type WarpLlmFn, withContract } from './input-stage';
import { runOutputStage } from './output-stage';
import { emptyContract, MXM_WARP_CONTRACT_VERSION } from './contract-types';
import { resolveWarpShape } from './unit-series';

export interface MxmWarpPipeline {
  pre?: PipelineStep[];
  enrich?: PipelineStep[];
  post?: PipelineStep[];
}

export function isMxmWarpExecution(template: TaskTemplate, rowExtra?: Record<string, unknown> | null): boolean {
  const fromTpl = (template.extra as Record<string, unknown> | undefined)?.executionMode;
  const fromRow = rowExtra?.executionMode;
  return fromTpl === 'mxm-warp' || fromRow === 'mxm-warp';
}

export function readWarpPipeline(template: TaskTemplate): MxmWarpPipeline {
  const p = template.pipeline as MxmWarpPipeline | undefined;
  return {
    pre: p?.pre ?? [],
    enrich: p?.enrich ?? [],
    post: p?.post ?? [],
  };
}

export function readContractSchema(template: TaskTemplate): JsonSchemaV2 | undefined {
  return template.contractSchema;
}

const LIGHT_PIPELINE_STEPS = new Set([
  'noop',
  'sensitiveCheck',
  'knowledgeRetrieve',
  'webSearch',
]);

async function runConfigurablePhase(
  ctx: TaskContext,
  steps: PipelineStep[] | undefined,
  phase: 'pre' | 'enrich' | 'post'
): Promise<TaskContext> {
  if (!steps?.length) return ctx;

  const { runInputPipeline, runOutputPipeline } = await import('../pipeline-registry');
  await import('../pipeline');
  const { registerWarpWebSearchStep } = await import('./web-search-step');
  registerWarpWebSearchStep();

  const needsHeavySteps = steps.some((s) => !LIGHT_PIPELINE_STEPS.has(String(s.step || '')));
  if (needsHeavySteps) {
    await import('../business-pipeline-steps');
  }

  const { appendSkippedPipelineTrace, shouldRunPipelineStep } = await import('../pipeline-step-when');

  const runnable: PipelineStep[] = [];
  let cur = ctx;
  for (const step of steps) {
    if (!shouldRunPipelineStep(cur, step)) {
      cur = appendSkippedPipelineTrace(cur, step, phase);
      continue;
    }
    runnable.push(step);
  }
  if (!runnable.length) return cur;
  if (phase === 'post') {
    return runOutputPipeline(cur, runnable);
  }
  return runInputPipeline(cur, runnable);
}

function ensureSeedContract(ctx: TaskContext): TaskContext {
  if (getContract(ctx)) return ctx;
  return withContract(
    ctx,
    emptyContract({
      version: MXM_WARP_CONTRACT_VERSION,
      scope: ctx.scope,
      taskKey: ctx.taskKey,
      subtype: ctx.subtype ?? null,
      taskId: ctx.taskId || '',
    })
  );
}

export interface RunMxmWarpArgs {
  ctx: TaskContext;
  template: TaskTemplate;
  inputLlm?: WarpLlmFn;
  outputLlm: WarpLlmFn;
}

export async function runMxmWarp(args: RunMxmWarpArgs): Promise<TaskContext> {
  const { template, outputLlm, inputLlm } = args;
  let ctx = ensureSeedContract(args.ctx);
  const pipeline = readWarpPipeline(template);
  const contractSchema = readContractSchema(template);

  if (!contractSchema) {
    throw new Error('mxm-warp 需要 taskTemplate.contractSchema');
  }

  const shape = resolveWarpShape(ctx.scope, ctx.taskKey);
  ctx = {
    ...ctx,
    state: { ...ctx.state, warpShape: shape },
  };

  ctx = await runConfigurablePhase(ctx, pipeline.pre, 'pre');
  ctx = await runInputStage({ ctx, contractSchema, llm: inputLlm });
  ctx = await runConfigurablePhase(ctx, pipeline.enrich, 'enrich');

  const outputPrompt =
    typeof template.prompt?.unifiedTemplate === 'string' ? template.prompt.unifiedTemplate : '';
  ctx = await runOutputStage({ ctx, outputPrompt, llm: outputLlm });
  ctx = await runConfigurablePhase(ctx, pipeline.post, 'post');

  return ctx;
}
