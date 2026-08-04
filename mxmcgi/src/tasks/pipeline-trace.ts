/**
 * 管线逐步追踪：Admin 调试 I/O。
 *
 * 硬约束：按**节点配置声明**解析，禁止按业务字段（industry / topic…）写死。
 * 快照形态：
 *   input  → { config, resolved }
 *   output → { config, produced }
 * config = 节点原样声明；resolved/produced = 声明路径上的本次值（大对象会摘要）。
 */
import type { PipelineStep, PipelineTraceEntry, TaskContext } from './types';
import {
  getEvidenceStore,
  isAdminPipelineDebug,
  snapshotForTrace,
} from './mxm-warp/evidence';
import { getContract } from './mxm-warp/input-stage';
import { resolvePipelineMappingValue } from './business-pipeline';

/** Admin 监控室：尽量保留完整 raw（仍设硬顶防单行 jsonb 爆炸） */
const ADMIN_TRACE_JSON_MAX = 512_000;

const TRACE_IO_SCHEMA = 'pipeline-step-io/v1';

/**
 * 平台 step 的结构级读写端口（证据 / 成稿），不是业务字段名。
 * 业务差异必须落在节点 params / inputMapping / fieldMapping。
 */
const PLATFORM_STEP_PORTS: Record<
  string,
  { reads?: string[]; writes?: string[] }
> = {
  webSearch: {
    writes: [],
  },
  extractHotTopics: {
    reads: ['state.evidence.websource', 'contract.sources.websource'],
    writes: [
      'contract.sources.websource.topicChips',
      'contract.sources.websource.topicPool',
    ],
  },
  pruneToSelection: {
    reads: ['state.evidence.websource', 'contract.sources.websource'],
    writes: ['contract.sources.websource'],
  },
  pickMainTopic: {
    reads: ['contract.sources.websource.topicChips'],
    writes: [],
  },
  nestedText: {
    reads: [],
    writes: [],
  },
  manualReview: {
    reads: [],
    writes: [],
  },
};

/** params 里表示「路径 / 字段名」的通用键（跨业务） */
const PATHISH_PARAM_KEYS = new Set([
  'queryFrom',
  'queriesFrom',
  'excludeQueryFrom',
  'scaleFrom',
  'draftFrom',
  'itemsFrom',
  'inputFrom',
  'commonGroundFrom',
  'chipsPath',
  'target',
  'targetField',
  'targetZone',
  'sectorFrom',
  'dateModeFrom',
  'reportDateFrom',
  'evidenceFrom',
  'evidenceKey',
  'sourceKey',
]);

const PLACEHOLDER_RE = /\$\{([^}]+)\}/g;

export function appendPipelineTraceEntry(
  ctx: TaskContext,
  entry: PipelineTraceEntry
): TaskContext {
  const trace = Array.isArray(ctx.state.pipelineTrace)
    ? [...(ctx.state.pipelineTrace as PipelineTraceEntry[])]
    : [];
  trace.push(entry);
  return { ...ctx, state: { ...ctx.state, pipelineTrace: trace } };
}

function stepLabel(step: PipelineStep): string | undefined {
  const key = step.nestedTextTaskKey?.trim();
  if (key) return key;
  const t = String((step.params as Record<string, unknown> | undefined)?.target ?? '').trim();
  return t || undefined;
}

