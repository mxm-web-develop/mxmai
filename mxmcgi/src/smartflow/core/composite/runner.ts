/**
 * 复合节点共享运行时：text / business / model 调用与 trace/usage 聚合
 */

import { runTaskV2, type RunTaskV2Options } from '../../../tasks/task-engine';
import { extractOpenApiContext } from '../../../open-api/context';
import type { TaskRunV2Response } from '../../../tasks/types';
import { ConfigurationError } from '../../../tasks/errors';
import { mxmCGIHttpClient } from '../../services/httpClient';
import { resolveWritingModel } from './default-writing-model';
import type { ExecutionContext } from '../models/types';
import type {
  CompositeNodeOutput,
  CompositePattern,
  CompositeStopReason,
  CompositeTaskRef,
  CompositeTraceStep,
  CompositeUsage,
} from '../models/composite-types';
import { emptyUsage, mergeUsage } from '../models/composite-types';
import { VariableResolver } from '../variables/resolver';

export function resolveNodeString(
  value: string | undefined,
  context: ExecutionContext,
  fallback = ''
): string {
  if (!value?.trim()) return fallback;
  return VariableResolver.resolve(value, context);
}

export function usageFromMetadata(meta: Record<string, unknown> | undefined): Partial<CompositeUsage> {
  const u = meta?.usage as Record<string, number> | undefined;
  if (!u) return { llm_calls: 1 };
  const input = Number(u.prompt_tokens ?? u.input_tokens ?? 0);
  const output = Number(u.completion_tokens ?? u.output_tokens ?? 0);
  return {
    input_tokens: input,
    output_tokens: output,
    total_tokens: Number(u.total_tokens ?? input + output),
    llm_calls: 1,
    cost_usd: typeof meta?.costUsd === 'number' ? meta.costUsd : undefined,
  };
}

function runOptionsFromContext(context: ExecutionContext): RunTaskV2Options | undefined {
  const openApi = extractOpenApiContext(context.execution?.input_data as Record<string, unknown>);
  if (!openApi) return undefined;
  return { openApi };
}

export async function runTextTask(
  taskKey: string,
  subtype: string | null,
  params: Record<string, unknown>,
  userId: string,
  context?: ExecutionContext
): Promise<{ text: string; metadata?: Record<string, unknown>; taskId?: string }> {
  const res = await runTaskV2(
    {
      scope: 'text',
      taskKey,
      subtype,
      params,
    },
    userId,
    context ? runOptionsFromContext(context) : undefined
  );
  return extractTextFromTaskResponse(res);
}

export async function runBusinessTask(
  scope: string,
  taskKey: string,
  subtype: string | null,
  params: Record<string, unknown>,
  userId: string,
  context?: ExecutionContext
): Promise<{ text: string; metadata?: Record<string, unknown>; taskId?: string }> {
  const res = await runTaskV2(
    {
      scope: scope as 'writing' | 'graph' | 'audio' | 'video' | 'outline' | 'text',
      taskKey,
      subtype,
      params,
    },
    userId,
    context ? runOptionsFromContext(context) : undefined
  );
  return extractTextFromTaskResponse(res);
}

export async function runModelCompletion(
  model: string,
  prompt: string,
  userId: string,
  params: Record<string, unknown> = {}
): Promise<{ text: string; metadata?: Record<string, unknown> }> {
  const resolvedModel = resolveWritingModel(model);
  const response = await mxmCGIHttpClient.writingCompletion(
    resolvedModel,
    { prompt, ...params },
    userId
  );
  const inner = (response as { result?: unknown })?.result ?? response;
  const text =
    (typeof inner === 'string' ? inner : null) ??
    (inner as { text?: string })?.text ??
    (response as { data?: { text?: string } })?.data?.text ??
    '';
  const usage = (inner as { usage?: Record<string, unknown> })?.usage;
  return {
    text: String(text),
    metadata: {
      usage,
      model: resolvedModel,
    },
  };
}

function isMissingTaskConfigError(err: unknown): boolean {
  if (err instanceof ConfigurationError) return true;
  if (err instanceof Error && err.message.includes('未找到 Task 配置')) return true;
  return false;
}

function fallbackModelFromRef(ref: CompositeTaskRef | undefined): string {
  const m = ref?.model?.trim();
  const fromParams = ref?.params?.model;
  const preferred =
    m ||
    (typeof fromParams === 'string' && fromParams.trim() ? fromParams.trim() : undefined);
  return resolveWritingModel(preferred);
}

