/**
 * Admin 操作监控室：浏览器缓存的调试会话快照（含引导期 I/O + pipelineTrace）
 */
import type { CreateGuideStepIoEvent } from './WritingCreateWizard';

export type DebugHistoryPipelineRow = {
  step: string;
  durationMs?: number;
  phase?: string;
  skipped?: boolean;
  ok?: boolean;
  error?: string;
  label?: string;
  nestedTaskId?: string;
  costUsd?: number;
  inputSnapshot?: unknown;
  outputSnapshot?: unknown;
};

export type DebugHistoryRuntimeNode = {
  key: string;
  phase?: string;
  step: string;
  label?: string;
  status?: 'running' | 'done' | 'error' | 'skipped';
  durationMs?: number;
  nestedTaskId?: string;
  inputSnapshot?: unknown;
  outputSnapshot?: unknown;
  error?: string;
};

export type DebugHistorySession = {
  id: string;
  savedAt: string;
  scope: string;
  taskKey: string;
  subtype: string | null;
  taskId?: string | null;
  status: 'done' | 'error' | 'partial';
  /** 失败时的可读报错原文（列表与回看优先展示） */
  errorMessage?: string;
  elapsedSec?: number;
  label?: string;
  guideIo: CreateGuideStepIoEvent[];
  pipelineTrace: DebugHistoryPipelineRow[];
  runtimeIo: DebugHistoryRuntimeNode[];
};

const PREFIX = 'mxm.adminDebugHistory.v1';
const MAX_SESSIONS = 20;
const MAX_JSON_CHARS = 1_800_000;

function storageKey(scope: string, taskKey: string, subtype: string | null): string {
  return `${PREFIX}:${scope}:${taskKey}:${subtype ?? ''}`;
}

function slimValue(v: unknown, budget: { left: number }): unknown {
  if (budget.left <= 0) return '[truncated]';
  if (v == null || typeof v === 'number' || typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    if (v.length > 8_000) {
      budget.left -= 8_000;
      return `${v.slice(0, 8_000)}…[truncated ${v.length}]`;
    }
    budget.left -= v.length;
    return v;
  }
  if (Array.isArray(v)) {
    const out: unknown[] = [];
    for (let i = 0; i < v.length; i++) {
      if (budget.left <= 0) {
        out.push(`…+${v.length - i} truncated`);
        break;
      }
      out.push(slimValue(v[i], budget));
    }
    return out;
  }
  if (typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, child] of Object.entries(v as Record<string, unknown>)) {
      if (budget.left <= 0) {
        out['__truncated'] = true;
        break;
      }
      out[k] = slimValue(child, budget);
    }
    return out;
  }
  return String(v);
}

function slimSession(session: DebugHistorySession): DebugHistorySession {
  const budget = { left: MAX_JSON_CHARS };
  const slimIo = <T extends { inputSnapshot?: unknown; outputSnapshot?: unknown }>(rows: T[]): T[] =>
    rows.map((r) => ({
      ...r,
      inputSnapshot: r.inputSnapshot !== undefined ? slimValue(r.inputSnapshot, budget) : undefined,
      outputSnapshot: r.outputSnapshot !== undefined ? slimValue(r.outputSnapshot, budget) : undefined,
    }));
  return {
    ...session,
    guideIo: slimIo(session.guideIo),
    pipelineTrace: slimIo(session.pipelineTrace),
    runtimeIo: slimIo(session.runtimeIo),
  };
}

export function loadDebugHistory(
  scope: string,
  taskKey: string,
  subtype: string | null
): DebugHistorySession[] {
  try {
    const raw = localStorage.getItem(storageKey(scope, taskKey, subtype));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is DebugHistorySession =>
        !!x && typeof x === 'object' && typeof (x as DebugHistorySession).id === 'string'
    );
  } catch {
    return [];
  }
}

export function saveDebugHistorySession(
  scope: string,
  taskKey: string,
  subtype: string | null,
  session: Omit<DebugHistorySession, 'scope' | 'taskKey' | 'subtype'>
): DebugHistorySession[] {
  const full: DebugHistorySession = slimSession({
    ...session,
    scope,
    taskKey,
    subtype,
  });
  const prev = loadDebugHistory(scope, taskKey, subtype).filter((s) => s.id !== full.id);
  const next = [full, ...prev].slice(0, MAX_SESSIONS);
  try {
    localStorage.setItem(storageKey(scope, taskKey, subtype), JSON.stringify(next));
  } catch {
    // quota：再缩一档只留最近 5 条
    try {
      localStorage.setItem(storageKey(scope, taskKey, subtype), JSON.stringify(next.slice(0, 5)));
    } catch {
      /* ignore */
    }
  }
  return next;
}

export function removeDebugHistorySession(
  scope: string,
  taskKey: string,
  subtype: string | null,
  id: string
): DebugHistorySession[] {
  const next = loadDebugHistory(scope, taskKey, subtype).filter((s) => s.id !== id);
  try {
    localStorage.setItem(storageKey(scope, taskKey, subtype), JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}