function getByDot(root: unknown, path: string): unknown {
  const parts = path.split('.').filter(Boolean);
  let cur: unknown = root;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

/** 解析 contract.* / params.* / state.* / 裸字段名 */
export function resolveTracePath(ctx: TaskContext, rawPath: string): unknown {
  const p = String(rawPath ?? '').trim();
  if (!p) return undefined;
  if (p.startsWith('state.')) return getByDot(ctx.state, p.slice('state.'.length));
  if (p.startsWith('params.')) return getByDot(ctx.params, p.slice('params.'.length));
  if (p.startsWith('contract.')) {
    const contract = getContract(ctx);
    if (!contract) return undefined;
    return getByDot(contract, p.slice('contract.'.length));
  }
  if (p === 'contract') return getContract(ctx);
  if (p === 'params') return ctx.params;
  if (p === 'state') return ctx.state;
  const contract = getContract(ctx);
  const basic =
    contract?.basic && typeof contract.basic === 'object'
      ? (contract.basic as Record<string, unknown>)
      : {};
  if (Object.prototype.hasOwnProperty.call(basic, p)) return basic[p];
  if (Object.prototype.hasOwnProperty.call(ctx.params ?? {}, p)) {
    return (ctx.params as Record<string, unknown>)[p];
  }
  return undefined;
}

/** 大对象摘要：保留结构线索，避免整份合同 */
export function summarizeTraceValue(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (typeof value === 'string') {
    return value.length > 500 ? `${value.slice(0, 500)}…(${value.length} chars)` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (depth >= 3) {
    if (Array.isArray(value)) return { _type: 'array', length: value.length };
    if (typeof value === 'object') {
      return { _type: 'object', keys: Object.keys(value as object).slice(0, 40) };
    }
    return String(value);
  }
  if (Array.isArray(value)) {
    const sample = value.slice(0, 6).map((v) => {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const o = v as Record<string, unknown>;
        const title = o.title ?? o.topic ?? o.name ?? o.id;
        if (title != null) return { title: String(title).slice(0, 120) };
        return { keys: Object.keys(o).slice(0, 8) };
      }
      return summarizeTraceValue(v, depth + 1);
    });
    return {
      _type: 'array',
      length: value.length,
      sample,
    };
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (Array.isArray(o.items)) {
      const items = o.items as unknown[];
      return {
        _type: 'searchPayload',
        keys: Object.keys(o),
        hitCount: o.hitCount,
        itemCount: items.length,
        topicChipCount: Array.isArray(o.topicChips) ? o.topicChips.length : undefined,
        topicChips: Array.isArray(o.topicChips)
          ? summarizeTraceValue(o.topicChips, depth + 1)
          : undefined,
        sampleTitles: items.slice(0, 8).map((it) => {
          if (it && typeof it === 'object' && !Array.isArray(it)) {
            return String((it as { title?: unknown }).title ?? '').slice(0, 120);
          }
          return String(it ?? '').slice(0, 120);
        }),
        query: typeof o.query === 'string' ? o.query.slice(0, 200) : o.query,
      };
    }
    if (o.payload && typeof o.payload === 'object') {
      return {
        _type: 'evidence',
        keys: Object.keys(o),
        hitCount: o.hitCount,
        payload: summarizeTraceValue(o.payload, depth + 1),
      };
    }
    const out: Record<string, unknown> = { _type: 'object', keys: Object.keys(o) };
    let n = 0;
    for (const [k, v] of Object.entries(o)) {
      if (n >= 24) break;
      if (v == null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        out[k] = summarizeTraceValue(v, depth + 1);
        n += 1;
      } else if (Array.isArray(v) && v.length <= 30 && v.every((x) => typeof x === 'string')) {
        out[k] = v;
        n += 1;
      }
    }
    return out;
  }
  return String(value);
}

function stepConfigSnapshot(step: PipelineStep): Record<string, unknown> {
  return {
    step: step.step,
    when: step.when ?? null,
    nestedTextTaskKey: step.nestedTextTaskKey ?? null,
    layoutTaskKey: step.layoutTaskKey ?? null,
    inputMapping: step.inputMapping ?? null,
    fieldMapping: step.fieldMapping ?? null,
    outputMapping: step.outputMapping ?? null,
    params: step.params ?? {},
  };
}

function collectPlaceholders(text: string): string[] {
  const out: string[] = [];
  PLACEHOLDER_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PLACEHOLDER_RE.exec(text)) !== null) {
    const path = String(m[1] ?? '').trim();
    if (path) out.push(path);
  }
  return out;
}

function addResolved(
  bag: Record<string, unknown>,
  via: string,
  path: string,
  ctx: TaskContext
): void {
  bag[via] = {
    path,
    value: summarizeTraceValue(resolveTracePath(ctx, path)),
  };
}

function normalizeWritePath(path: string): string {
  const p = path.trim();
  if (!p) return p;
  if (p.startsWith('contract.') || p.startsWith('state.') || p.startsWith('params.')) return p;
  if (p.includes('.')) return `contract.${p}`;
  return p;
}

/**
 * 从节点配置收集声明路径，并解析本次值。
 * 不猜测业务字段；仅：inputMapping / *From / 模板占位 / claimPaths / fieldMapping / 平台结构端口。
 */