export async function runCompositeTaskRef(
  ref: CompositeTaskRef | undefined,
  prompt: string,
  context: ExecutionContext,
  userId: string
): Promise<{ text: string; metadata?: Record<string, unknown>; taskId?: string }> {
  const kind = ref?.kind ?? 'model';
  const params = { prompt, ...(ref?.params ?? {}) };
  const fallbackModel = fallbackModelFromRef(ref);

  if (kind === 'text') {
    try {
      return await runTextTask(ref?.taskKey ?? 'format', ref?.subtype ?? null, params, userId, context);
    } catch (err) {
      if (!isMissingTaskConfigError(err)) throw err;
      console.warn(
        `[Composite] text task config missing (scope=text taskKey=${ref?.taskKey ?? 'format'} subtype=${ref?.subtype ?? 'null'}), fallback to model ${fallbackModel}`
      );
      return runModelCompletion(fallbackModel, prompt, userId, ref?.params ?? {});
    }
  }
  if (kind === 'business') {
    try {
      return await runBusinessTask(
        ref?.scope ?? 'writing',
        ref?.taskKey ?? 'articles',
        ref?.subtype ?? null,
        params,
        userId,
        context
      );
    } catch (err) {
      if (!isMissingTaskConfigError(err)) throw err;
      console.warn(
        `[Composite] business task config missing (scope=${ref?.scope} taskKey=${ref?.taskKey}), fallback to model ${fallbackModel}`
      );
      return runModelCompletion(fallbackModel, prompt, userId, ref?.params ?? {});
    }
  }
  return runModelCompletion(fallbackModel, prompt, userId, ref?.params ?? {});
}

function extractTextFromTaskResponse(res: TaskRunV2Response): {
  text: string;
  metadata?: Record<string, unknown>;
  taskId?: string;
} {
  if (!res.success) {
    throw new Error(`Task failed: ${res.taskId ?? 'unknown'}`);
  }
  const sync = res.syncResult;
  const text =
    sync?.text ??
    (typeof sync?.metadata?.text === 'string' ? sync.metadata.text : '') ??
    '';
  if (!text && res.status === 'completed') {
    return {
      text: JSON.stringify(sync ?? res),
      metadata: sync?.metadata as Record<string, unknown> | undefined,
      taskId: res.taskId,
    };
  }
  return {
    text: String(text),
    metadata: sync?.metadata as Record<string, unknown> | undefined,
    taskId: res.taskId,
  };
}

export function buildCompositeOutput(
  pattern: CompositePattern,
  result: string,
  meta: Record<string, unknown>,
  trace: CompositeTraceStep[],
  usage: CompositeUsage,
  stopReason: CompositeStopReason,
  completed = true
): CompositeNodeOutput<string> {
  return {
    pattern,
    result,
    text: result,
    completed,
    stop_reason: stopReason,
    meta,
    trace,
    usage,
  };
}

export class CompositeRunState {
  trace: CompositeTraceStep[] = [];
  usage: CompositeUsage = emptyUsage();
  stepIndex = 0;

  appendTrace(entry: Omit<CompositeTraceStep, 'step'>): void {
    this.stepIndex += 1;
    this.trace.push({ step: this.stepIndex, ...entry });
  }

  addUsage(partial: Partial<CompositeUsage>): void {
    this.usage = mergeUsage(this.usage, partial);
  }

  addNestedTaskId(id: string | undefined): void {
    if (!id) return;
    const ids = this.usage.nested_task_ids ?? [];
    if (!ids.includes(id)) {
      this.usage.nested_task_ids = [...ids, id];
    }
  }
}

/** 从 LLM 文本解析 JSON 数组（计划步骤） */
export function parseStepsFromPlanText(text: string): string[] {
  const trimmed = text.trim();
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map((s) => (typeof s === 'string' ? s : JSON.stringify(s)));
    }
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { steps?: unknown }).steps)) {
      return ((parsed as { steps: unknown[] }).steps).map((s) =>
        typeof s === 'string' ? s : JSON.stringify(s)
      );
    }
  } catch {
    /* fall through */
  }
  const lines = trimmed
    .split('\n')
    .map((l) => l.replace(/^[\d.\-\*]+\s*/, '').trim())
    .filter((l) => l.length > 2);
  return lines.length > 0 ? lines.slice(0, 8) : [trimmed];
}

export function critiquePassed(critique: string, passPattern: string): boolean {
  const upper = critique.toUpperCase();
  return upper.includes(passPattern.toUpperCase()) || upper.includes('APPROVED');
}
