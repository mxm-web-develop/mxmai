/**
 * 用户任务列表可见性：管线内部子任务（如 videoTimelineRender）不应与入口业务并列展示。
 */
import { PIPELINE_NODE_VIDEO_TIMELINE_RENDER } from '../core/video-edit/pipeline-nodes';

const BATCH_PARENT_TYPES = new Set([
  'graph-grid9-parent',
  'video-batch-parent',
  'task-v2-batch-parent',
]);

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** 是否应对用户创作列表隐藏（仍可通过 taskId 轮询 / Admin 查看） */
export function isInternalListTask(task: {
  type?: string;
  metadata?: Record<string, unknown> | null;
  requestParams?: Record<string, unknown> | null;
}): boolean {
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

/** 用户创作列表：仅保留入口业务任务，剔除管线内部子任务 */
export function filterUserFacingListTasks<T extends Parameters<typeof isInternalListTask>[0]>(
  tasks: T[]
): T[] {
  return tasks.filter((task) => !isInternalListTask(task));
}
