import type {
  JobChildTask,
  JobResultItem,
  JobStatus,
  JobStatusType,
  PublishedApiManifest,
  RunBody,
  RunResponse,
  ServiceSummary,
} from '@/adapters/types';
import { getManifestBySlug } from '@/catalog/manifests';
import { PUBLISHED_OPEN_API_SLUGS as S } from '@/catalog/published-slugs';
import { ESHOP_SERVICES, listPublicServices } from '@/catalog/services';
import { isGridShootSlug } from '@/catalog/grid-shoot-lines';
import { createProjectFromShootRun } from '@/lib/project/project-lifecycle';
import { patchPlatformJobFromJobStatus } from '@/lib/project/project-store';
import { listJobMetas } from '@/lib/task-folder/db';
import {
  enrichJobWithTaskFolder,
  loadResultsFromTaskFolder,
  mediaFromJobResults,
  syncTaskFolderAssets,
} from '@/lib/task-folder/sync';
import { taskFolderPath } from '@/lib/task-folder/types';

const DEMO_RESULTS = ['/demo-results/sample-1.png', '/demo-results/sample-2.png'];

interface InternalJob extends JobStatus {
  tick: number;
  maxTicks: number;
  kind: PublishedApiManifest['kind'];
}

const activeJobs = new Map<string, InternalJob>();

