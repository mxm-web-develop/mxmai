'use client';

import type { JobStatus, JobStatusType } from '@/adapters/types';
import { loadResultsFromTaskFolder } from '@/lib/task-folder/sync';
import { getProjectShootJob } from './project-lifecycle';
import { aggregateProjectStatus, getProject } from './project-store';
import type { ProjectMeta } from './types';

/** 从 IndexedDB / 本地任务目录读取项目快照，供页面即时展示 */
export async function loadProjectSnapshot(projectId: string): Promise<{
  meta: ProjectMeta;
  job: JobStatus | null;
} | null> {
  const meta = (await aggregateProjectStatus(projectId)) ?? (await getProject(projectId));
  if (!meta) return null;

  const shoot = await getProjectShootJob(projectId);
  if (!shoot) return { meta, job: null };

  const results =
    shoot.status === 'completed'
      ? await loadResultsFromTaskFolder(shoot.platformJobId)
      : undefined;

  const job: JobStatus = {
    jobId: shoot.platformJobId,
    slug: shoot.slug,
    title: meta.title,
    displayName: shoot.displayName ?? meta.title,
    status: shoot.status,
    progress: shoot.progress,
    createdAt: shoot.createdAt,
    updatedAt: shoot.updatedAt,
    outputGrid: shoot.outputGrid ?? meta.outputGrid,
    parallelCount: meta.parallelCount,
    error: shoot.error ?? meta.error,
    children: shoot.children?.map((c) => ({
      id: c.id,
      label: c.label,
      status: c.status as JobStatusType,
      progress: c.progress,
    })),
    results: results?.length ? results : undefined,
    assetCount: shoot.assetCount,
  };

  return { meta, job };
}
