/**
 * Reflection 复合节点：Generate → Critique → Revise 循环
 */

import { SmartflowNode, ExecutionContext } from '../models/types';
import { BaseExecutor, ExecutorResult } from './base';
import type { CompositeTaskRef } from '../models/composite-types';
import {
  buildCompositeOutput,
  CompositeRunState,
  critiquePassed,
  resolveNodeString,
  runCompositeTaskRef,
  usageFromMetadata,
} from '../composite/runner';

const DEFAULT_CRITIC: CompositeTaskRef = {
  kind: 'model',
  model: 'gpt-4o-mini',
};

const DEFAULT_REVISER: CompositeTaskRef = {
  kind: 'model',
  model: 'gpt-4o-mini',
};

export class ReflectionExecutor extends BaseExecutor {
  async execute(node: SmartflowNode, context: ExecutionContext): Promise<ExecutorResult> {
    try {
      const userId = context.execution?.user_id;
      if (!userId) {
        return this.createErrorResult('Reflection node requires user_id in context');
      }

      const task = resolveNodeString(node.task, context, 'Improve the artifact quality.');
      const passPattern = node.pass_pattern?.trim() || 'PASS';
      const maxRounds = Math.min(Math.max(node.max_rounds ?? 3, 1), 10);
      const critic = (node.critic as CompositeTaskRef | undefined) ?? DEFAULT_CRITIC;
      const reviser = (node.reviser as CompositeTaskRef | undefined) ?? DEFAULT_REVISER;
      const generator = node.generator as CompositeTaskRef | undefined;

      const state = new CompositeRunState();
      let artifact = resolveNodeString(node.artifact, context, '');

      if (!artifact.trim()) {
        const genPrompt = `Task:\n${task}\n\nGenerate the initial draft.`;
        const t0 = Date.now();
        const gen = await runCompositeTaskRef(generator, genPrompt, context, userId);
        state.appendTrace({
          phase: 'generate',
          node_ref: generator?.taskKey ?? 'model',
          duration_ms: Date.now() - t0,
          summary: gen.text.slice(0, 200),
        });
        state.addUsage(usageFromMetadata(gen.metadata));
        state.addNestedTaskId(gen.taskId);
        artifact = gen.text;
      }

      const initialArtifact = artifact;
      const revisions: Array<{ round: number; critique: string; artifact_preview: string }> = [];
      let passed = false;
      let finalCritique = '';
      let stopReason: 'pass' | 'max_steps' | 'finished' = 'finished';

      for (let round = 1; round <= maxRounds; round++) {
        const critiquePrompt = `Task:\n${task}\n\nArtifact to review:\n${artifact}\n\nIf acceptable, include ${passPattern} in your review.`;
        const t1 = Date.now();
        const crit = await runCompositeTaskRef(critic, critiquePrompt, context, userId);
        finalCritique = crit.text;
        state.appendTrace({
          phase: 'critique',
          node_ref: `${critic.taskKey ?? 'critic'}/${critic.subtype ?? ''}`,
          duration_ms: Date.now() - t1,
          summary: crit.text.slice(0, 200),
          passed: critiquePassed(crit.text, passPattern),
        });
        state.addUsage(usageFromMetadata(crit.metadata));
        state.addNestedTaskId(crit.taskId);

        if (critiquePassed(crit.text, passPattern)) {
          passed = true;
          stopReason = 'pass';
          break;
        }

        if (round >= maxRounds) {
          stopReason = 'max_steps';
          break;
        }

        const revisePrompt = `Task:\n${task}\n\nCurrent artifact:\n${artifact}\n\nCritique:\n${crit.text}\n\nRevise the artifact accordingly. Output only the revised artifact.`;
        const t2 = Date.now();
        const rev = await runCompositeTaskRef(reviser, revisePrompt, context, userId);
        artifact = rev.text;
        revisions.push({
          round,
          critique: crit.text.slice(0, 500),
          artifact_preview: artifact.slice(0, 200),
        });
        state.appendTrace({
          phase: 'revise',
          node_ref: reviser.taskKey ?? reviser.model ?? 'reviser',
          duration_ms: Date.now() - t2,
          summary: artifact.slice(0, 200),
        });
        state.addUsage(usageFromMetadata(rev.metadata));
        state.addNestedTaskId(rev.taskId);
      }

      const output = buildCompositeOutput(
        'reflection',
        artifact,
        {
          passed,
          rounds: revisions.length + (passed ? 1 : 0),
          initial_artifact: initialArtifact.slice(0, 500),
          final_critique: finalCritique.slice(0, 1000),
          revisions,
        },
        state.trace,
        state.usage,
        stopReason,
        true
      );

      return this.createSuccessResult(output);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return this.createErrorResult(`Reflection executor error: ${msg}`);
    }
  }
}
