'use client';

import { listAssetsForJob, listJobMetas } from './db';
import { getCachedBlobUrl } from './sync';

export type HistoricalImageResource = {
  key: string;
  jobId: string;
  assetId: string;
  jobTitle: string;
  label?: string;
  /** 缩略图（blob URL） */
  previewUrl: string;
  /** 提交表单用：优先平台 remoteUrl，否则 blob URL */
  content: string;
  createdAt: string;
  /** 由本函数创建的 blob URL，关闭选择器时需 revoke */
  previewOwned?: boolean;
};

/** 列出本机任务目录中已归档的图片成片（历史资源） */
export async function listHistoricalImageResources(): Promise<HistoricalImageResource[]> {
  const jobs = await listJobMetas();
  const items: HistoricalImageResource[] = [];

  for (const job of jobs) {
    const assets = await listAssetsForJob(job.jobId);
    for (const a of assets) {
      if (a.type !== 'image') continue;
      const cached = getCachedBlobUrl(job.jobId, a.assetId);
      const previewOwned = !cached;
      const previewUrl = cached ?? URL.createObjectURL(a.blob);
      const remote = a.remoteUrl?.trim();
      items.push({
        key: `${job.jobId}/${a.assetId}`,
        jobId: job.jobId,
        assetId: a.assetId,
        jobTitle: job.title,
        label: a.label ?? a.gridCell,
        previewUrl,
        content: remote || previewUrl,
        createdAt: a.createdAt || job.createdAt,
        previewOwned,
      });
    }
  }

  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function revokeHistoricalPreviews(items: HistoricalImageResource[]): void {
  for (const it of items) {
    if (it.previewOwned && it.previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(it.previewUrl);
    }
  }
}
