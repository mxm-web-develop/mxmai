/**
 * 管线步骤：groupFanout — 平台通用「组扇出」节点（post 段）。
 *
 * 把合同 / state / params 中的可遍历列表并发派发为目标子业务的独立任务
 * （group 形态：合同 business 为对象数组，每个元素字段一致、由不同子任务各自成稿）。
 *
 * 业务差异只允许通过节点配置表达（见 docs/adr/pipeline-reusable-steps.md）：
 * - itemsFrom:      列表路径（根：contract. / state. / params.），如 "contract.business.variants"
 * - targetScope / targetTaskKey / targetSubtype: 子任务业务三元组
 * - inputMapping:   子任务 params 模板；占位根：item. / contract. / params. / state.，
 *                   以及 ${itemJson}（整个元素 JSON 字符串）、${index}（1 起）、${total}。
 *                   单占位符映射保留原始类型（对象 / 数组不转字符串）。
 * - labelTemplate:  子任务列表名模板（同上占位；缺省 "${item.name}"，空则回退「序号/总数」）
 * - maxItems:       派发上限（默认 12，硬上限 48）
 *
 * 派发语义：子任务创建后由 worker 异步执行（不同步等待成稿）；
 * 派发结果写入 state.groupFanoutResult 并合并进 final/coreArtifact.metadata
 * （childTaskIds + groupFanout 摘要），父任务正文保持 output 段产物不变。
 */
import type { PipelineStep, TaskContext, TaskRunV2Request, TaskScope } from './types';
import { ConfigurationError } from './errors';

const DEFAULT_MAX_ITEMS = 12;
const HARD_MAX_ITEMS = 48;
const SINGLE_PLACEHOLDER_RE = /^\$\{([^}]+)\}$/;

export interface GroupFanoutItemResult {
  index: number;
  label: string;
  taskId: string;
  status: string;
  error?: string;
}

export interface GroupFanoutResult {
  targetScope: string;
  targetTaskKey: string;
  targetSubtype: string | null;
  total: number;
  dispatchedCount: number;
  failedCount: number;
  items: GroupFanoutItemResult[];
}

function readByPath(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const seg of path.split('.').filter(Boolean)) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

function resolveRootPath(
  ctx: TaskContext,
  item: Record<string, unknown>,
  index: number,
  total: number,
  rawPath: string
): unknown {
  const path = rawPath.trim();
  if (path === 'itemJson') return JSON.stringify(item);
  if (path === 'index') return index + 1;
  if (path === 'total') return total;
  if (path === 'item') return item;
  if (path.startsWith('item.')) return readByPath(item, path.slice('item.'.length));
  if (path.startsWith('contract.')) {
    return readByPath(ctx.state.contract, path.slice('contract.'.length));
  }
  if (path.startsWith('params.')) return readByPath(ctx.params, path.slice('params.'.length));
  if (path.startsWith('state.')) return readByPath(ctx.state, path.slice('state.'.length));
  return undefined;
}

/** 单占位符保留原始类型；混合模板做字符串插值（对象转 JSON） */
export function resolveGroupFanoutTemplate(
  ctx: TaskContext,
  item: Record<string, unknown>,
  index: number,
  total: number,
  template: string
): unknown {
  const trimmed = template.trim();
  const single = trimmed.match(SINGLE_PLACEHOLDER_RE);
  if (single) {
    const v = resolveRootPath(ctx, item, index, total, single[1]!);
    return v ?? '';
  }
  return template.replace(/\$\{([^}]+)\}/g, (_m, rawPath: string) => {
    const v = resolveRootPath(ctx, item, index, total, rawPath);
    if (v == null) return '';
    return typeof v === 'object' ? JSON.stringify(v) : String(v);
  });
}

function readItemsList(ctx: TaskContext, itemsFrom: string): Record<string, unknown>[] {
  const path = itemsFrom.trim();
  let raw: unknown;
  if (path.startsWith('contract.')) {
    raw = readByPath(ctx.state.contract, path.slice('contract.'.length));
  } else if (path.startsWith('state.')) {
    raw = readByPath(ctx.state, path.slice('state.'.length));
  } else if (path.startsWith('params.')) {
    raw = readByPath(ctx.params, path.slice('params.'.length));
  } else {
    throw new ConfigurationError(
      `groupFanout.itemsFrom 路径必须以 contract. / state. / params. 开头，收到：${itemsFrom}`
    );
  }
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw) as unknown;
    } catch {
      /* 非 JSON 字符串按空列表处理，由下方统一报错 */
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (it): it is Record<string, unknown> => !!it && typeof it === 'object' && !Array.isArray(it)
  );
}