export function resolveDeclaredInputs(
  ctx: TaskContext,
  step: PipelineStep
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  const params = (step.params ?? {}) as Record<string, unknown>;

  if (step.inputMapping && typeof step.inputMapping === 'object') {
    for (const [k, tmpl] of Object.entries(step.inputMapping)) {
      const t = String(tmpl ?? '').trim();
      if (!t) continue;
      const via = `inputMapping.${k}`;
      try {
        const v = resolvePipelineMappingValue(t, ctx);
        resolved[via] = {
          template: t,
          value: summarizeTraceValue(v),
        };
      } catch {
        resolved[via] = { template: t, value: null, error: 'resolve_failed' };
      }
      for (const path of collectPlaceholders(t)) {
        addResolved(resolved, `${via}:${path}`, path, ctx);
      }
    }
  }

  if (step.fieldMapping && typeof step.fieldMapping === 'object') {
    for (const [role, fieldName] of Object.entries(step.fieldMapping)) {
      const f = String(fieldName ?? '').trim();
      if (!f) continue;
      addResolved(resolved, `fieldMapping.${role}`, f, ctx);
    }
  }

  for (const [pk, pv] of Object.entries(params)) {
    if (PATHISH_PARAM_KEYS.has(pk) && typeof pv === 'string' && pv.trim()) {
      const raw = pv.trim();
      // target / chipsPath 等常写 sources.* / enrich_search.*（相对合同）
      const path =
        raw.startsWith('contract.') ||
        raw.startsWith('state.') ||
        raw.startsWith('params.') ||
        !raw.includes('.')
          ? raw
          : `contract.${raw}`;
      addResolved(resolved, `params.${pk}`, path, ctx);
      continue;
    }
    if ((pk === 'claimPaths' || pk === 'commitPaths') && Array.isArray(pv)) {
      for (const raw of pv) {
        const path = String(raw ?? '').trim();
        if (!path) continue;
        addResolved(
          resolved,
          `params.${pk}:${path}`,
          path.startsWith('contract.') ? path : `contract.${path}`,
          ctx
        );
      }
      continue;
    }
    if (typeof pv === 'string' && pv.includes('${')) {
      for (const path of collectPlaceholders(pv)) {
        addResolved(resolved, `params.${pk}:${path}`, path, ctx);
      }
      try {
        const built = resolvePipelineMappingValue(pv, ctx);
        resolved[`params.${pk}->resolved`] = {
          template: pv,
          value: summarizeTraceValue(built),
        };
      } catch {
        /* ignore */
      }
    }
  }

  const paramsFm = params.fieldMapping;
  if (paramsFm && typeof paramsFm === 'object' && !Array.isArray(paramsFm)) {
    for (const [role, fieldName] of Object.entries(paramsFm as Record<string, unknown>)) {
      const f = String(fieldName ?? '').trim();
      if (!f) continue;
      addResolved(resolved, `params.fieldMapping.${role}`, f, ctx);
    }
  }

  const ports = PLATFORM_STEP_PORTS[step.step];
  if (ports?.reads?.length) {
    for (const path of ports.reads) {
      addResolved(resolved, `platform.read:${path}`, path, ctx);
    }
  }

  return resolved;
}

function resolveDeclaredOutputs(
  before: TaskContext,
  after: TaskContext,
  step: PipelineStep
): Record<string, unknown> {
  const produced: Record<string, unknown> = {};
  const params = (step.params ?? {}) as Record<string, unknown>;

  const writePaths: string[] = [];
  if (typeof params.target === 'string' && params.target.trim()) {
    writePaths.push(params.target.trim());
  }
  if (Array.isArray(params.commitPaths)) {
    for (const raw of params.commitPaths) {
      const path = String(raw ?? '').trim();
      if (!path) continue;
      writePaths.push(path.startsWith('contract.') ? path : `contract.${path}`);
    }
  }
  if (typeof params.targetZone === 'string' && typeof params.targetField === 'string') {
    const zone = params.targetZone.trim();
    const field = params.targetField.trim();
    if (zone && field) writePaths.push(`contract.${zone}.${field}`);
  }
  const ports = PLATFORM_STEP_PORTS[step.step];
  if (ports?.writes?.length) writePaths.push(...ports.writes);

  for (const path of writePaths) {
    const norm = normalizeWritePath(path);
    const beforeV = resolveTracePath(before, norm);
    const afterV = resolveTracePath(after, norm);
    produced[`write:${norm}`] = {
      path: norm,
      before: summarizeTraceValue(beforeV),
      after: summarizeTraceValue(afterV),
      changed: JSON.stringify(beforeV) !== JSON.stringify(afterV),
    };
  }

  const beforeEv = Object.keys(getEvidenceStore(before) ?? {});
  const afterEv = Object.keys(getEvidenceStore(after) ?? {});
  const evChanged = afterEv.filter((k) => {
    if (!beforeEv.includes(k)) return true;
    return (
      JSON.stringify(getEvidenceStore(before)?.[k]) !==
      JSON.stringify(getEvidenceStore(after)?.[k])
    );
  });
  if (evChanged.length) {
    produced.evidence = {
      keys: afterEv,
      changed: evChanged,
      summaries: Object.fromEntries(
        evChanged.map((k) => [k, summarizeTraceValue(getEvidenceStore(after)?.[k])])
      ),
    };
  }

  const nestedLast = after.state.nestedTextLast as Record<string, unknown> | undefined;
  if (nestedLast) {
    produced.nestedTextLast = {
      taskId: nestedLast.taskId,
      key: nestedLast.key ?? nestedLast.nestedTextTaskKey,
    };
  }
  const adminIo = after.state.__adminLastNestedIo as Record<string, unknown> | undefined;
  if (
    adminIo &&
    (adminIo.key === step.nestedTextTaskKey || step.step === 'nestedText')
  ) {
    produced.nestedIo = summarizeTraceValue(adminIo);
  }

  const core = after.state.coreArtifact as { text?: string } | undefined;
  const final = after.state.finalArtifact as { text?: string } | undefined;
  if (typeof core?.text === 'string') produced.coreArtifactChars = core.text.length;
  if (typeof final?.text === 'string') produced.finalArtifactChars = final.text.length;

  return produced;
}

