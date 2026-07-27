import type { JobResultItem, JobStatus, ServiceKind } from '@/adapters/types';

/** 本地任务目录：tasks/{jobId}/ */
export const TASK_FOLDER_ROOT = 'tasks';

export function taskFolderPath(jobId: string): string {
  return `${TASK_FOLDER_ROOT}/${jobId}`;
}

export type TaskFolderMeta = {
  jobId: string;
  slug: string;
  title: string;
  displayName?: string;
  kind: ServiceKind;
  status: JobStatus['status'];
  progress: number;
  createdAt: string;
  updatedAt: string;
  outputGrid?: string;
  error?: string;
  /** 子任务 / 节点标签（批量 SKU、Smartflow 节点名等） */
  children?: Array<{ id: string; label: string; status: string; progress: number }>;
  assetCount: number;
  /** @deprecated v1 迁移用 */
  hiddenInHistory?: boolean;
  /** @deprecated v1 迁移用 */
  derivedFrom?: {
    parentJobId: string;
    parentSlug: string;
    batchKey: string;
    gridCell: string;
  };
};

export type ExtractedMedia = {
  remoteUrl: string;
  type: 'image' | 'video';
  label?: string;
  gridCell?: string;
  isGridCell?: boolean;
  gridSourceUrl?: string;
  /** 来源：parent | child:{id} | smartflow:{field} */
  source?: string;
};

export type StoredAsset = {
  jobId: string;
  assetId: string;
  filename: string;
  mimeType: string;
  type: 'image' | 'video';
  label?: string;
  gridCell?: string;
  isGridCell?: boolean;
  gridSourceUrl?: string;
  remoteUrl?: string;
  source?: string;
  sizeBytes: number;
  createdAt: string;
};

export type TaskFolderView = TaskFolderMeta & {
  results: JobResultItem[];
};
