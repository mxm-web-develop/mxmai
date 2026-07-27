'use client';

import type { JobStatus } from '@/adapters/types';
import {
  openDb,
  STORE_PLATFORM_JOBS,
  STORE_PROJECTS,
} from '@/lib/task-folder/db';
import { pickCoverFromResults } from './project-cover';
import type {
  PlatformJobContext,
  PlatformJobRecord,
  PlatformJobRole,
  ProjectListItem,
  ProjectMeta,
} from './types';
import { platformJobRecordId } from './types';
import { getStoredEndUserId } from '@/lib/partner-session';

function projectMatchesCurrentUser(p: ProjectMeta): boolean {
  const current = getStoredEndUserId();
  if (!current) return !p.endUserId;
  if (!p.endUserId) return true;
  return p.endUserId === current;
}

export async function listProjectsForCurrentUser(): Promise<ProjectMeta[]> {
  const all = await listProjects();
  return all.filter(projectMatchesCurrentUser);
}

export async function upsertProject(project: ProjectMeta): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_PROJECTS, 'readwrite');
    tx.objectStore(STORE_PROJECTS).put(project);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function getProject(projectId: string): Promise<ProjectMeta | null> {
  const db = await openDb();
  const row = await new Promise<ProjectMeta | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_PROJECTS, 'readonly');
    const req = tx.objectStore(STORE_PROJECTS).get(projectId);
    req.onsuccess = () => resolve(req.result as ProjectMeta | undefined);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return row ?? null;
}

export async function listProjects(): Promise<ProjectMeta[]> {
  const db = await openDb();
  const list = await new Promise<ProjectMeta[]>((resolve, reject) => {
    const tx = db.transaction(STORE_PROJECTS, 'readonly');
    const req = tx.objectStore(STORE_PROJECTS).getAll();
    req.onsuccess = () => resolve((req.result as ProjectMeta[]) ?? []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function deleteProjectRecord(projectId: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE_PROJECTS, STORE_PLATFORM_JOBS], 'readwrite');
    tx.objectStore(STORE_PROJECTS).delete(projectId);
    const jobStore = tx.objectStore(STORE_PLATFORM_JOBS);
    const idx = jobStore.index('projectId');
    const req = idx.getAll(projectId);
    req.onsuccess = () => {
      for (const row of (req.result as PlatformJobRecord[]) ?? []) {
        jobStore.delete(row.id);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function upsertPlatformJob(record: PlatformJobRecord): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_PLATFORM_JOBS, 'readwrite');
    tx.objectStore(STORE_PLATFORM_JOBS).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function getPlatformJob(
  slug: string,
  platformJobId: string
): Promise<PlatformJobRecord | null> {
  const db = await openDb();
  const id = platformJobRecordId(slug, platformJobId);
  const row = await new Promise<PlatformJobRecord | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_PLATFORM_JOBS, 'readonly');
    const req = tx.objectStore(STORE_PLATFORM_JOBS).get(id);
    req.onsuccess = () => resolve(req.result as PlatformJobRecord | undefined);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return row ?? null;
}

export async function listPlatformJobsForProject(
  projectId: string,
  opts?: { role?: PlatformJobRole; gridCell?: string; batchKey?: string }
): Promise<PlatformJobRecord[]> {
  const db = await openDb();
  const list = await new Promise<PlatformJobRecord[]>((resolve, reject) => {
    const tx = db.transaction(STORE_PLATFORM_JOBS, 'readonly');
    const req = tx.objectStore(STORE_PLATFORM_JOBS).index('projectId').getAll(projectId);
    req.onsuccess = () => resolve((req.result as PlatformJobRecord[]) ?? []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return list
    .filter((r) => !opts?.role || r.role === opts.role)
    .filter((r) => !opts?.gridCell || r.context?.gridCell === opts.gridCell)
    .filter((r) => {
      if (!opts?.batchKey) return true;
      const bk = r.context?.batchKey;
      if (!bk || bk === opts.batchKey) return true;
      const legacy = new Set(['main', 'contact']);
      return legacy.has(bk) && legacy.has(opts.batchKey);
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function findProjectIdByPlatformJob(
  slug: string,
  platformJobId: string
): Promise<string | null> {
  const job = await getPlatformJob(slug, platformJobId);
  return job?.projectId ?? null;
}

function batchKeyMatches(ctx: PlatformJobContext | undefined, batchKey?: string): boolean {
  if (!batchKey) return true;
  const bk = ctx?.batchKey;
  if (!bk || bk === batchKey) return true;
  const legacy = new Set(['main', 'contact']);
  return legacy.has(bk) && legacy.has(batchKey);
}

export async function aggregateProjectStatus(projectId: string): Promise<ProjectMeta | null> {
  const project = await getProject(projectId);
  if (!project) return null;
  const jobs = await listPlatformJobsForProject(projectId);
  const root =
    jobs.find((j) => j.platformJobId === project.rootPlatformJobId && j.role === 'shoot') ??
    jobs.find((j) => j.role === 'shoot');
  if (!root) return project;
  const updated: ProjectMeta = {
    ...project,
    status: root.status,
    progress: root.progress,
    outputGrid: root.outputGrid ?? project.outputGrid,
    error: root.error,
    coverPlatformJobId: root.platformJobId,
    updatedAt: root.updatedAt,
  };
  await upsertProject(updated);
  return updated;
}

export async function patchPlatformJobFromJobStatus(job: JobStatus): Promise<void> {
  const existing = await getPlatformJob(job.slug, job.jobId);
  if (!existing) return;

  const record: PlatformJobRecord = {
    ...existing,
    status: job.status,
    progress: job.progress,
    updatedAt: job.updatedAt,
    assetCount: Math.max(job.results?.length ?? 0, existing.assetCount),
    displayName: job.displayName ?? existing.displayName,
    outputGrid: job.outputGrid ?? existing.outputGrid,
    error: job.error,
    children: job.children?.map((c) => ({
      id: c.id,
      label: c.label,
      status: c.status,
      progress: c.progress,
    })),
  };
  await upsertPlatformJob(record);

  const project = await getProject(existing.projectId);
  const coverUrl = pickCoverFromResults(job.results, job.jobId);
  if (project && coverUrl && coverUrl !== project.coverUrl) {
    await upsertProject({ ...project, coverUrl, updatedAt: job.updatedAt });
  }

  await aggregateProjectStatus(existing.projectId);
}

export async function listProjectListItems(): Promise<ProjectListItem[]> {
  const projects = await listProjectsForCurrentUser();
  const { resolveProjectCoverUrl } = await import('./project-cover');

  const enriched = await Promise.all(
    projects.map(async (p) => {
      const jobs = await listPlatformJobsForProject(p.projectId);
      const shoot = jobs.find((j) => j.role === 'shoot' && j.platformJobId === p.rootPlatformJobId);
      const assetCount = shoot?.assetCount ?? 0;
      const coverUrl = await resolveProjectCoverUrl(p);
      if (coverUrl && coverUrl !== p.coverUrl) {
        await upsertProject({ ...p, coverUrl });
      }
      return { ...p, assetCount, coverUrl: coverUrl ?? p.coverUrl };
    })
  );

  return enriched;
}
