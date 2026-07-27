'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getOpenApiAdapter } from '@/adapters';
import type { JobResultItem, JobStatus } from '@/adapters/types';
import {
  aggregateProjectStatus,
  deleteProjectRecord,
  getProject,
  listPlatformJobsForProject,
  listProjectListItems,
  patchPlatformJobFromJobStatus,
} from '@/lib/project/project-store';
import { getProjectShootJob } from '@/lib/project/project-lifecycle';
import { loadProjectSnapshot } from '@/lib/project/project-cache';
import type { PlatformJobRecord, ProjectListItem, ProjectMeta } from '@/lib/project/types';
import { getApiMode } from '@/lib/runtime-config';
import {
  isTerminalWsStatus,
  mapWsStatus,
  progressFromWsTask,
  taskNotificationsWs,
  type TaskWsMessage,
} from '@/lib/realtime/task-notifications-ws';
import { deleteTaskFolder } from '@/lib/task-folder/db';
import { loadResultsFromTaskFolder, revokeBlobUrlsForJob } from '@/lib/task-folder/sync';
import { resolveDisplayMediaUrl } from '@/lib/media-url';
import {
  resolveActiveJobPollMs,
  WS_BACKUP_POLL_MS,
} from '@/lib/adaptive-job-poll';

function previewFromResults(
  results: JobResultItem[] | undefined,
  platformJobId: string
): string | undefined {
  const first = results?.[0];
  if (!first) return undefined;
  if (first.localUrl) return first.localUrl;
  const raw = first.url ?? first.remoteUrl;
  if (!raw) return undefined;
  return resolveDisplayMediaUrl(raw, {
    taskId: platformJobId,
    source: first.gridCell ? `cell:${first.gridCell}` : undefined,
  });
}

const LIST_BACKUP_POLL_MS = 10000;

export type ProjectShootView = {
  project: ProjectMeta;
  job: JobStatus | null;
};

