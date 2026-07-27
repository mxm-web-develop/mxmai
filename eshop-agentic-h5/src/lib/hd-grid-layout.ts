/**
 * @deprecated 请使用 `@/lib/tools-hd-params`；保留 re-export 避免大范围改 import。
 */
export {
  HD_GRID_LAYOUTS,
  type HdGridLayout,
  type HdParentJobContext,
  type HdSubmitMode,
  buildToolsHdParams,
  hdContextFromJob,
  hdModeLabel,
  inferHdGridLayoutForJob,
  resolveHdSubmitMode,
} from '@/lib/tools-hd-params';

import { getOpenApiAdapter } from '@/adapters';
import { PUBLISHED_OPEN_API_SLUGS as S } from '@/catalog/published-slugs';
import type { JobResultItem } from '@/adapters/types';
import { attachPlatformJob } from '@/lib/project/project-lifecycle';
import {
  buildToolsHdParams,
  type HdParentJobContext,
  type HdSubmitMode,
} from '@/lib/tools-hd-params';

export type RunToolsHdInput = {
  item: JobResultItem;
  gridCell?: string | null;
  parent: HdParentJobContext;
  mode?: HdSubmitMode;
  aspectRatio?: string;
  projectId: string;
  rootPlatformJobId: string;
  batchKey: string;
};

export async function runToolsHdFromJob(input: RunToolsHdInput): Promise<{ jobId: string }> {
  const params = await buildToolsHdParams(input);
  const res = await getOpenApiAdapter().run(S.toolsHd, { params });
  await attachPlatformJob({
    projectId: input.projectId,
    platformJobId: res.jobId,
    slug: S.toolsHd,
    role: 'hd',
    context: {
      batchKey: input.batchKey,
      gridCell: String(input.gridCell ?? input.item.gridCell ?? '') || '1-1',
      sourcePlatformJobId: input.rootPlatformJobId,
    },
  });
  return { jobId: res.jobId };
}
