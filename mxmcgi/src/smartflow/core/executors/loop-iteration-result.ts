/**
 * Loop iteration 结构化结果与失败策略
 */

import type { ExecutorResult } from './base';
import type { LoopIterationErrorPolicy, LoopIterationResultRow } from '../models/types';

export function extractTaskIdFromOutput(output: unknown): string | undefined {
  if (output == null || typeof output !== 'object') return undefined;
  const o = output as Record<string, unknown>;
  const data = o.data as Record<string, unknown> | undefined;
  const id = o.taskId ?? o.task_id ?? data?.taskId ?? data?.task_id;
  return typeof id === 'string' && id.trim() ? id.trim() : undefined;
}

export function extractMediaUrlsFromOutput(output: unknown): string[] | undefined {
  if (output == null || typeof output !== 'object') return undefined;
  const o = output as Record<string, unknown>;
  const sync = o.syncResult as Record<string, unknown> | undefined;
  const raw = o.mediaUrls ?? o.image_urls ?? sync?.mediaUrls;
  if (!Array.isArray(raw)) return undefined;
  const urls = raw.filter((u): u is string => typeof u === 'string' && u.trim().length > 0);
  return urls.length > 0 ? urls : undefined;
}

export function normalizeIterationRow(
  index: number,
  subGraphResult: ExecutorResult
): LoopIterationResultRow {
  if (subGraphResult.success) {
    const output = subGraphResult.output;
    return {
      index,
      success: true,
      taskId: extractTaskIdFromOutput(output),
      mediaUrls: extractMediaUrlsFromOutput(output),
      output,
    };
  }
  return {
    index,
    success: false,
    error: subGraphResult.error ?? 'Sub-graph execution failed',
    output: subGraphResult.output,
  };
}

export interface ApplyIterationPolicyResult {
  results: LoopIterationResultRow[];
  successCount: number;
  failedCount: number;
  loopSuccess: boolean;
  loopError?: string;
}

export function applyIterationErrorPolicy(
  rows: LoopIterationResultRow[],
  policy: LoopIterationErrorPolicy
): ApplyIterationPolicyResult {
  const successCount = rows.filter((r) => r.success).length;
  const failedCount = rows.filter((r) => !r.success).length;

  switch (policy) {
    case 'skip':
      return {
        results: rows.filter((r) => r.success),
        successCount,
        failedCount,
        loopSuccess: true,
      };
    case 'collect_errors':
      return {
        results: rows,
        successCount,
        failedCount,
        loopSuccess: true,
      };
    case 'fail_fast':
      return {
        results: rows,
        successCount,
        failedCount,
        loopSuccess: failedCount === 0,
        loopError:
          failedCount > 0
            ? rows.find((r) => !r.success)?.error ?? 'Loop iteration failed (fail_fast)'
            : undefined,
      };
    default:
      return applyIterationErrorPolicy(rows, 'collect_errors');
  }
}

export function buildLoopIterationOutput(
  rows: LoopIterationResultRow[],
  policy: LoopIterationErrorPolicy,
  outputVariable: string,
  meta: {
    total_items: number;
    parallel_iterations: boolean;
    loop_mode: string;
  }
): Record<string, unknown> {
  const applied = applyIterationErrorPolicy(rows, policy);
  return {
    [outputVariable]: applied.results,
    total_items: meta.total_items,
    success_count: applied.successCount,
    failed_count: applied.failedCount,
    count: applied.results.length,
    on_iteration_error: policy,
    parallel_iterations: meta.parallel_iterations,
    loop_mode: meta.loop_mode,
  };
}

export function resolveLoopIterationErrorPolicy(
  policy: LoopIterationErrorPolicy | undefined
): LoopIterationErrorPolicy {
  if (policy === 'skip' || policy === 'fail_fast' || policy === 'collect_errors') {
    return policy;
  }
  return 'collect_errors';
}
