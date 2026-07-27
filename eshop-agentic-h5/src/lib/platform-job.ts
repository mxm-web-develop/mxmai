import type { JobChildTask, JobStatus, JobStatusType, ServiceKind } from '@/adapters/types';
import {
  extractMediaFromChildTasks,
  extractMediaFromPlatformJob,
} from '@/lib/task-folder/extract-media';
import { extractGridCellsFromPlatformJob } from '@/lib/extract-grid-cells';
import { resolveDisplayMediaUrl } from '@/lib/media-url';
import { getManifestBySlug } from '@/catalog/manifests';

type PlatformParallel = {
  parentTaskId?: string;
  total?: number;
  childTaskIds?: string[];
  children?: Array<{ taskId: string; status: string; progress?: number }>;
  summary?: { completedCount?: number; failedCount?: number; processingCount?: number };
};

function mapStatus(s: string | undefined): JobStatusType {
  if (s === 'completed' || s === 'failed' || s === 'processing' || s === 'pending') return s;
  if (s === 'queued') return 'pending';
  if (s === 'cancelled' || s === 'network_error') return 'failed';
  return 'processing';
}

function progressFromTask(raw: Record<string, unknown>): number {
  const p = raw.progress as { progress?: number } | number | undefined;
  if (typeof p === 'number') return Math.min(100, Math.max(0, p));
  if (p && typeof p === 'object' && typeof p.progress === 'number') {
    return Math.min(100, Math.max(0, p.progress));
  }
  return raw.status === 'completed' ? 100 : 0;
}

function isSmartflowExecution(raw: Record<string, unknown>): boolean {
  return typeof raw.smartflow_id === 'string' || typeof raw.execution_id === 'string';
}

/**
 * 将 Open API / 平台任务响应规范为 H5 JobStatus，并收集可入库的媒体列表
 */