export function useProject(projectId: string | null) {
  const [project, setProject] = useState<ProjectMeta | null>(null);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollMsRef = useRef<number>(resolveActiveJobPollMs());
  const projectIdRef = useRef(projectId);
  const projectMetaRef = useRef<ProjectMeta | null>(null);
  projectIdRef.current = projectId;

  const poll = useCallback(async () => {
    const id = projectIdRef.current;
    if (!id) return;
    try {
      const meta = (await aggregateProjectStatus(id)) ?? (await getProject(id));
      if (!meta) {
        setError('项目不存在');
        return;
      }
      projectMetaRef.current = meta;
      setProject(meta);
      const shoot = await getProjectShootJob(id);
      if (!shoot) return;
      const data = await getOpenApiAdapter().getJob(shoot.slug, shoot.platformJobId);
      setJob(data);
      if (data.status === 'failed') {
        if (timerRef.current) clearInterval(timerRef.current);
      } else if (data.status === 'completed' && (data.results?.length ?? 0) > 0) {
        if (timerRef.current) clearInterval(timerRef.current);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '查询失败');
    }
  }, []);

  const applyWsUpdate = useCallback(
    (msg: TaskWsMessage) => {
      const id = projectIdRef.current;
      const meta = projectMetaRef.current;
      if (!id || !meta?.rootPlatformJobId) return;
      if (msg.task.id !== meta.rootPlatformJobId) return;
      const status = mapWsStatus(msg.task.status);
      setJob((prev) => {
        const base = prev ?? {
          jobId: meta.rootPlatformJobId,
          slug: meta.shootSlug,
          title: meta.title,
          displayName: meta.title,
          status: 'pending' as const,
          progress: 0,
          createdAt: meta.createdAt,
          updatedAt: meta.updatedAt,
        };
        return {
          ...base,
          status,
          progress: progressFromWsTask(msg.task),
          updatedAt: new Date().toISOString(),
          error:
            status === 'failed'
              ? String(msg.task.progress?.error ?? base.error ?? '任务失败')
              : base.error,
        };
      });
      void aggregateProjectStatus(id).then((updated) => {
        if (updated) {
          projectMetaRef.current = updated;
          setProject(updated);
        }
      });
      if (isTerminalWsStatus(msg.task.status) || msg.event === 'task_completed' || msg.event === 'task_failed') {
        void poll();
        if (timerRef.current) clearInterval(timerRef.current);
      }
    },
    [poll]
  );

  const applyWsRef = useRef(applyWsUpdate);
  applyWsRef.current = applyWsUpdate;

  const restartPollInterval = useCallback(
    (pollFn: () => void) => {
      const nextMs = resolveActiveJobPollMs();
      if (timerRef.current && pollMsRef.current === nextMs) return;
      pollMsRef.current = nextMs;
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => void pollFn(), nextMs);
    },
    []
  );

  useEffect(() => {
    if (!projectId) return;
    setError(null);
    if (timerRef.current) clearInterval(timerRef.current);

    let cancelled = false;
    let sseAbort: AbortController | null = null;

    void (async () => {
      const cached = await loadProjectSnapshot(projectId);
      if (cancelled) return;
      if (cached) {
        projectMetaRef.current = cached.meta;
        setProject(cached.meta);
        setJob(cached.job);
      } else {
        projectMetaRef.current = null;
        setProject(null);
        setJob(null);
      }

      await poll();
      if (cancelled) return;

      if (getApiMode() !== 'http') return;
      const meta = await getProject(projectId);
      if (!meta) return;
      const shoot = await getProjectShootJob(projectId);
      if (!shoot) return;
      const adapter = getOpenApiAdapter();
      if (!('subscribeJobEvents' in adapter) || typeof (adapter as { subscribeJobEvents?: unknown }).subscribeJobEvents !== 'function') {
        return;
      }
      sseAbort = new AbortController();
      (adapter as import('@/adapters/http').HttpOpenApiAdapter).subscribeJobEvents(
        shoot.slug,
        shoot.platformJobId,
        (ev) => {
          if (ev === 'initial' || ev === 'task_snapshot' || ev === 'terminal') {
            void poll();
          }
          if (ev === 'terminal' && timerRef.current) {
            clearInterval(timerRef.current);
          }
        },
        sseAbort.signal
      );
    })();

    restartPollInterval(poll);

    const unsubWs =
      getApiMode() === 'http'
        ? taskNotificationsWs.subscribe((msg) => applyWsRef.current(msg))
        : () => {};

    const pollAdjustTimer = setInterval(() => {
      restartPollInterval(poll);
    }, WS_BACKUP_POLL_MS);

    return () => {
      cancelled = true;
      sseAbort?.abort();
      unsubWs();
      clearInterval(pollAdjustTimer);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [projectId, poll, restartPollInterval]);

  return { project, job, error, refresh: poll };
}

export type PlatformJobView = PlatformJobRecord & {
  previewUrl?: string;
  results?: JobResultItem[];
};

export function useProjectJobs(
  projectId: string,
  opts?: {
    role?: PlatformJobRecord['role'];
    batchKey?: string;
    gridCell?: string | null;
    rootPlatformJobId?: string;
  }
) {
  const [items, setItems] = useState<PlatformJobView[]>([]);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const loadFromCache = useCallback(async () => {
    const metas = await listPlatformJobsForProject(projectId, {
      role: opts?.role,
      batchKey: opts?.batchKey,
      gridCell: opts?.gridCell ?? undefined,
    });
    const views = await Promise.all(
      metas.map(async (m) => {
        const results =
          m.status === 'completed'
            ? await loadResultsFromTaskFolder(m.platformJobId)
            : undefined;
        const preview = previewFromResults(results, m.platformJobId);
        return { ...m, results, previewUrl: preview };
      })
    );
    setItems(views);
    return views;
  }, [projectId, opts?.role, opts?.batchKey, opts?.gridCell]);

  const refresh = useCallback(async (refreshOpts?: { background?: boolean }) => {
    if (opts?.role === 'hd' && opts.rootPlatformJobId) {
      const { reconcileHdJobsForProject } = await import('@/lib/project/project-lifecycle');
      await reconcileHdJobsForProject(projectId, opts.rootPlatformJobId);
    }

    const metas = await listPlatformJobsForProject(projectId, {
      role: opts?.role,
      batchKey: opts?.batchKey,
      gridCell: opts?.gridCell ?? undefined,
    });
    const views = await Promise.all(
      metas.map(async (m) => {
        const active = m.status === 'pending' || m.status === 'processing';
        let status = m.status;
        let progress = m.progress;
        let results =
          m.status === 'completed'
            ? await loadResultsFromTaskFolder(m.platformJobId)
            : undefined;

        if (active || m.status === 'completed') {
          try {
            const job = await getOpenApiAdapter().getJob(m.slug, m.platformJobId);
            status = job.status;
            progress = job.progress;
            if (job.results?.length) {
              results = job.results;
            } else if (status === 'completed' && !results?.length) {
              results = await loadResultsFromTaskFolder(m.platformJobId);
            }
          } catch {
            if (!results?.length && m.status === 'completed') {
              results = await loadResultsFromTaskFolder(m.platformJobId);
            }
          }
        }

        const preview = previewFromResults(results, m.platformJobId);
        return { ...m, status, progress, results, previewUrl: preview };
      })
    );
    setItems(views);
    return views;
  }, [projectId, opts?.role, opts?.batchKey, opts?.gridCell, opts?.rootPlatformJobId]);

  const pollActive = useCallback(async () => {
    const current = itemsRef.current;
    const active = current.filter(
      (m) => m.status === 'pending' || m.status === 'processing'
    );
    if (!active.length) return;
    await Promise.all(
      active.map(async (m) => {
        try {
          await getOpenApiAdapter().getJob(m.slug, m.platformJobId);
        } catch {
          /* ignore */
        }
      })
    );
    await refresh();
  }, [refresh]);

  useEffect(() => {
    void (async () => {
      const cached = await loadFromCache();
      await refresh({ background: cached.length > 0 });
    })();
  }, [loadFromCache, refresh]);

  useEffect(() => {
    const hasActive = items.some(
      (m) => m.status === 'pending' || m.status === 'processing'
    );
    if (!hasActive) return;
    const pollMs = resolveActiveJobPollMs();
    const t = setInterval(() => void pollActive(), pollMs);
    return () => clearInterval(t);
  }, [items, pollActive]);

  return { items, refresh };
}

export function useProjectList() {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const projectsRef = useRef(projects);
  projectsRef.current = projects;

  const refresh = useCallback(async (opts?: { background?: boolean }) => {
    const hasCached = projectsRef.current.length > 0;
    if (!opts?.background && !hasCached) setLoading(true);
    try {
      if (getApiMode() === 'http') {
        await import('@/lib/project/project-sync').then((m) => m.syncProjectsFromCloud());
      }
      let data = await listProjectListItems();
      const active = data.filter(
        (p) => p.status === 'pending' || p.status === 'processing'
      );
      if (active.length > 0 && getApiMode() === 'http') {
        await Promise.all(
          active.map(async (p) => {
            try {
              const job = await getOpenApiAdapter().getJob(
                p.shootSlug,
                p.rootPlatformJobId
              );
              await patchPlatformJobFromJobStatus(job);
            } catch {
              /* ignore */
            }
          })
        );
        data = await listProjectListItems();
      }
      setProjects(data);
    } finally {
      setLoading(false);
    }
  }, []);

  const removeProject = useCallback(async (projectId: string) => {
    const jobs = await listPlatformJobsForProject(projectId);
    for (const j of jobs) {
      await deleteTaskFolder(j.platformJobId);
      revokeBlobUrlsForJob(j.platformJobId);
    }
    await deleteProjectRecord(projectId);
    setProjects((prev) => prev.filter((p) => p.projectId !== projectId));
  }, []);

  const refreshOne = useCallback(async (projectId: string) => {
    try {
      const meta = await aggregateProjectStatus(projectId);
      if (!meta) return;
      const shoot = await getProjectShootJob(projectId);
      if (shoot) {
        const job = await getOpenApiAdapter().getJob(shoot.slug, shoot.platformJobId);
        await patchPlatformJobFromJobStatus(job);
      }
      const list = await listProjectListItems();
      setProjects(list);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const cached = await listProjectListItems();
      if (cancelled) return;
      if (cached.length) {
        setProjects(cached);
        setLoading(false);
        void refresh({ background: true });
      } else {
        await refresh();
      }
    })();

    if (getApiMode() !== 'http') {
      const t = setInterval(() => void refresh({ background: true }), LIST_BACKUP_POLL_MS);
      return () => {
        cancelled = true;
        clearInterval(t);
      };
    }

    const unsub = taskNotificationsWs.subscribe((msg) => {
      const taskId = msg.task.id;
      if (!taskId) return;
      const hit = projectsRef.current.find((p) => p.rootPlatformJobId === taskId);
      if (!hit) {
        if (isTerminalWsStatus(msg.task.status)) void refresh({ background: true });
        return;
      }
      if (isTerminalWsStatus(msg.task.status) || msg.event === 'task_completed') {
        void refreshOne(hit.projectId);
        return;
      }
      setProjects((prev) =>
        prev.map((p) =>
          p.rootPlatformJobId === taskId
            ? {
                ...p,
                status: mapWsStatus(msg.task.status),
                progress: progressFromWsTask(msg.task),
                updatedAt: new Date().toISOString(),
              }
            : p
        )
      );
    });

    let t: ReturnType<typeof setInterval> | null = null;
    const startBackup = () => {
      if (t) return;
      t = setInterval(() => void refresh({ background: true }), LIST_BACKUP_POLL_MS);
    };
    const stopBackup = () => {
      if (t) clearInterval(t);
      t = null;
    };
    const onVis = () => {
      if (document.visibilityState === 'hidden') stopBackup();
      else {
        void refresh({ background: true });
        startBackup();
      }
    };
    startBackup();
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelled = true;
      unsub();
      stopBackup();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [refresh, refreshOne]);

  return { projects, loading, refresh, removeProject };
}

/** @deprecated 使用 useProject */
export function useJobPoller(slug: string, jobId: string | null) {
  const [job, setJob] = useState<JobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const poll = useCallback(async () => {
    if (!jobId) return;
    try {
      const data = await getOpenApiAdapter().getJob(slug, jobId);
      setJob(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : '查询失败');
    }
  }, [slug, jobId]);

  useEffect(() => {
    void poll();
  }, [poll]);

  return { job, error, refresh: poll };
}

/** @deprecated 使用 useProjectList */
export function useJobList() {
  const { projects, loading, refresh, removeProject } = useProjectList();
  const jobs: JobStatus[] = projects.map((p) => ({
    jobId: p.rootPlatformJobId,
    slug: p.shootSlug,
    title: p.title,
    displayName: p.title,
    status: p.status,
    progress: p.progress,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    outputGrid: p.outputGrid,
    parallelCount: p.parallelCount,
    assetCount: p.assetCount,
    error: p.error,
  }));
  return {
    jobs,
    loading,
    refresh,
    removeJob: async (jobId: string) => {
      const p = projects.find((x) => x.rootPlatformJobId === jobId);
      if (p) await removeProject(p.projectId);
    },
  };
}

/** @deprecated 使用 useProjectJobs(projectId, { role: 'hd' }) */
export function useHdDerivatives(
  parentJobId: string,
  opts?: {
    batchKey?: string;
    parentSlug?: string;
    gridCell?: string | null;
    reconcile?: boolean;
  }
) {
  const [projectId, setProjectId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { findProjectIdByPlatformJob } = await import('@/lib/project/project-store');
      const id = await findProjectIdByPlatformJob(opts?.parentSlug ?? '', parentJobId);
      setProjectId(id);
    })();
  }, [parentJobId, opts?.parentSlug]);

  const { items, refresh } = useProjectJobs(projectId ?? '', {
    role: 'hd',
    batchKey: opts?.batchKey,
    gridCell: opts?.gridCell,
  });

  return { items, refresh, reconcile: refresh };
}
