'use client';

import type { JobStatusType, ServiceKind } from '@/adapters/types';
import { getGridShootLineBySlug, isGridShootSlug } from '@/catalog/grid-shoot-lines';
import { PUBLISHED_OPEN_API_SLUGS as S } from '@/catalog/published-slugs';
import { getStoredEndUserId } from '@/lib/partner-session';
import {
  aggregateProjectStatus,
  getPlatformJob,
  getProject,
  upsertPlatformJob,
  upsertProject,
} from './project-store';
import type {
  PlatformJobContext,
  PlatformJobRecord,
  PlatformJobRole,
  ProjectMeta,
} from './types';
import { platformJobRecordId } from './types';

function newProjectId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `proj_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export type CreateProjectFromShootInput = {
  platformJobId: string;
  shootSlug: string;
  title: string;
  outputGrid?: string;
  parallelCount?: number;
  kind?: ServiceKind;
  endUserId?: string;
  status?: JobStatusType;
  progress?: number;
  createdAt?: string;
  updatedAt?: string;
};

export async function createProjectFromShootRun(
  input: CreateProjectFromShootInput
): Promise<ProjectMeta> {
  const now = new Date().toISOString();
  const line = getGridShootLineBySlug(input.shootSlug);
  const projectId = newProjectId();
  const endUserId = input.endUserId ?? getStoredEndUserId() ?? undefined;
  const createdAt = input.createdAt ?? now;
  const updatedAt = input.updatedAt ?? now;
  const status = input.status ?? 'pending';
  const progress = input.progress ?? (status === 'completed' ? 100 : 0);

  const project: ProjectMeta = {
    projectId,
    title: input.title,
    shootSlug: input.shootSlug,
    lineId: line?.id,
    outputGrid: input.outputGrid,
    parallelCount: input.parallelCount,
    createdAt,
    updatedAt,
    status,
    progress,
    rootPlatformJobId: input.platformJobId,
    coverPlatformJobId: input.platformJobId,
    endUserId,
  };

  const platformJob: PlatformJobRecord = {
    id: platformJobRecordId(input.shootSlug, input.platformJobId),
    platformJobId: input.platformJobId,
    slug: input.shootSlug,
    projectId,
    role: 'shoot',
    kind: input.kind ?? 'task_v2',
    status,
    progress,
    createdAt,
    updatedAt,
    assetCount: 0,
    displayName: input.title,
    outputGrid: input.outputGrid,
    endUserId,
  };

  await upsertProject(project);
  await upsertPlatformJob(platformJob);
  return project;
}

export type AttachPlatformJobInput = {
  projectId: string;
  platformJobId: string;
  slug: string;
  role: PlatformJobRole;
  kind?: ServiceKind;
  context?: PlatformJobContext;
  status?: PlatformJobRecord['status'];
  progress?: number;
};

export async function attachPlatformJob(input: AttachPlatformJobInput): Promise<PlatformJobRecord> {
  const existing = await getPlatformJob(input.slug, input.platformJobId);
  if (existing) {
    if (input.context) {
      const merged: PlatformJobRecord = {
        ...existing,
        context: { ...existing.context, ...input.context },
        updatedAt: new Date().toISOString(),
      };
      await upsertPlatformJob(merged);
      return merged;
    }
    return existing;
  }

  const now = new Date().toISOString();
  const record: PlatformJobRecord = {
    id: platformJobRecordId(input.slug, input.platformJobId),
    platformJobId: input.platformJobId,
    slug: input.slug,
    projectId: input.projectId,
    role: input.role,
    kind: input.kind ?? (input.slug === S.toolsHd ? 'task_v2' : 'task_v2'),
    status: input.status ?? 'pending',
    progress: input.progress ?? 0,
    createdAt: now,
    updatedAt: now,
    assetCount: 0,
    context: input.context,
  };

  await upsertPlatformJob(record);
  await aggregateProjectStatus(input.projectId);
  return record;
}

export function inferRoleForSlug(slug: string): PlatformJobRole {
  if (slug === S.toolsHd) return 'hd';
  if (slug === S.clothesVideo) return 'video';
  if (slug === S.smartflowSuite || slug.startsWith('smartflow-')) return 'smartflow';
  if (isGridShootSlug(slug)) return 'shoot';
  if (slug === S.poster) return 'shoot';
  return 'shoot';
}

export async function getProjectShootJob(projectId: string): Promise<PlatformJobRecord | null> {
  const project = await getProject(projectId);
  if (!project) return null;
  const { listPlatformJobsForProject } = await import('./project-store');
  const jobs = await listPlatformJobsForProject(projectId, { role: 'shoot' });
  return (
    jobs.find((j) => j.platformJobId === project.rootPlatformJobId) ?? jobs[0] ?? null
  );
}

/** 将 v1 jobs store 中遗漏的 tools-hd 补登记到 platform_jobs */
export async function reconcileHdJobsForProject(
  projectId: string,
  rootPlatformJobId: string
): Promise<void> {
  const { listJobMetas } = await import('@/lib/task-folder/db');
  const legacy = await listJobMetas();

  for (const meta of legacy) {
    if (meta.slug !== S.toolsHd) continue;
    const derived = meta.derivedFrom;
    if (!derived || derived.parentJobId !== rootPlatformJobId) continue;

    const existing = await getPlatformJob(meta.slug, meta.jobId);
    if (existing) {
      const needsContext =
        !existing.context?.gridCell && derived.gridCell;
      const needsCount = existing.assetCount < meta.assetCount;
      if (needsContext || needsCount) {
        await upsertPlatformJob({
          ...existing,
          assetCount: Math.max(existing.assetCount, meta.assetCount),
          status: meta.status,
          progress: meta.progress,
          updatedAt: meta.updatedAt,
          context: {
            ...existing.context,
            batchKey: existing.context?.batchKey ?? derived.batchKey,
            gridCell: existing.context?.gridCell ?? derived.gridCell,
            sourcePlatformJobId:
              existing.context?.sourcePlatformJobId ?? derived.parentJobId,
          },
        });
      }
      continue;
    }

    const now = meta.updatedAt;
    await upsertPlatformJob({
      id: platformJobRecordId(meta.slug, meta.jobId),
      platformJobId: meta.jobId,
      slug: meta.slug,
      projectId,
      role: 'hd',
      kind: meta.kind,
      status: meta.status,
      progress: meta.progress,
      createdAt: meta.createdAt,
      updatedAt: now,
      assetCount: meta.assetCount,
      error: meta.error,
      context: {
        batchKey: derived.batchKey,
        gridCell: derived.gridCell,
        sourcePlatformJobId: derived.parentJobId,
      },
    });
  }
}
