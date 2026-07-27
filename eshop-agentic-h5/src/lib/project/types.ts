import type { JobStatusType, ServiceKind } from '@/adapters/types';
import type { GridShootLineId } from '@/catalog/grid-shoot-lines';

export type PlatformJobRole = 'shoot' | 'hd' | 'video' | 'smartflow';

export type PlatformJobContext = {
  batchKey?: string;
  gridCell?: string;
  sourcePlatformJobId?: string;
  sourceResultIndex?: number;
};

export type ProjectMeta = {
  projectId: string;
  title: string;
  shootSlug: string;
  lineId?: GridShootLineId;
  outputGrid?: string;
  parallelCount?: number;
  createdAt: string;
  updatedAt: string;
  status: JobStatusType;
  progress: number;
  coverPlatformJobId?: string;
  /** 列表缩略图（本地 blob 或远程 URL） */
  coverUrl?: string;
  rootPlatformJobId: string;
  error?: string;
  /** Partner 终端用户 ID（云端 sync 隔离） */
  endUserId?: string;
};

export type PlatformJobRecord = {
  /** `${slug}::${platformJobId}` */
  id: string;
  platformJobId: string;
  slug: string;
  projectId: string;
  role: PlatformJobRole;
  kind: ServiceKind;
  status: JobStatusType;
  progress: number;
  createdAt: string;
  updatedAt: string;
  assetCount: number;
  context?: PlatformJobContext;
  children?: Array<{ id: string; label: string; status: string; progress: number }>;
  error?: string;
  /** 商拍任务用户命名（仅 role=shoot 时有意义） */
  displayName?: string;
  outputGrid?: string;
  endUserId?: string;
};

export type ProjectListItem = ProjectMeta & {
  assetCount?: number;
};

export function platformJobRecordId(slug: string, platformJobId: string): string {
  return `${slug}::${platformJobId}`;
}