function uid(): string {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getOutputGrid(body: RunBody): string {
  const data = 'input_data' in body ? body.input_data : body.params;
  return String(data?.output_grid ?? '1x1');
}

function getGarmentCount(body: RunBody): number {
  const data = 'input_data' in body ? body.input_data : body.params;
  const garments = data?.garments;
  if (Array.isArray(garments) && garments.length > 0) return garments.length;
  const parallel = Number(data?.parallel_count ?? 1);
  return Math.max(1, Math.min(12, parallel));
}

function gridCellCount(layout: string): number {
  if (layout === '3x3') return 9;
  if (layout === '2x2') return 4;
  return 1;
}

function buildChildren(count: number, tick: number, maxTicks: number): JobChildTask[] {
  return Array.from({ length: count }, (_, i) => {
    const childProgress = Math.min(100, Math.round(((tick + i * 0.3) / maxTicks) * 100));
    let status: JobStatusType = 'pending';
    if (childProgress >= 100) status = 'completed';
    else if (childProgress > 10) status = 'processing';
    return {
      id: `child_${i + 1}`,
      label: `SKU ${String.fromCharCode(65 + i)}`,
      status,
      progress: childProgress,
    };
  });
}

function buildGridResults(layout: string, sourceUrl: string): JobResultItem[] {
  const n = gridCellCount(layout);
  const cols = layout === '3x3' ? 3 : 2;
  const results: JobResultItem[] = [];
  for (let r = 0; r < (layout === '3x3' ? 3 : layout === '2x2' ? 2 : 1); r++) {
    for (let c = 0; c < (layout === '1x1' ? 1 : cols); c++) {
      if (results.length >= n) break;
      const cell = `${r + 1}-${c + 1}`;
      results.push({
        url: DEMO_RESULTS[results.length % DEMO_RESULTS.length],
        type: 'image',
        label: `格 ${cell}`,
        gridCell: cell,
        isGridCell: true,
        gridSourceUrl: sourceUrl,
        remoteUrl: DEMO_RESULTS[results.length % DEMO_RESULTS.length],
      });
    }
  }
  return results;
}

function buildResults(slug: string, opts: { outputGrid?: string; childCount?: number }): JobResultItem[] {
  if (slug === S.clothesVideo) {
    return [
      {
        url: DEMO_RESULTS[0],
        type: 'video',
        label: '动效短片',
        remoteUrl: DEMO_RESULTS[0],
      },
    ];
  }

  if (slug === S.toolsHd) {
    return [
      {
        url: DEMO_RESULTS[0],
        type: 'image',
        label: 'HD 放大',
        remoteUrl: DEMO_RESULTS[0],
      },
    ];
  }

  const grid = opts.outputGrid ?? '1x1';
  if (grid !== '1x1') {
    return buildGridResults(grid, DEMO_RESULTS[0]);
  }

  const count = opts.childCount && opts.childCount > 1 ? opts.childCount : 1;
  return Array.from({ length: count }, (_, i) => ({
    url: DEMO_RESULTS[i % DEMO_RESULTS.length],
    type: 'image' as const,
    label: count > 1 ? `成片 ${i + 1}` : '成片',
    remoteUrl: DEMO_RESULTS[i % DEMO_RESULTS.length],
  }));
}

async function persistCompletedJob(job: InternalJob): Promise<JobStatus> {
  const remoteResults = job.results ?? buildResults(job.slug, {
    outputGrid: job.outputGrid,
    childCount: job.children?.length,
  });
  const synced = await syncTaskFolderAssets(job.jobId, job.slug, job.title, job.kind, mediaFromJobResults(remoteResults), {
    status: 'completed',
    progress: 100,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    outputGrid: job.outputGrid,
    children: job.children?.map((c) => ({
      id: c.id,
      label: c.label,
      status: c.status,
      progress: c.progress,
    })),
  });
  activeJobs.delete(job.jobId);
  return {
    jobId: job.jobId,
    slug: job.slug,
    title: job.title,
    status: 'completed',
    progress: 100,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    children: job.children,
    results: synced,
    outputGrid: job.outputGrid,
    taskFolderPath: taskFolderPath(job.jobId),
    assetCount: synced.length,
  };
}

async function advanceJob(job: InternalJob): Promise<JobStatus> {
  job.tick += 1;
  const ratio = job.tick / job.maxTicks;
  job.progress = Math.min(100, Math.round(ratio * 100));
  job.updatedAt = new Date().toISOString();

  if (job.children?.length) {
    job.children = buildChildren(job.children.length, job.tick, job.maxTicks);
  }

  if (job.tick >= job.maxTicks) {
    return persistCompletedJob(job);
  }

  job.status = job.tick > 0 ? 'processing' : 'pending';
  const snapshot: JobStatus = {
    jobId: job.jobId,
    slug: job.slug,
    title: job.title,
    status: job.status,
    progress: job.progress,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    children: job.children,
    outputGrid: job.outputGrid,
    taskFolderPath: taskFolderPath(job.jobId),
  };
  await patchPlatformJobFromJobStatus(snapshot);
  return snapshot;
}

export function tickAllJobs(): void {
  for (const [id, job] of activeJobs) {
    void advanceJob(job).then((updated) => {
      if (updated.status === 'completed') activeJobs.delete(id);
      else activeJobs.set(id, { ...job, ...updated, tick: job.tick, maxTicks: job.maxTicks, kind: job.kind });
    });
  }
}

export async function createMockJob(slug: string, body: RunBody): Promise<RunResponse> {
  const displayName =
    typeof body.displayName === 'string' ? body.displayName.trim() : undefined;
  const manifest = getManifestBySlug(slug);
  const service = ESHOP_SERVICES.find((s) => s.slug === slug);
  if (service?.comingSoon) throw new Error('该服务即将上线');

  const jobId = uid();
  const isBatch = slug === S.smartflowSuite;
  const childCount = isBatch ? getGarmentCount(body) : 0;
  const outputGrid = getOutputGrid(body);
  const maxTicks = 5 + Math.floor(Math.random() * 4);

  const now = new Date().toISOString();
  const job: InternalJob = {
    jobId,
    slug,
    title: manifest.title,
    displayName: displayName || undefined,
    kind: manifest.kind,
    status: 'pending',
    progress: 0,
    createdAt: now,
    updatedAt: now,
    tick: 0,
    maxTicks,
    outputGrid,
    children: isBatch ? buildChildren(childCount, 0, maxTicks) : undefined,
    taskFolderPath: taskFolderPath(jobId),
  };

  activeJobs.set(jobId, job);
  const snapshot: JobStatus = {
    jobId,
    slug,
    title: manifest.title,
    displayName: displayName || undefined,
    status: 'pending',
    progress: 0,
    createdAt: now,
    updatedAt: now,
    children: job.children,
    outputGrid,
    taskFolderPath: taskFolderPath(jobId),
  };
  if (isGridShootSlug(slug)) {
    await createProjectFromShootRun({
      platformJobId: jobId,
      shootSlug: slug,
      title: displayName || manifest.title,
      outputGrid,
      parallelCount: isBatch ? childCount : undefined,
    });
  } else {
    await patchPlatformJobFromJobStatus(snapshot);
  }

  return {
    jobId,
    kind: manifest.kind,
    status: 'pending',
    pollUrl: `/api/v1/open/${slug}/jobs/${jobId}`,
  };
}

export async function getMockJob(jobId: string): Promise<JobStatus | null> {
  const active = activeJobs.get(jobId);
  if (active) {
    const updated = await advanceJob(active);
    if (updated.status !== 'completed') {
      activeJobs.set(jobId, { ...active, ...updated, tick: active.tick, maxTicks: active.maxTicks, kind: active.kind });
    }
    return updated;
  }

  const meta = (await listJobMetas()).find((m) => m.jobId === jobId);
  const platformJob = meta ? null : await findPlatformJobById(jobId);

  if (!meta && !platformJob) return null;

  const slug = meta?.slug ?? platformJob!.slug;
  const status = meta?.status ?? platformJob!.status;
  const results = status === 'completed' ? await loadResultsFromTaskFolder(jobId) : undefined;
  const job: JobStatus = {
    jobId,
    slug,
    title: meta?.title ?? platformJob!.displayName ?? slug,
    displayName: meta?.displayName ?? platformJob!.displayName,
    status,
    progress: meta?.progress ?? platformJob!.progress,
    createdAt: meta?.createdAt ?? platformJob!.createdAt,
    updatedAt: meta?.updatedAt ?? platformJob!.updatedAt,
    children: meta?.children?.map((c) => ({
      id: c.id,
      label: c.label,
      status: c.status as JobStatusType,
      progress: c.progress,
    })) ?? platformJob!.children?.map((c) => ({
      id: c.id,
      label: c.label,
      status: c.status as JobStatusType,
      progress: c.progress,
    })),
    results,
    outputGrid: meta?.outputGrid ?? platformJob!.outputGrid,
    error: meta?.error ?? platformJob!.error,
    taskFolderPath: taskFolderPath(jobId),
    assetCount: meta?.assetCount ?? platformJob!.assetCount,
    projectId: platformJob?.projectId,
  };
  return enrichJobWithTaskFolder(job);
}

async function findPlatformJobById(platformJobId: string) {
  const { listPlatformJobsForProject, listProjects } = await import('@/lib/project/project-store');
  const projects = await listProjects();
  for (const p of projects) {
    const jobs = await listPlatformJobsForProject(p.projectId);
    const hit = jobs.find((j) => j.platformJobId === platformJobId);
    if (hit) return hit;
  }
  return null;
}

export async function listMockJobs(): Promise<JobStatus[]> {
  const metas = await listJobMetas();
  const jobs: JobStatus[] = [];
  for (const m of metas) {
    const active = activeJobs.get(m.jobId);
    if (active) {
      jobs.push({
        jobId: m.jobId,
        slug: m.slug,
        title: m.title,
        displayName: m.displayName,
        status: active.status,
        progress: active.progress,
        createdAt: m.createdAt,
        updatedAt: active.updatedAt,
        taskFolderPath: taskFolderPath(m.jobId),
        assetCount: m.assetCount,
      });
      continue;
    }
    const results = m.status === 'completed' ? await loadResultsFromTaskFolder(m.jobId) : undefined;
    jobs.push({
      jobId: m.jobId,
      slug: m.slug,
      title: m.title,
      displayName: m.displayName,
      status: m.status,
      progress: m.progress,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
      results,
      outputGrid: m.outputGrid,
      taskFolderPath: taskFolderPath(m.jobId),
      assetCount: m.assetCount,
    });
  }
  return jobs;
}

export { getManifestBySlug };

export function listServiceSummaries(): ServiceSummary[] {
  return listPublicServices();
}
