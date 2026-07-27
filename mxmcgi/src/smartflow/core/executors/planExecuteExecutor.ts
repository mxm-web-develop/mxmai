/**
 * Plan-and-Execute 复合节点
 */

import { SmartflowNode, ExecutionContext } from '../models/types';
import { BaseExecutor, ExecutorResult } from './base';
import type { CompositeTaskRef } from '../models/composite-types';
import {
  buildCompositeOutput,
  CompositeRunState,
  parseStepsFromPlanText,
  resolveNodeString,
  runCompositeTaskRef,
  usageFromMetadata,
} from '../composite/runner';

const DEFAULT_PLANNER: CompositeTaskRef = {
  kind: 'model',
  model: 'gpt-4o-mini',
};

const DEFAULT_EXECUTOR: CompositeTaskRef = {
  kind: 'model',
  model: 'gpt-4o-mini',
};

export class PlanExecuteExecutor extends BaseExecutor {
  async execute(node: SmartflowNode, context: ExecutionContext): Promise<ExecutorResult> {
    try {
      const userId = context.execution?.user_id;
      if (!userId) {
        return this.createErrorResult('PlanExecute node requires user_id in context');
      }

      const goal = resolveNodeString(node.goal, context, 'Complete the user goal.');
      const ctxText = resolveNodeString(node.context, context, '');
      const maxSteps = Math.min(Math.max(node.max_steps ?? 6, 1), 12);
      const maxReplans = Math.min(Math.max(node.max_replans ?? 2, 0), 5);
      const replanOnFailure = node.replan_on_failure !== false;
      const planner = (node.planner as CompositeTaskRef | undefined) ?? DEFAULT_PLANNER;
      const executor = (node.executor as CompositeTaskRef | undefined) ?? DEFAULT_EXECUTOR;
      const replanner = (node.replanner as CompositeTaskRef | undefined) ?? planner;

      const state = new CompositeRunState();
      let steps: string[] = [];
      let summary = '';
      let replanCount = 0;
      const stepsDone: Array<{
        step: string;
        status: 'success' | 'failed';
        output_preview?: string;
        error?: string;
      }> = [];

      const planPrompt = `Goal:\n${goal}\n${ctxText ? `\nContext:\n${ctxText}` : ''}\n\nOutput a JSON array of ${maxSteps} or fewer concrete executable steps.`;
      const tPlan = Date.now();
      const planRes = await runCompositeTaskRef(planner, planPrompt, context, userId);
      steps = parseStepsFromPlanText(planRes.text).slice(0, maxSteps);
      state.appendTrace({
        phase: 'plan',
        node_ref: `${planner.taskKey}/${planner.subtype ?? ''}`,
        duration_ms: Date.now() - tPlan,
        summary: steps.join('; ').slice(0, 200),
      });
      state.addUsage(usageFromMetadata(planRes.metadata));

      let i = 0;
      while (i < steps.length) {
        const step = steps[i];
        const execPrompt = `Goal: ${goal}\nCurrent step (${i + 1}/${steps.length}): ${step}\n\nPrior summary:\n${summary || '(none)'}\n\nExecute this step only.`;
        try {
          const tExec = Date.now();
          const execRes = await runCompositeTaskRef(executor, execPrompt, context, userId);
          summary += `\n- ${step}: ${execRes.text.slice(0, 300)}`;
          stepsDone.push({ step, status: 'success', output_preview: execRes.text.slice(0, 200) });
          state.appendTrace({
            phase: 'execute',
            node_ref: executor.taskKey ?? executor.model,
            duration_ms: Date.now() - tExec,
            summary: execRes.text.slice(0, 120),
          });
          state.addUsage(usageFromMetadata(execRes.metadata));
          state.addNestedTaskId(execRes.taskId);
          i += 1;
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          stepsDone.push({ step, status: 'failed', error: errMsg });
          if (!replanOnFailure || replanCount >= maxReplans) {
            const output = buildCompositeOutput(
              'plan_execute',
              summary.trim() || `Failed at step: ${step}`,
              { plan: steps, steps_done: stepsDone, summary, replan_count: replanCount, failed_step: step },
              state.trace,
              state.usage,
              'error',
              false
            );
            return this.createSuccessResult(output);
          }
          replanCount += 1;
          const replanPrompt = `Goal: ${goal}\nCompleted:\n${stepsDone.filter((s) => s.status === 'success').map((s) => s.step).join(', ')}\nFailed step: ${step}\nError: ${errMsg}\n\nOutput remaining steps as JSON array.`;
          const tRe = Date.now();
          const reRes = await runCompositeTaskRef(replanner, replanPrompt, context, userId);
          const remaining = parseStepsFromPlanText(reRes.text);
          steps = [
            ...stepsDone.filter((s) => s.status === 'success').map((s) => s.step),
            ...remaining,
          ].slice(0, maxSteps);
          i = stepsDone.filter((s) => s.status === 'success').length;
          state.appendTrace({
            phase: 'replan',
            duration_ms: Date.now() - tRe,
            summary: remaining.join('; ').slice(0, 200),
          });
          state.addUsage(usageFromMetadata(reRes.metadata));
        }
      }

      const resultText = summary.trim() || planRes.text;
      const output = buildCompositeOutput(
        'plan_execute',
        resultText,
        {
          plan: steps,
          steps_done: stepsDone,
          summary: resultText,
          replan_count: replanCount,
        },
        state.trace,
        state.usage,
        'finished',
        true
      );
      return this.createSuccessResult(output);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return this.createErrorResult(`PlanExecute executor error: ${msg}`);
    }
  }
}
