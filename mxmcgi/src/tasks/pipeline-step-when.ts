/**
 * Pipeline step 执行条件（Admin 可配，运行时通用求值）
 *
 * 示例：
 * {
 *   "all": [
 *     { "field": "params.make_instrumental", "op": "falsy" },
 *     { "field": "params.lyrics", "op": "empty" }
 *   ]
 * }
 */
import type { PipelineStep, PipelineTraceEntry, TaskContext } from './types';

export type PipelineWhenOp = 'eq' | 'neq' | 'empty' | 'notEmpty' | 'truthy' | 'falsy';

export type PipelineWhenClause = {
  field: string;
  op: PipelineWhenOp;
  value?: unknown;
};

export type PipelineWhenConfig = {
  all?: PipelineWhenClause[];
  any?: PipelineWhenClause[];
};

function readRawFieldValue(ctx: TaskContext, field: string): unknown {
  const path = field.trim();
  if (!path) return undefined;
  if (path.startsWith('params.')) {
    return ctx.params[path.slice('params.'.length)];
  }
  if (path.startsWith('state.')) {
    const rest = path.slice('state.'.length);
    let cur: unknown = ctx.state;
    for (const seg of rest.split('.')) {
      if (cur == null || typeof cur !== 'object') return undefined;
      cur = (cur as Record<string, unknown>)[seg];
    }
    return cur;
  }
  if (Object.prototype.hasOwnProperty.call(ctx.params, path)) return ctx.params[path];
  if (Object.prototype.hasOwnProperty.call(ctx.state, path)) return ctx.state[path];
  return undefined;
}

function isEmptyValue(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length === 0;
  return false;
}

function coerceComparable(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  const t = raw.trim();
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  return raw;
}

function valuesEqual(left: unknown, right: unknown): boolean {
  const a = coerceComparable(left);
  const b = coerceComparable(right);
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (typeof a === 'boolean' || typeof b === 'boolean') {
    return Boolean(a) === Boolean(b);
  }
  return String(a ?? '') === String(b ?? '');
}

function evaluateClause(ctx: TaskContext, clause: PipelineWhenClause): boolean {
  const op = clause.op;
  const value = readRawFieldValue(ctx, clause.field);

  switch (op) {
    case 'empty':
      return isEmptyValue(value);
    case 'notEmpty':
      return !isEmptyValue(value);
    case 'truthy':
      return !isEmptyValue(value) && value !== false;
    case 'falsy':
      return isEmptyValue(value) || value === false;
    case 'eq':
      return valuesEqual(value, clause.value);
    case 'neq':
      return !valuesEqual(value, clause.value);
    default:
      return true;
  }
}

function isWhenClause(raw: unknown): raw is PipelineWhenClause {
  if (!raw || typeof raw !== 'object') return false;
  const c = raw as PipelineWhenClause;
  return typeof c.field === 'string' && typeof c.op === 'string';
}

export function evaluatePipelineStepWhen(
  ctx: TaskContext,
  when?: Record<string, unknown> | PipelineWhenConfig | null
): boolean {
  if (!when || Object.keys(when).length === 0) return true;

  const all = Array.isArray(when.all) ? when.all.filter(isWhenClause) : [];
  const any = Array.isArray(when.any) ? when.any.filter(isWhenClause) : [];

  if (all.length === 0 && any.length === 0) return true;
  if (all.length > 0 && !all.every((clause) => evaluateClause(ctx, clause))) return false;
  if (any.length > 0 && !any.some((clause) => evaluateClause(ctx, clause))) return false;
  return true;
}

export function shouldRunPipelineStep(ctx: TaskContext, step: PipelineStep): boolean {
  return evaluatePipelineStepWhen(ctx, step.when);
}

export function appendSkippedPipelineTrace(
  ctx: TaskContext,
  step: PipelineStep,
  phase: 'pre' | 'post' | 'enrich'
): TaskContext {
  const trace = Array.isArray(ctx.state.pipelineTrace)
    ? [...(ctx.state.pipelineTrace as PipelineTraceEntry[])]
    : [];
  trace.push({
    step: step.step,
    durationMs: 0,
    phase,
    skipped: true,
  });
  return { ...ctx, state: { ...ctx.state, pipelineTrace: trace } };
}
