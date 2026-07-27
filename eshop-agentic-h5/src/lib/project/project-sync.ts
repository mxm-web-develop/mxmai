'use client';

import type { JobStatusType, ServiceKind } from '@/adapters/types';
import { fallbackTitleForSlug, isProjectRootSlug } from '@/catalog/project-root-slugs';
import { getAuthBearerToken } from '@/lib/auth-token';
import { getStoredEndUserId } from '@/lib/partner-session';
import { getApiMode, getOpenApiBaseUrl } from '@/lib/runtime-config';
import { deleteTaskFolder } from '@/lib/task-folder/db';
import { revokeBlobUrlsForJob } from '@/lib/task-folder/sync';
import { createProjectFromShootRun } from './project-lifecycle';
import {
  deleteProjectRecord,
  findProjectIdByPlatformJob,
  getPlatformJob,
  getProject,
  listPlatformJobsForProject,
  listProjectsForCurrentUser,
  upsertPlatformJob,
  upsertProject,
} from './project-store';
import type { PlatformJobRecord, ProjectMeta } from './types';

const SYNC_AT_KEY = 'eshop_sync_at';
const SYNC_THROTTLE_MS = 5 * 60 * 1000;
const SYNC_PAGE_LIMIT = 50;
const SYNC_MAX_JOBS = 200;

export type RemoteOpenApiJob = {
  job_id: string;
  slug: string;
  status: JobStatusType;
  kind: ServiceKind;
  title: string | null;
  created_at: string;
  completed_at: string | null;
};

export type SyncProjectsResult = {
  synced: number;
  deleted: number;
  skipped: boolean;
  error?: string;
};

function apiBase(): string {
  const base = getOpenApiBaseUrl()?.replace(/\/$/, '');
  if (base) return base;
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}

function progressForStatus(status: JobStatusType): number {
  if (status === 'completed') return 100;
  if (status === 'failed') return 0;
  if (status === 'processing') return 50;
  return 0;
}

async function fetchRemoteJobsPage(
  cursor: number,
  token: string
): Promise<{ jobs: RemoteOpenApiJob[]; nextCursor: number | null }> {
  const url = new URL(`${apiBase()}/api/v1/open/jobs`);
  url.searchParams.set('rootOnly', 'true');
  url.searchParams.set('limit', String(SYNC_PAGE_LIMIT));
  url.searchParams.set('cursor', String(cursor));

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error('会话无效，请重新打开应用');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(String((err as { message?: string }).message ?? `同步失败 ${res.status}`));
  }
  const json = (await res.json()) as {
    data?: { jobs?: RemoteOpenApiJob[]; nextCursor?: number | null };
    jobs?: RemoteOpenApiJob[];
    nextCursor?: number | null;
  };
  const data = json.data ?? json;
  const jobs = (data.jobs ?? []) as RemoteOpenApiJob[];
  const nextCursor =
    data.nextCursor != null && jobs.length >= SYNC_PAGE_LIMIT ? Number(data.nextCursor) : null;
  return { jobs, nextCursor };
}

async function fetchAllRemoteJobs(token: string): Promise<RemoteOpenApiJob[]> {
  const all: RemoteOpenApiJob[] = [];
  let cursor = 0;
  while (all.length < SYNC_MAX_JOBS) {
    const page = await fetchRemoteJobsPage(cursor, token);
    all.push(...page.jobs);
    if (page.nextCursor == null || page.jobs.length === 0) break;
    cursor = page.nextCursor;
  }
  return all.slice(0, SYNC_MAX_JOBS);
}

async function upsertRemoteJob(item: RemoteOpenApiJob, endUserId: string): Promise<void> {
  const title = item.title?.trim() || fallbackTitleForSlug(item.slug);
  const updatedAt = item.completed_at ?? item.created_at;
  const progress = progressForStatus(item.status);
  const existingProjectId = await findProjectIdByPlatformJob(item.slug, item.job_id);

  if (existingProjectId) {
    const project = await getProject(existingProjectId);
    const job = await getPlatformJob(item.slug, item.job_id);
    if (project) {
      const next: ProjectMeta = {
        ...project,
        endUserId: project.endUserId ?? endUserId,
        status: item.status,
        progress,
        updatedAt,
        title: project.title?.trim() ? project.title : title,
      };
      await upsertProject(next);
    }
    if (job) {
      const nextJob: PlatformJobRecord = {
        ...job,
        endUserId: job.endUserId ?? endUserId,
        status: item.status,
        progress,
        updatedAt,
        kind: item.kind ?? job.kind,
        displayName: job.displayName?.trim() ? job.displayName : title,
      };
      await upsertPlatformJob(nextJob);
    }
    return;
  }

  await createProjectFromShootRun({
    platformJobId: item.job_id,
    shootSlug: item.slug,
    title,
    kind: item.kind,
    endUserId,
    status: item.status,
    progress,
    createdAt: item.created_at,
    updatedAt,
  });
}

async function deleteOrphanProjects(
  cloudJobIds: Set<string>,
  endUserId: string
): Promise<number> {
  const local = await listProjectsForCurrentUser();
  let deleted = 0;
  for (const p of local) {
    if (p.endUserId && p.endUserId !== endUserId) continue;
    if (!isProjectRootSlug(p.shootSlug)) continue;
    if (cloudJobIds.has(p.rootPlatformJobId)) continue;

    const jobs = await listPlatformJobsForProject(p.projectId);
    for (const j of jobs) {
      await deleteTaskFolder(j.platformJobId);
      revokeBlobUrlsForJob(j.platformJobId);
    }
    await deleteProjectRecord(p.projectId);
    deleted += 1;
  }
  return deleted;
}

/** 从云端拉取任务列表并 reconcile 本地 IndexedDB 缓存 */
export async function syncProjectsFromCloud(opts?: {
  force?: boolean;
}): Promise<SyncProjectsResult> {
  if (getApiMode() !== 'http') {
    return { synced: 0, deleted: 0, skipped: true };
  }

  const endUserId = getStoredEndUserId();
  if (!endUserId) {
    return { synced: 0, deleted: 0, skipped: true, error: '无 Partner 身份' };
  }

  if (!opts?.force && typeof window !== 'undefined') {
    const last = Number(localStorage.getItem(SYNC_AT_KEY) ?? 0);
    if (last && Date.now() - last < SYNC_THROTTLE_MS) {
      return { synced: 0, deleted: 0, skipped: true };
    }
  }

  const token = await getAuthBearerToken();
  if (!token) {
    return { synced: 0, deleted: 0, skipped: true, error: '未登录' };
  }

  try {
    const remote = await fetchAllRemoteJobs(token);
    for (const item of remote) {
      if (!isProjectRootSlug(item.slug)) continue;
      await upsertRemoteJob(item, endUserId);
    }

    const cloudIds = new Set(remote.map((j) => j.job_id));
    const deleted = await deleteOrphanProjects(cloudIds, endUserId);

    if (typeof window !== 'undefined') {
      localStorage.setItem(SYNC_AT_KEY, String(Date.now()));
    }

    return { synced: remote.length, deleted, skipped: false };
  } catch (e) {
    return {
      synced: 0,
      deleted: 0,
      skipped: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
