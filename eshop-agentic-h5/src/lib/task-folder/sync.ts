'use client';

import type { JobResultItem, JobStatus } from '@/adapters/types';
import { listAssetsForJob, putAssetBlob, upsertJobMeta } from './db';
import { getPlatformJob, upsertPlatformJob, aggregateProjectStatus, patchPlatformJobFromJobStatus } from '@/lib/project/project-store';
import type { ExtractedMedia, TaskFolderMeta } from './types';
import { taskFolderPath } from './types';
import { pickCoverFromResults } from '@/lib/project/project-cover';
import {
  absolutizeApiPath,
  authHeadersForMediaFetch,
  resolveDisplayMediaUrl,
} from '@/lib/media-url';

const blobUrlCache = new Map<string, string>();

export function getCachedBlobUrl(jobId: string, assetId: string): string | null {
  return blobUrlCache.get(`${jobId}/${assetId}`) ?? null;
}

export function revokeBlobUrlsForJob(jobId: string): void {
  for (const key of blobUrlCache.keys()) {
    if (key.startsWith(`${jobId}/`)) {
      const url = blobUrlCache.get(key);
      if (url) URL.revokeObjectURL(url);
      blobUrlCache.delete(key);
    }
  }
}

function padAssetId(index: number): string {
  return String(index + 1).padStart(4, '0');
}

function guessFilename(url: string, type: 'image' | 'video', assetId: string): string {
  const extMatch = url.match(/\.(jpe?g|png|webp|gif|mp4|webm)(\?|$)/i);
  const ext = extMatch ? extMatch[1].toLowerCase() : type === 'video' ? 'mp4' : 'jpg';
  return `${assetId}.${ext}`;
}

async function urlToBlob(url: string, source?: string): Promise<Blob> {
  if (url.startsWith('blob:')) {
    const res = await fetch(url);
    return res.blob();
  }
  if (url.startsWith('data:')) {
    const res = await fetch(url);
    return res.blob();
  }
  const fetchUrl = url.startsWith('/api/') ? absolutizeApiPath(url) : url;
  const headers = authHeadersForMediaFetch(fetchUrl);
  const res = await fetch(fetchUrl, headers ? { headers } : undefined);
  if (!res.ok) throw new Error(`下载失败 ${res.status}: ${url.slice(0, 80)}`);
  return res.blob();
}

function mimeFromBlob(blob: Blob, type: 'image' | 'video'): string {
  if (blob.type) return blob.type;
  return type === 'video' ? 'video/mp4' : 'image/jpeg';
}

/**
 * H5 本地归属：将一次 Open API 提交的全部成片写入 tasks/{jobId}/（IndexedDB）。
 * 仅消费平台返回的 URL，不改服务端存储路径。
 */
