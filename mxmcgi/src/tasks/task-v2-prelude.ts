/**
 * Task v2 业务前置管线（替代固定 prelude）
 */
import type { TaskContext, TaskTemplate } from './types';
import { runBusinessPrePipeline } from './business-pipeline';
import './pipeline';
import './business-pipeline-steps';

export async function runFixedTaskV2Prelude(ctx: TaskContext, template: TaskTemplate): Promise<TaskContext> {
  return runBusinessPrePipeline(ctx, template, ctx.scope);
}

/** @deprecated 使用 runBusinessPrePipeline */
export { runBusinessPrePipeline } from './business-pipeline';