export async function runGroupFanoutStep(
  ctx: TaskContext,
  step: PipelineStep
): Promise<TaskContext> {
  const userId = ctx.userId;
  if (!userId) throw new ConfigurationError('groupFanout：缺少 userId');

  const params = (step.params ?? {}) as Record<string, unknown>;
  const targetScope = String(params.targetScope ?? '').trim();
  const targetTaskKey = String(params.targetTaskKey ?? '').trim();
  const targetSubtype = String(params.targetSubtype ?? '').trim() || null;
  if (!targetScope || !targetTaskKey) {
    throw new ConfigurationError('groupFanout：需要 targetScope + targetTaskKey（可选 targetSubtype）');
  }
  if (
    targetScope === ctx.scope &&
    targetTaskKey === ctx.taskKey &&
    (targetSubtype ?? '') === String(ctx.subtype ?? '')
  ) {
    throw new ConfigurationError('groupFanout：目标业务不能是当前业务自身（禁止自递归派发）');
  }

  const itemsFrom = String(params.itemsFrom ?? 'contract.business.variants').trim();
  const allItems = readItemsList(ctx, itemsFrom);
  if (allItems.length === 0) {
    throw new ConfigurationError(`groupFanout：${itemsFrom} 为空或不是对象数组，无可派发条目`);
  }

  const maxItemsRaw = Number(params.maxItems ?? DEFAULT_MAX_ITEMS);
  const maxItems = Math.min(
    HARD_MAX_ITEMS,
    Number.isFinite(maxItemsRaw) && maxItemsRaw >= 1 ? Math.floor(maxItemsRaw) : DEFAULT_MAX_ITEMS
  );
  const items = allItems.slice(0, maxItems);
  const total = items.length;

  const inputMapping =
    params.inputMapping && typeof params.inputMapping === 'object' && !Array.isArray(params.inputMapping)
      ? (params.inputMapping as Record<string, string>)
      : {};
  if (Object.keys(inputMapping).length === 0) {
    throw new ConfigurationError('groupFanout：需要 inputMapping（子任务 params 模板）');
  }
  const labelTemplate = String(params.labelTemplate ?? '${item.name}').trim() || '${item.name}';

  const { runTaskV2Single } = await import('./task-engine');

  const results: GroupFanoutItemResult[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const labelRaw = resolveGroupFanoutTemplate(ctx, item, i, total, labelTemplate);
    const label =
      (typeof labelRaw === 'string' && labelRaw.trim()) || `${targetTaskKey} ${i + 1}/${total}`;

    const childParams: Record<string, unknown> = {};
    for (const [field, tmpl] of Object.entries(inputMapping)) {
      if (typeof tmpl !== 'string') continue;
      childParams[field] = resolveGroupFanoutTemplate(ctx, item, i, total, tmpl);
    }

    const req: TaskRunV2Request = {
      scope: targetScope as TaskScope,
      taskKey: targetTaskKey,
      subtype: targetSubtype,
      params: childParams,
      metadata: {
        label,
        parentGroupTaskId: ctx.taskId,
        groupFanout: true,
        groupIndex: i + 1,
        groupTotal: total,
      },
    };

    try {
      const res = await runTaskV2Single(req, userId);
      results.push({
        index: i + 1,
        label,
        taskId: res.taskId,
        status: res.status ?? 'pending',
      });
    } catch (err) {
      results.push({
        index: i + 1,
        label,
        taskId: '',
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      });
      console.error(`[groupFanout] 派发子任务 ${i + 1}/${total} 失败:`, err);
    }
  }

  const dispatched = results.filter((r) => r.taskId);
  if (dispatched.length === 0) {
    const sample = results.find((r) => r.error)?.error ?? '未知错误';
    throw new Error(`groupFanout：全部子任务派发失败（${results.length} 条）：${sample}`);
  }

  const fanoutResult: GroupFanoutResult = {
    targetScope,
    targetTaskKey,
    targetSubtype,
    total,
    dispatchedCount: dispatched.length,
    failedCount: results.length - dispatched.length,
    items: results,
  };

  const childTaskIds = dispatched.map((r) => r.taskId);
  const prevFinal = ctx.state.finalArtifact as
    | { kind?: string; text?: string; metadata?: Record<string, unknown> }
    | undefined;
  const prevCore = ctx.state.coreArtifact as
    | { kind?: string; text?: string; metadata?: Record<string, unknown> }
    | undefined;
  const base = prevFinal ?? prevCore;
  const artifact = {
    kind: (base?.kind as 'text' | undefined) ?? ('text' as const),
    text: typeof base?.text === 'string' ? base.text : '',
    metadata: {
      ...(base?.metadata ?? {}),
      childTaskIds,
      groupFanout: fanoutResult,
      orchestrator: true,
    },
  };

  return {
    ...ctx,
    state: {
      ...ctx.state,
      groupFanoutResult: fanoutResult,
      coreArtifact: prevCore ? { ...prevCore, metadata: artifact.metadata } : artifact,
      finalArtifact: artifact,
    },
  };
}