export async function syncTaskFolderAssets(
  jobId: string,
  slug: string,
  title: string,
  kind: TaskFolderMeta['kind'],
  media: ExtractedMedia[],
  opts?: {
    status?: JobStatus['status'];
    progress?: number;
    createdAt?: string;
    updatedAt?: string;
    outputGrid?: string;
    error?: string;
    children?: TaskFolderMeta['children'];
  }
): Promise<JobResultItem[]> {
  const now = opts?.updatedAt ?? new Date().toISOString();
  const results: JobResultItem[] = [];

  for (let i = 0; i < media.length; i++) {
    const m = media[i];
    const fetchUrl = resolveDisplayMediaUrl(m.remoteUrl, { taskId: jobId, source: m.source });
    const assetId = padAssetId(i);
    try {
      const blob = await urlToBlob(fetchUrl, m.source);
      const mimeType = mimeFromBlob(blob, m.type);
      const filename = guessFilename(m.remoteUrl, m.type, assetId);
      await putAssetBlob(jobId, assetId, {
        filename,
        mimeType,
        type: m.type,
        label: m.label,
        gridCell: m.gridCell,
        isGridCell: m.isGridCell,
        gridSourceUrl: m.gridSourceUrl,
        remoteUrl: fetchUrl,
        source: m.source,
        sizeBytes: blob.size,
        createdAt: now,
      }, blob);

      const cacheKey = `${jobId}/${assetId}`;
      revokeOne(cacheKey);
      const localUrl = URL.createObjectURL(blob);
      blobUrlCache.set(cacheKey, localUrl);

      results.push({
        url: localUrl,
        type: m.type,
        label: m.label,
        gridCell: m.gridCell,
        isGridCell: m.isGridCell,
        gridSourceUrl: m.gridSourceUrl
          ? resolveDisplayMediaUrl(m.gridSourceUrl, { taskId: jobId, source: m.source })
          : fetchUrl,
        assetId,
        remoteUrl: fetchUrl,
        localUrl,
      });
    } catch (e) {
      console.warn('[task-folder] asset download failed', assetId, e);
      results.push({
        url: fetchUrl,
        type: m.type,
        label: m.label,
        gridCell: m.gridCell,
        isGridCell: m.isGridCell,
        gridSourceUrl: m.gridSourceUrl,
        assetId,
        remoteUrl: fetchUrl,
      });
    }
  }

  const meta: TaskFolderMeta = {
    jobId,
    slug,
    title,
    kind,
    status: opts?.status ?? 'completed',
    progress: opts?.progress ?? 100,
    createdAt: opts?.createdAt ?? now,
    updatedAt: now,
    outputGrid: opts?.outputGrid,
    error: opts?.error,
    children: opts?.children,
    assetCount: results.length,
  };

  const platformJob = await getPlatformJob(slug, jobId);
  if (platformJob) {
    await upsertPlatformJob({
      ...platformJob,
      status: meta.status,
      progress: meta.progress,
      updatedAt: now,
      assetCount: results.length,
      outputGrid: meta.outputGrid ?? platformJob.outputGrid,
      error: meta.error,
      children: meta.children,
    });
    const coverUrl = pickCoverFromResults(results, jobId);
    if (coverUrl) {
      const { getProject, upsertProject } = await import('@/lib/project/project-store');
      const project = await getProject(platformJob.projectId);
      if (project) {
        await upsertProject({ ...project, coverUrl, updatedAt: now });
      }
    }
    await aggregateProjectStatus(platformJob.projectId);
  } else {
    await upsertJobMeta(meta);
  }
  return results;
}

function revokeOne(key: string): void {
  const prev = blobUrlCache.get(key);
  if (prev) URL.revokeObjectURL(prev);
}

/** 从已存储目录加载成片（用于任务详情/列表缩略） */
export async function loadResultsFromTaskFolder(jobId: string): Promise<JobResultItem[]> {
  const assets = await listAssetsForJob(jobId);
  return assets.map((a) => {
    const cacheKey = `${jobId}/${a.assetId}`;
    let localUrl = blobUrlCache.get(cacheKey);
    if (!localUrl) {
      localUrl = URL.createObjectURL(a.blob);
      blobUrlCache.set(cacheKey, localUrl);
    }
    return {
      url: localUrl,
      type: a.type,
      label: a.label,
      gridCell: a.gridCell,
      isGridCell: a.isGridCell,
      gridSourceUrl: a.gridSourceUrl,
      assetId: a.assetId,
      remoteUrl: a.remoteUrl,
      localUrl,
    };
  });
}

export async function enrichJobWithTaskFolder(job: JobStatus): Promise<JobStatus> {
  await patchPlatformJobFromJobStatus(job);
  if (job.status === 'completed') {
    const stored = await loadResultsFromTaskFolder(job.jobId);
    if (stored.length > 0) {
      return {
        ...job,
        results: stored,
        taskFolderPath: taskFolderPath(job.jobId),
      };
    }
  }
  return { ...job, taskFolderPath: taskFolderPath(job.jobId) };
}

export function mediaFromJobResults(results: JobResultItem[]): ExtractedMedia[] {
  return results.map((r) => ({
    remoteUrl: r.remoteUrl ?? r.url,
    type: r.type,
    label: r.label,
    gridCell: r.gridCell,
    isGridCell: r.isGridCell,
    gridSourceUrl: r.gridSourceUrl,
  }));
}
