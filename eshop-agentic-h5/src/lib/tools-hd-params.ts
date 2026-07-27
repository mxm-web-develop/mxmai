import type { JobResultItem } from '@/adapters/types';
import { isGridShootSlug } from '@/catalog/grid-shoot-lines';
import { resolveOutputGridForJob } from '@/lib/grid-cell';
import { graphTaskMediaPath } from '@/lib/media-url';

/** 与 mxmcgi graph-tools-hd 一致 */
export const HD_GRID_LAYOUTS = ['2x2', '3x3', '4x4'] as const;
export type HdGridLayout = (typeof HD_GRID_LAYOUTS)[number];

export const HD_ASPECT_RATIO_OPTIONS = [
  { value: '', label: '保持原图比例' },
  { value: '1:1', label: '1:1' },
  { value: '3:4', label: '3:4' },
  { value: '4:3', label: '4:3' },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
] as const;

export type HdParentJobContext = {
  sourceGraphTaskId: string;
  outputGrid?: string;
  sourceSlug?: string;
  results?: JobResultItem[];
};

/** 提交模式：已裁格单图直放 / 联系表裁格放大 / 普通单图 */
export type HdSubmitMode = 'split-cell' | 'contact-sheet' | 'single';

export type ToolsHdRunParams = {
  source_images: Array<{ content: string; type: 'main-subject' }>;
  is_grid: boolean;
  grid_layout?: HdGridLayout;
  grid_cell?: string;
  source_graph_task_id?: string;
  aspect_ratio?: string;
};