export function buildStepInputSnapshot(ctx: TaskContext, step: PipelineStep): unknown {
  return snapshotForTrace(
    {
      _schema: TRACE_IO_SCHEMA,
      _note: 'config=节点声明；resolved=按声明路径/占位符解析的本次值（非整份合同）',
      config: stepConfigSnapshot(step),
      resolved: resolveDeclaredInputs(ctx, step),
    },
    ADMIN_TRACE_JSON_MAX
  );
}

export function buildStepOutputSnapshot(
  before: TaskContext,
  after: TaskContext,
  step: PipelineStep
): unknown {
  return snapshotForTrace(
    {
      _schema: TRACE_IO_SCHEMA,
      _note: 'config=节点声明；produced=声明写入目标与证据/成稿变化',
      config: {
        step: step.step,
        params: {
          target: (step.params as Record<string, unknown> | undefined)?.target,
          commitPaths: (step.params as Record<string, unknown> | undefined)?.commitPaths,
          targetZone: (step.params as Record<string, unknown> | undefined)?.targetZone,
          targetField: (step.params as Record<string, unknown> | undefined)?.targetField,
        },
        nestedTextTaskKey: step.nestedTextTaskKey ?? null,
        outputMapping: step.outputMapping ?? null,
      },
      produced: resolveDeclaredOutputs(before, after, step),
    },
    ADMIN_TRACE_JSON_MAX
  );
}

export function finalizePipelineStepTrace(
  before: TaskContext,
  after: TaskContext,
  args: {
    step: PipelineStep;
    phase: PipelineTraceEntry['phase'];
    startedAt: number;
    nestedTaskId?: string;
    costUsd?: number;
    skipped?: boolean;
  }
): TaskContext {
  const debug = isAdminPipelineDebug(after) || isAdminPipelineDebug(before);
  const nestedFromState = (after.state.nestedTextLast as { taskId?: string } | undefined)?.taskId;
  const entry: PipelineTraceEntry = {
    step: args.step.step,
    durationMs: Math.max(0, Date.now() - args.startedAt),
    phase: args.phase,
    nestedTaskId: args.nestedTaskId ?? nestedFromState,
    costUsd: args.costUsd,
    skipped: args.skipped,
    ok: true,
    label: stepLabel(args.step),
  };
  if (debug && !args.skipped) {
    entry.inputSnapshot = buildStepInputSnapshot(before, args.step);
    entry.outputSnapshot = buildStepOutputSnapshot(before, after, args.step);
    const budget =
      after.state.__adminLastLlmBudget ??
      (after.state.nestedTextLast as { budget?: unknown } | undefined)?.budget;
    if (budget && typeof budget === 'object') {
      entry.budget = budget as PipelineTraceEntry['budget'];
    }
  }
  return appendPipelineTraceEntry(after, entry);
}

export function appendFailedPipelineStepTrace(
  before: TaskContext,
  args: {
    step: PipelineStep;
    phase: PipelineTraceEntry['phase'];
    startedAt: number;
    error: unknown;
  }
): TaskContext {
  const debug = isAdminPipelineDebug(before);
  const msg = args.error instanceof Error ? args.error.message : String(args.error);
  const entry: PipelineTraceEntry = {
    step: args.step.step,
    durationMs: Math.max(0, Date.now() - args.startedAt),
    phase: args.phase,
    ok: false,
    error: msg,
    label: stepLabel(args.step),
  };
  if (debug) {
    entry.inputSnapshot = buildStepInputSnapshot(before, args.step);
    entry.outputSnapshot = snapshotForTrace(
      {
        _schema: TRACE_IO_SCHEMA,
        error: msg,
        name: args.error instanceof Error ? args.error.name : undefined,
        stack:
          args.error instanceof Error && typeof args.error.stack === 'string'
            ? args.error.stack.slice(0, 4000)
            : undefined,
      },
      ADMIN_TRACE_JSON_MAX
    );
  }
  return appendPipelineTraceEntry(before, entry);
}
