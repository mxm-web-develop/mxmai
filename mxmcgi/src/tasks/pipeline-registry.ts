/**
 * pipeline-registry.ts
 * Pipeline step runner 的注册表。
 * 无环依赖中心模块，供 pipeline.ts / business-pipeline-steps.ts 等注册与执行。
 */

import type { PipelineRunner, TaskContext, PipelineStep } from './types';

const _inputSteps = new Map<string, PipelineRunner>();
const _outputSteps = new Map<string, PipelineRunner>();

export function registerInputStep(name: string, runner: PipelineRunner): void {
  _inputSteps.set(name, runner);
}
export function registerOutputStep(name: string, runner: PipelineRunner): void {
  _outputSteps.set(name, runner);
}

export function getInputRunner(name: string): PipelineRunner | undefined {
  return _inputSteps.get(name);
}
export function getOutputRunner(name: string): PipelineRunner | undefined {
  return _outputSteps.get(name);
}

export async function runInputPipeline(ctx: TaskContext, steps: PipelineStep[] | undefined): Promise<TaskContext> {
  let cur = ctx;
  for (const s of steps ?? []) {
    const r = _inputSteps.get(s.step);
    if (!r) throw new Error(`未知 inputPipeline step: ${s.step}`);
    cur = await r(cur, s);
  }
  return cur;
}

export async function runOutputPipeline(ctx: TaskContext, steps: PipelineStep[] | undefined): Promise<TaskContext> {
  let cur = ctx;
  for (const s of steps ?? []) {
    const r = _outputSteps.get(s.step);
    if (!r) throw new Error(`未知 outputPipeline step: ${s.step}`);
    cur = await r(cur, s);
  }
  return cur;
}