const GRAPH_MEDIA_TASK_ID_RE = /\/(?:api\/v1\/)?media\/graph\/([^/?#]+)/i;

/** 从 Gateway 媒体代理 URL 解析 Graph 任务 ID（与 mxmcgi graph-tools-hd-image-io 一致） */
export function parseGraphMediaTaskIdFromUrl(url: string): string | null {
  const m = String(url).trim().match(GRAPH_MEDIA_TASK_ID_RE);
  if (!m?.[1]) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

export function isHdGridLayout(v: string | undefined): v is HdGridLayout {
  return Boolean(v && (HD_GRID_LAYOUTS as readonly string[]).includes(v));
}

export function inferHdGridLayoutForJob(ctx: HdParentJobContext): HdGridLayout {
  const fromJob = resolveOutputGridForJob(
    { outputGrid: ctx.outputGrid, results: ctx.results },
    ctx.sourceSlug ?? ''
  );
  if (fromJob && isHdGridLayout(fromJob)) return fromJob;

  const cells = ctx.results?.filter((r) => r.isGridCell && r.type === 'image') ?? [];
  if (cells.length >= 16) return '4x4';
  if (cells.length >= 9) return '3x3';
  if (cells.length >= 4) return '2x2';
  if (ctx.sourceSlug && isGridShootSlug(ctx.sourceSlug)) return '3x3';
  return '3x3';
}

function pickFetchableUrl(...candidates: (string | undefined)[]): string {
  for (const c of candidates) {
    const t = c?.trim();
    if (!t) continue;
    if (
      t.startsWith('data:') ||
      t.startsWith('http://') ||
      t.startsWith('https://') ||
      t.startsWith('/api/') ||
      t.startsWith('blob:')
    ) {
      return t;
    }
  }
  return '';
}

function hasSplitGridCells(ctx: HdParentJobContext): boolean {
  const cells = ctx.results?.filter((r) => r.isGridCell && r.type === 'image') ?? [];
  return cells.length >= 4;
}

function isContactSheetOnlyResults(results: JobResultItem[]): boolean {
  const images = results.filter((r) => r.type === 'image');
  if (images.length <= 1) return true;
  const keys = new Set(
    images.map((i) => (i.gridSourceUrl ?? i.remoteUrl ?? i.url ?? '').trim()).filter(Boolean)
  );
  return keys.size <= 1;
}

function resolveMultiGridLayout(parent: HdParentJobContext): HdGridLayout | undefined {
  const layout = resolveOutputGridForJob(
    { outputGrid: parent.outputGrid, results: parent.results },
    parent.sourceSlug ?? ''
  );
  return layout && isHdGridLayout(layout) ? layout : undefined;
}

/** 解析 HD 应读取的 Graph 任务 ID（批量子任务优先于 root） */
export function resolveHdSourceGraphTaskId(
  parent: HdParentJobContext,
  item: JobResultItem
): string {
  const urls = [
    item.gridSourceUrl,
    item.remoteUrl,
    item.url,
    ...(parent.results?.flatMap((r) => [r.gridSourceUrl, r.remoteUrl, r.url]) ?? []),
  ];
  for (const u of urls) {
    const id = parseGraphMediaTaskIdFromUrl(String(u ?? ''));
    if (id) return id;
  }
  return parent.sourceGraphTaskId?.trim() ?? '';
}

/**
 * Open API 提交用媒体引用：相对 Gateway 代理路径，不带 H5 域名与 token。
 * Worker 可 parse taskId 后直读 MinIO，避免 fetch H5 副机 URL 失败。
 */
export function toOpenApiSubmitMediaRef(url: string, fallbackTaskId?: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('data:')) return trimmed;

  const fromUrl = parseGraphMediaTaskIdFromUrl(trimmed);
  const taskId = fromUrl ?? fallbackTaskId?.trim();
  if (taskId) return graphTaskMediaPath(taskId);

  if (trimmed.startsWith('/api/v1/media/graph/')) {
    try {
      const u = new URL(trimmed, 'http://localhost');
      u.searchParams.delete('token');
      const qs = u.searchParams.toString();
      return qs ? `${u.pathname}?${qs}` : u.pathname;
    } catch {
      return trimmed.split('?')[0] ?? trimmed;
    }
  }

  if (trimmed.startsWith('/api/')) return trimmed;
  return trimmed;
}

export function resolveHdSubmitMode(
  parent: HdParentJobContext,
  item: JobResultItem,
  gridCell?: string | null
): HdSubmitMode {
  const cell = String(gridCell ?? item.gridCell ?? '').trim();
  const multiGrid = resolveMultiGridLayout(parent);
  const sourceTaskId = resolveHdSourceGraphTaskId(parent, item);

  // 宫格选格：优先联系表模式，由 Worker 从原任务读整图再裁格（避免 base64 被 sanitize / H5 URL fetch 失败）
  if (cell && multiGrid && sourceTaskId) {
    return 'contact-sheet';
  }

  const cellUrl = pickFetchableUrl(item.remoteUrl, item.url, item.localUrl);
  if (
    item.isGridCell &&
    cell &&
    cellUrl &&
    hasSplitGridCells(parent) &&
    !multiGrid &&
    !sourceTaskId &&
    !cellUrl.startsWith('data:')
  ) {
    return 'split-cell';
  }

  const results = parent.results ?? [];
  const needsContact =
    Boolean(cell) ||
    isContactSheetOnlyResults(results) ||
    (parent.sourceSlug && isGridShootSlug(parent.sourceSlug)) ||
    (parent.outputGrid && isHdGridLayout(parent.outputGrid));
  if (needsContact && cell) return 'contact-sheet';
  if (item.isGridCell && cell) return 'contact-sheet';
  return 'single';
}

export function hdModeLabel(mode: HdSubmitMode): string {
  switch (mode) {
    case 'split-cell':
      return '已裁格单图';
    case 'contact-sheet':
      return '联系表选格';
    default:
      return '单图放大';
  }
}

async function blobOrDataUrlToDataUri(src: string): Promise<string> {
  if (src.startsWith('data:')) return src;
  const resp = await fetch(src);
  const blob = await resp.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('读取本地图片失败'));
    reader.readAsDataURL(blob);
  });
}

