/**
 * tools/hd 落库前：将 source_images 中的 base64 上传为公网 URL，避免 sanitize 后 Worker 只剩占位符。
 */
import { uploadGeneratedTemp } from '../../../storage/generated-temp';
import { loadImageBuffer } from '../../utils/grid-image-io';
import { isUsableReferenceImageContent } from '../../../task/reference-image';
import {
  GRAPH_TOOLS_HD_SUBTYPE,
  GRAPH_TOOLS_HD_TASK_KEY,
} from './graph-tools-hd';

export const HD_SOURCE_TEMP_R2_META = 'hdSourceTempR2Key';

export function isGraphToolsHdRequestParams(params: Record<string, unknown>): boolean {
  const graphType = String(params.graphType ?? '').trim();
  const inner = params.params;
  const subtype = String(
    params.graphBusinessSubtype ??
      (inner && typeof inner === 'object'
        ? (inner as Record<string, unknown>).graphBusinessSubtype
        : '') ??
      ''
  ).trim();
  return graphType === GRAPH_TOOLS_HD_TASK_KEY && subtype === GRAPH_TOOLS_HD_SUBTYPE;
}

function flattenHdParams(params: Record<string, unknown>): Record<string, unknown> {
  const inner = params.params;
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
    return { ...(inner as Record<string, unknown>), ...params };
  }
  return params;
}

function patchSourceImagesContent(params: Record<string, unknown>, url: string): void {
  const apply = (obj: Record<string, unknown>) => {
    const slot = obj.source_images;
    if (!Array.isArray(slot) || !slot[0] || typeof slot[0] !== 'object') return;
    (slot[0] as Record<string, unknown>).content = url;
  };
  apply(params);
  const inner = params.params;
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
    apply(inner as Record<string, unknown>);
  }
}

/**
 * 任务创建落库前调用；返回临时 key 供任务完成后可选清理。
 */
export async function prepareGraphToolsHdForTaskPersist(
  taskId: string,
  requestParams: Record<string, unknown>
): Promise<{ tempR2Key: string; bucket: string } | null> {
  if (!isGraphToolsHdRequestParams(requestParams)) return null;

  const flat = flattenHdParams(requestParams);
  const slot = flat.source_images;
  if (!Array.isArray(slot) || !slot[0] || typeof slot[0] !== 'object') return null;

  const content = String((slot[0] as { content?: string }).content ?? '').trim();
  if (!content || !isUsableReferenceImageContent(content)) return null;
  if (/^https?:\/\//i.test(content)) return null;

  const buf = await loadImageBuffer(content);
  const uploaded = await uploadGeneratedTemp({
    scope: 'hd-grid',
    taskId,
    name: 'source',
    buffer: buf,
    contentType: 'image/jpeg',
    ext: 'jpg',
  });
  patchSourceImagesContent(requestParams, uploaded.url);
  return { tempR2Key: uploaded.key, bucket: uploaded.bucket };
}
