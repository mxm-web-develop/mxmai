import type { WritingTaskItem } from '../api/client';

export const CGI_TASK_WS_EVENTS = new Set(['task_completed', 'task_failed', 'task_updated']);

export type CgiTaskWsEventName = 'task_completed' | 'task_failed' | 'task_updated';

export interface CgiTaskWsMessage {
  event: CgiTaskWsEventName;
  task: Record<string, unknown>;
}

const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'network_error']);

export function isTerminalTaskStatus(status: string): boolean {
  return TERMINAL.has(status);
}

export function parseCgiTaskWsMessage(raw: unknown): CgiTaskWsMessage | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.type !== 'notification') return null;
  const ev = o.event;
  if (typeof ev !== 'string' || !CGI_TASK_WS_EVENTS.has(ev)) return null;
  const data = o.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  const task = (d.task && typeof d.task === 'object' ? d.task : d) as Record<string, unknown>;
  const id = typeof task.id === 'string' ? task.id : '';
  if (!id) return null;
  return { event: ev as CgiTaskWsEventName, task };
}

/** 将 WS task / task_snapshot 转为列表行 */
export function wsPayloadToWritingTaskItem(task: Record<string, unknown>): WritingTaskItem | null {
  const id = typeof task.id === 'string' ? task.id : '';
  if (!id) return null;

  const status = typeof task.status === 'string' ? task.status : 'pending';
  const type =
    (typeof task.type === 'string' ? task.type : null) ||
    (typeof task.task_type === 'string' ? task.task_type : null) ||
    'other';

  const progressRaw = task.progress;
  let progress: WritingTaskItem['progress'];
  if (progressRaw && typeof progressRaw === 'object' && !Array.isArray(progressRaw)) {
    const p = progressRaw as Record<string, unknown>;
    progress = {
      status: typeof p.status === 'string' ? p.status : status,
      progress: typeof p.progress === 'number' ? p.progress : undefined,
      error: typeof p.error === 'string' ? p.error : undefined,
      ...(typeof p.message === 'string' && p.message.trim()
        ? { message: p.message.trim() }
        : {}),
      ...(typeof p.phase === 'string' && p.phase ? { phase: p.phase } : {}),
      ...(typeof p.phaseIndex === 'number' ? { phaseIndex: p.phaseIndex } : {}),
      ...(typeof p.phaseTotal === 'number' ? { phaseTotal: p.phaseTotal } : {}),
    };
  } else if (typeof task.progress === 'number') {
    progress = { status, progress: task.progress as number };
  } else {
    progress = { status, progress: undefined };
  }

  // 兼容：阶段字段偶发落在 metadata.progressUx
  const metaProbe =
    task.metadata && typeof task.metadata === 'object' && !Array.isArray(task.metadata)
      ? (task.metadata as Record<string, unknown>).progressUx
      : null;
  if (metaProbe && typeof metaProbe === 'object' && !Array.isArray(metaProbe)) {
    const ux = metaProbe as Record<string, unknown>;
    progress = {
      ...progress,
      ...(typeof ux.message === 'string' && ux.message.trim() && !progress?.message
        ? { message: ux.message.trim() }
        : {}),
      ...(typeof ux.phase === 'string' && ux.phase && !progress?.phase ? { phase: ux.phase } : {}),
      ...(typeof ux.phaseIndex === 'number' && progress?.phaseIndex == null
        ? { phaseIndex: ux.phaseIndex }
        : {}),
      ...(typeof ux.phaseTotal === 'number' && progress?.phaseTotal == null
        ? { phaseTotal: ux.phaseTotal }
        : {}),
    };
  }

  const metaRaw = task.metadata;
  const metadata: Record<string, unknown> =
    metaRaw && typeof metaRaw === 'object' && !Array.isArray(metaRaw)
      ? { ...(metaRaw as Record<string, unknown>) }
      : {};

  if (typeof task.label === 'string' && !metadata.label) {
    metadata.label = task.label;
  }
  if (typeof task.model_name === 'string' && !metadata.model) {
    metadata.model = task.model_name;
  }

  const item: WritingTaskItem = {
    id,
    type,
    status,
    progress,
    metadata: Object.keys(metadata).length ? metadata : undefined,
    createdAt:
      typeof task.createdAt === 'string'
        ? task.createdAt
        : typeof task.created_at === 'string'
          ? task.created_at
          : undefined,
    updatedAt:
      typeof task.updatedAt === 'string'
        ? task.updatedAt
        : typeof task.updated_at === 'string'
          ? task.updated_at
          : undefined,
  };

  const snapshot =
    task.task_snapshot && typeof task.task_snapshot === 'object' && !Array.isArray(task.task_snapshot)
      ? (task.task_snapshot as Record<string, unknown>)
      : null;

  const resultRaw = task.result;
  const resultObj =
    resultRaw && typeof resultRaw === 'object' && !Array.isArray(resultRaw)
      ? (resultRaw as Record<string, unknown>)
      : null;

  const pickPreview = (...cands: unknown[]): string => {
    for (const c of cands) {
      if (typeof c === 'string' && c.trim()) return c.trim();
    }
    return '';
  };
  const contentPreview = pickPreview(
    resultObj?.contentPreview,
    task.contentPreview,
    snapshot?.contentPreview,
    metadata.listContentPreview
  );

  const mediaCount =
    typeof resultObj?.mediaCount === 'number'
      ? resultObj.mediaCount
      : typeof task.mediaCount === 'number'
        ? task.mediaCount
        : typeof task.media_count === 'number'
          ? task.media_count
          : typeof snapshot?.mediaCount === 'number'
            ? snapshot.mediaCount
            : undefined;
  const hasMedia =
    resultObj?.hasMedia === true ||
    (typeof mediaCount === 'number' && mediaCount > 0) ||
    task.hasResult === true ||
    snapshot?.hasResult === true;

  if (contentPreview || hasMedia) {
    item.result = {
      ...(contentPreview ? { contentPreview } : {}),
      ...(hasMedia ? { hasMedia: true } : {}),
      ...(typeof mediaCount === 'number' ? { mediaCount } : {}),
      metadata: {
        hasResult: true,
        ...(typeof resultObj?.metadata === 'object' &&
        resultObj.metadata &&
        !Array.isArray(resultObj.metadata) &&
        typeof (resultObj.metadata as Record<string, unknown>).text === 'string'
          ? { text: String((resultObj.metadata as Record<string, unknown>).text) }
          : {}),
      },
    };
  }

  return item;
}