async function ensureLocalImageContent(url: string): Promise<string> {
  const t = url.trim();
  if (!t) throw new Error('缺少可提交的图片地址');
  if (t.startsWith('blob:')) return blobOrDataUrlToDataUri(t);
  return t;
}

export type BuildToolsHdParamsInput = {
  item: JobResultItem;
  gridCell?: string | null;
  parent: HdParentJobContext;
  mode?: HdSubmitMode;
  aspectRatio?: string;
};

/**
 * 按 graph/tools/hd 最新 formSchema 组装 Open API params。
 * - 宫格选格：is_grid=true + 相对 graph media 路径 + source_graph_task_id（Worker 直读存储）
 * - 已裁格单图（无原任务）：is_grid=false + 可访问 URL
 */
export async function buildToolsHdParams(
  input: BuildToolsHdParamsInput
): Promise<ToolsHdRunParams> {
  const { item, parent } = input;
  const gridCell = String(input.gridCell ?? item.gridCell ?? '').trim();
  const mode = input.mode ?? resolveHdSubmitMode(parent, item, gridCell);
  const aspect =
    input.aspectRatio?.trim() && input.aspectRatio !== ''
      ? input.aspectRatio.trim()
      : undefined;

  const sourceTaskId = resolveHdSourceGraphTaskId(parent, item);

  if (mode === 'contact-sheet') {
    if (!gridCell) throw new Error('请先选择要放大的宫格格位');
    if (!sourceTaskId) {
      throw new Error('缺少原 Graph 任务 ID，无法读取联系表成片');
    }
    const params: ToolsHdRunParams = {
      source_images: [{ content: graphTaskMediaPath(sourceTaskId), type: 'main-subject' }],
      is_grid: true,
      grid_layout: inferHdGridLayoutForJob(parent),
      grid_cell: gridCell,
      source_graph_task_id: sourceTaskId,
    };
    if (aspect) params.aspect_ratio = aspect;
    return params;
  }

  if (mode === 'split-cell') {
    const raw = pickFetchableUrl(item.remoteUrl, item.url, item.localUrl);
    if (!raw) throw new Error('缺少单格成片地址，请重新打开任务详情');
    const proxyTaskId = parseGraphMediaTaskIdFromUrl(raw) ?? sourceTaskId;
    const content = proxyTaskId
      ? graphTaskMediaPath(proxyTaskId)
      : await ensureLocalImageContent(raw);
    const params: ToolsHdRunParams = {
      source_images: [{ content, type: 'main-subject' }],
      is_grid: false,
    };
    if (sourceTaskId) params.source_graph_task_id = sourceTaskId;
    if (aspect) params.aspect_ratio = aspect;
    return params;
  }

  const raw = pickFetchableUrl(item.remoteUrl, item.url, item.gridSourceUrl, item.localUrl);
  if (!raw) throw new Error('缺少待放大图片');
  const proxyTaskId = parseGraphMediaTaskIdFromUrl(raw) ?? sourceTaskId;
  const content = proxyTaskId
    ? graphTaskMediaPath(proxyTaskId)
    : await ensureLocalImageContent(toOpenApiSubmitMediaRef(raw, sourceTaskId));
  const params: ToolsHdRunParams = {
    source_images: [{ content, type: 'main-subject' }],
    is_grid: false,
  };
  if (sourceTaskId) params.source_graph_task_id = sourceTaskId;
  if (aspect) params.aspect_ratio = aspect;
  return params;
}

export function hdContextFromJob(
  job: Pick<{ jobId: string; outputGrid?: string; results?: JobResultItem[]; slug?: string }, 'jobId' | 'outputGrid' | 'results'> & {
    slug?: string;
  },
  slug?: string
): HdParentJobContext {
  return {
    sourceGraphTaskId: job.jobId,
    outputGrid: job.outputGrid,
    sourceSlug: slug ?? job.slug,
    results: job.results,
  };
}