export async function normalizePlatformJob(
  slug: string,
  jobId: string,
  raw: Record<string, unknown>,
  opts?: {
    kind?: ServiceKind;
    fetchChild?: (childId: string) => Promise<Record<string, unknown>>;
  }
): Promise<{ job: JobStatus; mediaUrls: ReturnType<typeof extractMediaFromPlatformJob> }> {
  let kind = opts?.kind;
  if (!kind) {
    try {
      kind = getManifestBySlug(slug).kind;
    } catch {
      kind = isSmartflowExecution(raw) ? 'smartflow' : 'task_v2';
    }
  }

  const title =
    (typeof raw.title === 'string' && raw.title) ||
    (typeof raw.name === 'string' && raw.name) ||
    slug;

  let status = mapStatus(String(raw.status ?? 'processing'));
  let progress = progressFromTask(raw);
  const createdAt =
    (typeof raw.created_at === 'string' && raw.created_at) ||
    (typeof raw.createdAt === 'string' && raw.createdAt) ||
    new Date().toISOString();
  const updatedAt =
    (typeof raw.updated_at === 'string' && raw.updated_at) ||
    (typeof raw.updatedAt === 'string' && raw.updatedAt) ||
    createdAt;

  const gridMedia =
    extractGridCellsFromPlatformJob(raw) ?? extractMediaFromPlatformJob(raw);
  let media = gridMedia;
  let children: JobChildTask[] | undefined;

  const parallel = raw.parallel as PlatformParallel | undefined;
  if (parallel?.childTaskIds?.length && opts?.fetchChild) {
    const childRaws: Array<{ taskId: string; raw: Record<string, unknown>; label?: string }> = [];
    children = [];
    for (let i = 0; i < parallel.childTaskIds.length; i++) {
      const childId = parallel.childTaskIds[i];
      try {
        const cr = await opts.fetchChild(childId);
        const label = `第 ${i + 1} 份`;
        childRaws.push({
          taskId: childId,
          raw: cr,
          label,
        });
        children.push({
          id: childId,
          label: `SKU ${String.fromCharCode(65 + i)}`,
          status: mapStatus(String(cr.status)),
          progress: progressFromTask(cr),
        });
      } catch {
        children.push({
          id: childId,
          label: `SKU ${String.fromCharCode(65 + i)}`,
          status: 'failed',
          progress: 0,
        });
      }
    }
    const fromChildren: ReturnType<typeof extractMediaFromChildTasks> = [];
    for (const child of childRaws) {
      const cells =
        extractGridCellsFromPlatformJob(child.raw, { labelPrefix: child.label }) ??
        extractMediaFromPlatformJob(child.raw).map((m) => ({
          ...m,
          label: child.label ? `${child.label} · ${m.label ?? '成片'}` : m.label,
          source: `child:${child.taskId}`,
        }));
      fromChildren.push(...cells);
    }
    if (fromChildren.length > 0) media = fromChildren;
  } else if (parallel?.children?.length) {
    children = parallel.children.map((c, i) => ({
      id: c.taskId,
      label: `SKU ${String.fromCharCode(65 + i)}`,
      status: mapStatus(c.status),
      progress:
        typeof c.progress === 'number'
          ? c.progress
          : c.status === 'completed'
            ? 100
            : 0,
    }));
  }

  const summary = parallel?.summary;
  const parallelTotal = parallel?.total ?? children?.length ?? 0;
  let aggregateError: string | undefined =
    status === 'failed'
      ? String((raw.progress as { error?: string })?.error ?? raw.error ?? '任务失败')
      : undefined;

  if (children?.length && parallelTotal > 0 && !summary) {
    const allDone = children.every((c) => c.status === 'completed');
    const allFailed = children.every((c) => c.status === 'failed');
    const anyActive = children.some(
      (c) => c.status === 'processing' || c.status === 'pending'
    );
    if (allDone) {
      status = 'completed';
      progress = 100;
      aggregateError = undefined;
    } else if (!allFailed && anyActive && status === 'failed') {
      status = 'processing';
      progress = Math.round(
        children.reduce((s, c) => s + (c.progress ?? 0), 0) / children.length
      );
      aggregateError = undefined;
    }
  }

  if (summary && parallelTotal > 0 && children?.length) {
    const done = summary.completedCount ?? 0;
    const failed = summary.failedCount ?? 0;
    const processing = summary.processingCount ?? 0;
    if (done === parallelTotal) {
      status = 'completed';
      progress = 100;
      aggregateError = undefined;
    } else if (failed === parallelTotal) {
      status = 'failed';
    } else if (processing > 0 || done + failed < parallelTotal) {
      if (status === 'failed') status = 'processing';
      progress = Math.round(
        children.reduce((s, c) => s + (c.progress ?? 0), 0) / Math.max(children.length, 1)
      );
      aggregateError = undefined;
    }
  }

  const rp =
    (raw.requestParams as Record<string, unknown> | undefined) ??
    (raw.request_params as Record<string, unknown> | undefined) ??
    ((raw.metadata as Record<string, unknown> | undefined)?.requestParams as
      | Record<string, unknown>
      | undefined) ??
    ((raw.metadata as Record<string, unknown> | undefined)?.request_params as
      | Record<string, unknown>
      | undefined);
  const outputGrid =
    typeof rp?.output_grid === 'string'
      ? String(rp.output_grid)
      : media.some((m) => m.isGridCell) && media.length >= 4
        ? media.length >= 9
          ? '3x3'
          : '2x2'
        : undefined;
  const parallelCount =
    typeof rp?.parallel_count === 'number'
      ? rp.parallel_count
      : typeof rp?.parallel_count === 'string'
        ? Number(rp.parallel_count)
        : undefined;

  const results =
    status === 'completed' && media.length > 0
      ? media.map((m, i) => {
          const displayUrl = resolveDisplayMediaUrl(m.remoteUrl, {
            taskId: jobId,
            source: m.source,
          });
          const gridSource = m.gridSourceUrl
            ? resolveDisplayMediaUrl(m.gridSourceUrl, { taskId: jobId, source: m.source })
            : displayUrl;
          return {
            url: displayUrl,
            type: m.type,
            label: m.label ?? (media.length > 1 ? `成片 ${i + 1}` : '成片'),
            gridCell: m.gridCell,
            isGridCell: m.isGridCell,
            gridSourceUrl: gridSource,
            remoteUrl: displayUrl,
          };
        })
      : undefined;

  const job: JobStatus = {
    jobId,
    slug,
    title,
    status,
    progress,
    createdAt,
    updatedAt,
    children,
    results,
    outputGrid,
    parallelCount: Number.isFinite(parallelCount) ? parallelCount : undefined,
    error: aggregateError,
    taskFolderPath: `tasks/${jobId}`,
  };

  return { job, mediaUrls: media };
}
