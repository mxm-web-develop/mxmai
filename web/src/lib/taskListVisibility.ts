import type { WritingTaskItem } from '../api/client';

const BATCH_PARENT_TYPES = new Set([
  'graph-grid9-parent',
  'video-batch-parent',
  'task-v2-batch-parent',
]);

const PIPELINE_NODE_VIDEO_TIMELINE_RENDER = 'pipeline:video-timeline-render';

/** 各创作页 listCgiTasks / listWritingTasks 对应的任务 type 过滤 */
export type TaskListScope = 'graph' | 'video' | 'audio' | 'music' | 'writing' | 'outline';

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** 任务 type 是否属于当前列表页（WS 增量同步必须校验，否则会串列表） */
export function taskMatchesListScope(task: WritingTaskItem, listScope: TaskListScope): boolean {
  const t = task.type;
  switch (listScope) {
    case 'graph':
      return t === 'graph' || t === 'image';
    case 'video':
      return t === 'video';
    case 'audio':
      return t === 'audio';
    case 'music':
      return t === 'music';
    case 'writing':
      return t === 'writing' || t === 'text';
    case 'outline':
      return t === 'outline';
    default:
      return false;
  }
}

/** 管线内部子任务（videoTimelineRender / GSAP 逐段渲染等）不应出现在用户创作列表 */
export function isInternalListTask(task: WritingTaskItem): boolean {
  if (task.type && BATCH_PARENT_TYPES.has(task.type)) return true;

  const meta = readRecord(task.metadata) ?? {};
  if (meta.pipelineInternal === true || meta.hideFromUserList === true) return true;
  if (meta.parentPipelineTaskId) return true;
  if (meta.pipelineNode === PIPELINE_NODE_VIDEO_TIMELINE_RENDER) return true;
  if (meta.videoSubtype === 'render' && meta.model === 'video-edit-dispatcher') return true;

  const rp = readRecord(task.requestParams) ?? {};
  if (rp.pipelineInternal === true) return true;
  if (rp.parentPipelineTaskId) return true;
  if (rp.pipelineNode === PIPELINE_NODE_VIDEO_TIMELINE_RENDER) return true;
  if (rp.videoSubtype === 'render' && rp.model === 'video-edit-dispatcher') return true;

  const inner = readRecord(rp.params);
  const innerMeta = readRecord(inner?.metadata);
  if (innerMeta?.parentPipelineTaskId) return true;
  if (innerMeta?.pipelineInternal === true) return true;

  return false;
}

export function filterUserFacingListTasks(tasks: WritingTaskItem[]): WritingTaskItem[] {
  return tasks.filter((task) => !isInternalListTask(task));
}

/** 列表页展示 + WS 增量写入：scope 匹配且非管线内部子任务 */
export function shouldShowInTaskList(task: WritingTaskItem, listScope: TaskListScope): boolean {
  if (!taskMatchesListScope(task, listScope)) return false;
  if (listScope === 'graph' || listScope === 'video' || listScope === 'audio' || listScope === 'music') {
    return !isInternalListTask(task);
  }
  return true;
}
