'use client';

import type { JobResultItem } from '@/adapters/types';
import { loadResultsFromTaskFolder } from '@/lib/task-folder/sync';
import { resolveDisplayMediaUrl } from '@/lib/media-url';
import type { ProjectMeta } from './types';

/** 列表缩略图：优先宫格单格，否则首张成片 */
export function pickCoverFromResults(
  results: JobResultItem[] | undefined,
  taskId?: string
): string | undefined {
  if (!results?.length) return undefined;
  const images = results.filter((r) => r.type === 'image' || !r.type);
  if (!images.length) return undefined;
  const gridCell =
    images.find((r) => r.isGridCell) ??
    images.find((r) => r.gridCell) ??
    images[0];
  if (gridCell.localUrl) return gridCell.localUrl;
  const raw = gridCell.url ?? gridCell.remoteUrl;
  if (!raw) return undefined;
  if (!taskId) return raw;
  return resolveDisplayMediaUrl(raw, {
    taskId,
    source: gridCell.gridCell ? `cell:${gridCell.gridCell}` : undefined,
  });
}

export async function resolveProjectCoverUrl(project: ProjectMeta): Promise<string | undefined> {
  if (project.coverUrl) return project.coverUrl;

  const jobId = project.rootPlatformJobId;
  if (!jobId) return undefined;

  const stored = await loadResultsFromTaskFolder(jobId);
  const fromStored = pickCoverFromResults(stored, jobId);
  if (fromStored) return fromStored;

  if (project.status === 'completed' || (project.status === 'processing' && project.progress > 0)) {
    try {
      const { getOpenApiAdapter } = await import('@/adapters');
      const job = await getOpenApiAdapter().getJob(project.shootSlug, jobId);
      return pickCoverFromResults(job.results, jobId);
    } catch {
      return undefined;
    }
  }

  return undefined;
}