export function extractCgiTaskFromApiResponse(raw: unknown): WritingTaskItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const body = raw as Record<string, unknown>;
  const inner = (body.data ?? body) as Record<string, unknown>;
  const task = (inner.task ?? inner) as Record<string, unknown>;
  if (!task || typeof task.id !== 'string') return null;
  return wsPayloadToWritingTaskItem(task);
}

/** 预览/详情：保留 requestParams、result 等完整字段 */
export function extractFullCgiTaskFromApiResponse(raw: unknown): WritingTaskItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const body = raw as Record<string, unknown>;
  const inner = (body.data ?? body) as Record<string, unknown>;
  const task = (inner.task ?? inner) as Record<string, unknown>;
  if (!task || typeof task.id !== 'string') return null;

  const base = wsPayloadToWritingTaskItem(task);
  if (!base) return null;

  const requestParams =
    task.requestParams && typeof task.requestParams === 'object' && !Array.isArray(task.requestParams)
      ? (task.requestParams as Record<string, unknown>)
      : undefined;
  const result =
    task.result && typeof task.result === 'object' && !Array.isArray(task.result)
      ? (task.result as WritingTaskItem['result'])
      : undefined;

  return {
    ...base,
    ...(requestParams ? { requestParams } : {}),
    ...(result ? { result } : {}),
  };
}
