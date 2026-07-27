'use client';

import type { JobStatus } from '@/adapters/types';
import type { StoredAsset, TaskFolderMeta } from './types';

export const DB_NAME = 'eshop-agentic-h5';
export const DB_VERSION = 2;
export const STORE_JOBS = 'jobs';
export const STORE_ASSETS = 'assets';
export const STORE_PROJECTS = 'projects';
export const STORE_PLATFORM_JOBS = 'platform_jobs';

export function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      const oldVersion = event.oldVersion;

      if (!db.objectStoreNames.contains(STORE_JOBS)) {
        db.createObjectStore(STORE_JOBS, { keyPath: 'jobId' });
      }
      if (!db.objectStoreNames.contains(STORE_ASSETS)) {
        db.createObjectStore(STORE_ASSETS, { keyPath: 'key' });
      }
      if (oldVersion < 2) {
        if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
          db.createObjectStore(STORE_PROJECTS, { keyPath: 'projectId' });
        }
        if (!db.objectStoreNames.contains(STORE_PLATFORM_JOBS)) {
          const store = db.createObjectStore(STORE_PLATFORM_JOBS, { keyPath: 'id' });
          store.createIndex('projectId', 'projectId', { unique: false });
          store.createIndex('platformJobId', 'platformJobId', { unique: false });
        }
      }
    };
  });
}

function assetKey(jobId: string, assetId: string): string {
  return `${jobId}/${assetId}`;
}

export async function upsertJobMeta(meta: TaskFolderMeta): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_JOBS, 'readwrite');
    tx.objectStore(STORE_JOBS).put(meta);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function getJobMeta(jobId: string): Promise<TaskFolderMeta | null> {
  const db = await openDb();
  const meta = await new Promise<TaskFolderMeta | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_JOBS, 'readonly');
    const req = tx.objectStore(STORE_JOBS).get(jobId);
    req.onsuccess = () => resolve(req.result as TaskFolderMeta | undefined);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return meta ?? null;
}

export async function listJobMetas(): Promise<TaskFolderMeta[]> {
  const db = await openDb();
  const list = await new Promise<TaskFolderMeta[]>((resolve, reject) => {
    const tx = db.transaction(STORE_JOBS, 'readonly');
    const req = tx.objectStore(STORE_JOBS).getAll();
    req.onsuccess = () => resolve((req.result as TaskFolderMeta[]) ?? []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function putAssetBlob(
  jobId: string,
  assetId: string,
  meta: Omit<StoredAsset, 'jobId' | 'assetId'>,
  blob: Blob
): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_ASSETS, 'readwrite');
    tx.objectStore(STORE_ASSETS).put({
      key: assetKey(jobId, assetId),
      meta: { jobId, assetId, ...meta },
      blob,
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function listAssetsForJob(jobId: string): Promise<Array<StoredAsset & { blob: Blob }>> {
  const db = await openDb();
  const prefix = `${jobId}/`;
  const all = await new Promise<Array<{ key: string; meta: StoredAsset; blob: Blob }>>(
    (resolve, reject) => {
      const tx = db.transaction(STORE_ASSETS, 'readonly');
      const req = tx.objectStore(STORE_ASSETS).getAll();
      req.onsuccess = () =>
        resolve(
          (req.result as Array<{ key: string; meta: StoredAsset; blob: Blob }> | undefined) ?? []
        );
      req.onerror = () => reject(req.error);
    }
  );
  db.close();
  return all
    .filter((r) => r.key.startsWith(prefix))
    .map((r) => ({ ...r.meta, blob: r.blob }))
    .sort((a, b) => a.assetId.localeCompare(b.assetId));
}

export async function deleteTaskFolder(jobId: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE_JOBS, STORE_ASSETS], 'readwrite');
    tx.objectStore(STORE_JOBS).delete(jobId);
    const assetStore = tx.objectStore(STORE_ASSETS);
    const req = assetStore.getAllKeys();
    req.onsuccess = () => {
      const keys = (req.result as string[]).filter((k) => k.startsWith(`${jobId}/`));
      for (const k of keys) assetStore.delete(k);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/** @deprecated 仅 v1 迁移读取；新逻辑请用 patchPlatformJobFromJobStatus */
export async function patchJobFromStatus(job: JobStatus): Promise<void> {
  const existing = await getJobMeta(job.jobId);
  const meta: TaskFolderMeta = {
    jobId: job.jobId,
    slug: job.slug,
    title: job.title,
    displayName: job.displayName ?? existing?.displayName,
    kind: existing?.kind ?? 'task_v2',
    status: job.status,
    progress: job.progress,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    outputGrid: job.outputGrid ?? existing?.outputGrid,
    error: job.error,
    children: job.children?.map((c) => ({
      id: c.id,
      label: c.label,
      status: c.status,
      progress: c.progress,
    })),
    assetCount: Math.max(job.results?.length ?? 0, existing?.assetCount ?? 0),
  };
  await upsertJobMeta(meta);
}
