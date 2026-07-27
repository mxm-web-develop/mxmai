'use client';

import { isGridShootSlug } from '@/catalog/grid-shoot-lines';
import { PUBLISHED_OPEN_API_SLUGS as S } from '@/catalog/published-slugs';
import { listJobMetas } from '@/lib/task-folder/db';
import type { TaskFolderMeta } from '@/lib/task-folder/types';
import { createProjectFromShootRun, attachPlatformJob } from './project-lifecycle';
import { getPlatformJob, listProjects, upsertPlatformJob, upsertProject } from './project-store';
import type { PlatformJobRecord, ProjectMeta } from './types';
import { platformJobRecordId } from './types';

const MIGRATION_FLAG = 'eshop_db_migrated_v2';

export function isProjectMigrationDone(): boolean {
  if (typeof localStorage === 'undefined') return true;
  return localStorage.getItem(MIGRATION_FLAG) === '1';
}

function markMigrationDone(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(MIGRATION_FLAG, '1');
  }
}

function jobToShootProjectMeta(
  meta: TaskFolderMeta,
  projectId: string
): { project: ProjectMeta; platformJob: PlatformJobRecord } {
  const now = meta.updatedAt;
  const project: ProjectMeta = {
    projectId,
    title: meta.displayName ?? meta.title,
    shootSlug: meta.slug,
    outputGrid: meta.outputGrid,
    createdAt: meta.createdAt,
    updatedAt: now,
    status: meta.status,
    progress: meta.progress,
    rootPlatformJobId: meta.jobId,
    coverPlatformJobId: meta.jobId,
    error: meta.error,
  };
  const platformJob: PlatformJobRecord = {
    id: platformJobRecordId(meta.slug, meta.jobId),
    platformJobId: meta.jobId,
    slug: meta.slug,
    projectId,
    role: 'shoot',
    kind: meta.kind,
    status: meta.status,
    progress: meta.progress,
    createdAt: meta.createdAt,
    updatedAt: now,
    assetCount: meta.assetCount,
    displayName: meta.displayName,
    outputGrid: meta.outputGrid,
    error: meta.error,
    children: meta.children,
  };
  return { project, platformJob };
}

function jobToHdPlatformJob(
  meta: TaskFolderMeta,
  projectId: string
): PlatformJobRecord | null {
  const derived = meta.derivedFrom;
  if (!derived) return null;
  return {
    id: platformJobRecordId(meta.slug, meta.jobId),
    platformJobId: meta.jobId,
    slug: meta.slug,
    projectId,
    role: 'hd',
    kind: meta.kind,
    status: meta.status,
    progress: meta.progress,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    assetCount: meta.assetCount,
    error: meta.error,
    context: {
      batchKey: derived.batchKey,
      gridCell: derived.gridCell,
      sourcePlatformJobId: derived.parentJobId,
    },
  };
}

/** v1 jobs store → projects + platform_jobs（幂等） */
export async function migrateV1ToProjects(): Promise<void> {
  if (isProjectMigrationDone()) {
    const existing = await listProjects();
    if (existing.length > 0) return;
  }

  const legacy = await listJobMetas();
  if (!legacy.length) {
    markMigrationDone();
    return;
  }

  const parentJobToProjectId = new Map<string, string>();

  for (const meta of legacy) {
    if (meta.slug === S.toolsHd) continue;
    if (!isGridShootSlug(meta.slug)) continue;
    const existingJob = await getPlatformJob(meta.slug, meta.jobId);
    if (existingJob) {
      parentJobToProjectId.set(meta.jobId, existingJob.projectId);
      continue;
    }
    const projectId = crypto.randomUUID?.() ?? `proj_${meta.jobId}`;
    const { project, platformJob } = jobToShootProjectMeta(meta, projectId);
    await upsertProject(project);
    await upsertPlatformJob(platformJob);
    parentJobToProjectId.set(meta.jobId, projectId);
  }

  for (const meta of legacy) {
    if (meta.slug !== S.toolsHd) continue;
    const existingJob = await getPlatformJob(meta.slug, meta.jobId);
    if (existingJob) continue;

    const parentId = meta.derivedFrom?.parentJobId;
    if (!parentId) continue;

    let projectId = parentJobToProjectId.get(parentId);
    if (!projectId) {
      const parentMeta = legacy.find((m) => m.jobId === parentId);
      if (parentMeta && isGridShootSlug(parentMeta.slug)) {
        const { project, platformJob } = jobToShootProjectMeta(
          parentMeta,
          crypto.randomUUID?.() ?? `proj_${parentId}`
        );
        await upsertProject(project);
        await upsertPlatformJob(platformJob);
        projectId = project.projectId;
        parentJobToProjectId.set(parentId, projectId);
      }
    }
    if (!projectId) continue;

    const hdJob = jobToHdPlatformJob(meta, projectId);
    if (hdJob) await upsertPlatformJob(hdJob);
  }

  markMigrationDone();
}

export async function ensureProjectStorageReady(): Promise<void> {
  await migrateV1ToProjects();
}
