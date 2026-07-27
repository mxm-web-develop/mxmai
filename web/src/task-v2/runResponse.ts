export type TaskRunV2ParallelChild = {
  taskId: string;
  parallelIndex: number;
  status: string;
};

export type TaskRunV2ParallelInfo = {
  parentTaskId: string;
  total: number;
  tasks: TaskRunV2ParallelChild[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** 解析 POST /api/v2/tasks/run 响应（兼容 Gateway data 包装） */
export function parseTaskRunV2Envelope(raw: unknown): Record<string, unknown> | null {
  if (!isRecord(raw)) return null;
  return isRecord(raw.data) ? raw.data : raw;
}

/** 轮询/列表用的主 taskId（多份时为父任务 id） */
export function pickTaskIdFromRunTaskV2Response(raw: unknown): string | null {
  const inner = parseTaskRunV2Envelope(raw);
  if (!inner) return null;
  const tid = inner.taskId;
  return typeof tid === 'string' && tid.trim() ? tid : null;
}

/** 列表增量同步：单任务返回 1 个 id；多份并发返回各子任务 id（不含 batch 父任务） */
export function collectListTaskIdsFromRunTaskV2Response(raw: unknown): string[] {
  const parallel = pickParallelFromRunTaskV2Response(raw);
  if (parallel && parallel.tasks.length > 0) {
    return parallel.tasks.map((t) => t.taskId).filter((id) => id.trim().length > 0);
  }
  const single = pickTaskIdFromRunTaskV2Response(raw);
  return single ? [single] : [];
}

export function pickParallelFromRunTaskV2Response(raw: unknown): TaskRunV2ParallelInfo | null {
  const inner = parseTaskRunV2Envelope(raw);
  if (!inner || !isRecord(inner.parallel)) return null;
  const p = inner.parallel;
  const tasks = Array.isArray(p.tasks) ? p.tasks : [];
  const parsed: TaskRunV2ParallelChild[] = [];
  for (const t of tasks) {
    if (!isRecord(t)) continue;
    const taskId = typeof t.taskId === 'string' ? t.taskId : '';
    if (!taskId) continue;
    parsed.push({
      taskId,
      parallelIndex: typeof t.parallelIndex === 'number' ? t.parallelIndex : parsed.length,
      status: typeof t.status === 'string' ? t.status : 'pending',
    });
  }
  const parentTaskId = typeof p.parentTaskId === 'string' ? p.parentTaskId : pickTaskIdFromRunTaskV2Response(raw) ?? '';
  const total = typeof p.total === 'number' ? p.total : parsed.length;
  if (!parentTaskId || parsed.length === 0) return null;
  return { parentTaskId, total, tasks: parsed };
}
