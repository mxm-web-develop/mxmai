import type { ExtractedMedia } from './types';

const URL_RE = /^https?:\/\//i;

/** 平台 graph 成片常为 Gateway 代理路径，须与 http(s) 一并识别 */
function isExtractableMediaUrl(u: string): boolean {
  return (
    URL_RE.test(u) ||
    u.startsWith('/api/') ||
    u.startsWith('/demo-results/') ||
    u.startsWith('blob:')
  );
}

function pushUrl(
  out: ExtractedMedia[],
  seen: Set<string>,
  url: unknown,
  opts: Partial<ExtractedMedia> = {}
): void {
  if (typeof url !== 'string' || !url.trim()) return;
  const u = url.trim();
  if (!isExtractableMediaUrl(u)) return;
  if (seen.has(u)) return;
  seen.add(u);
  const type: 'image' | 'video' =
    opts.type ??
    (/\.(mp4|webm|mov)(\?|$)/i.test(u) || opts.label?.includes('视频') ? 'video' : 'image');
  out.push({ remoteUrl: u, type, ...opts });
}

function walkObject(
  obj: unknown,
  out: ExtractedMedia[],
  seen: Set<string>,
  sourcePrefix: string,
  depth = 0
): void {
  if (depth > 8 || obj == null) return;
  if (typeof obj === 'string') {
    if (isExtractableMediaUrl(obj.trim())) pushUrl(out, seen, obj, { source: sourcePrefix });
    return;
  }
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => walkObject(item, out, seen, `${sourcePrefix}[${i}]`, depth + 1));
    return;
  }
  if (typeof obj !== 'object') return;

  const rec = obj as Record<string, unknown>;
  if (Array.isArray(rec.mediaUrls)) {
    for (let i = 0; i < rec.mediaUrls.length; i++) {
      pushUrl(out, seen, rec.mediaUrls[i], {
        source: `${sourcePrefix}.mediaUrls[${i}]`,
        label: rec.mediaUrls.length > 1 ? `成片 ${i + 1}` : '成片',
      });
    }
  }
  if (rec.syncResult && typeof rec.syncResult === 'object') {
    walkObject(rec.syncResult, out, seen, `${sourcePrefix}.syncResult`, depth + 1);
  }
  if (rec.result && typeof rec.result === 'object') {
    walkObject(rec.result, out, seen, `${sourcePrefix}.result`, depth + 1);
  }
  if (rec.output_data && typeof rec.output_data === 'object') {
    const od = rec.output_data as Record<string, unknown>;
    for (const [field, val] of Object.entries(od)) {
      if (typeof val === 'string') {
        pushUrl(out, seen, val, {
          source: `smartflow:${field}`,
          label: fieldLabel(field),
          type: field.includes('video') ? 'video' : 'image',
        });
      } else {
        walkObject(val, out, seen, `smartflow:${field}`, depth + 1);
      }
    }
  }
  if (rec.output_mapping && typeof rec.output_mapping === 'object') {
    walkObject(rec.output_mapping, out, seen, `${sourcePrefix}.output_mapping`, depth + 1);
  }

  for (const [k, v] of Object.entries(rec)) {
    if (['mediaUrls', 'syncResult', 'result', 'output_data', 'requestParams', 'metadata'].includes(k)) {
      continue;
    }
    if (k === 'content' && typeof v === 'string' && (URL_RE.test(v) || v.startsWith('/'))) {
      pushUrl(out, seen, v, { source: sourcePrefix });
    }
  }
}

function fieldLabel(field: string): string {
  const map: Record<string, string> = {
    still_image: '上架图',
    showcase_video: '动效短片',
    video: '视频',
    image: '图片',
  };
  return map[field] ?? field;
}

/** 从平台 Open API 原始响应提取所有媒体 URL */
export function extractMediaFromPlatformJob(raw: Record<string, unknown>): ExtractedMedia[] {
  const out: ExtractedMedia[] = [];
  const seen = new Set<string>();
  walkObject(raw, out, seen, 'job');
  if (raw.result) walkObject(raw.result, out, seen, 'result');
  return out;
}

/** 批量父任务：合并子任务响应 */
export function extractMediaFromChildTasks(
  children: Array<{ taskId: string; raw: Record<string, unknown>; label?: string }>
): ExtractedMedia[] {
  const out: ExtractedMedia[] = [];
  const seen = new Set<string>();
  for (const child of children) {
    const items = extractMediaFromPlatformJob(child.raw);
    for (const item of items) {
      pushUrl(out, seen, item.remoteUrl, {
        ...item,
        source: `child:${child.taskId}`,
        label: child.label ? `${child.label} · ${item.label ?? '成片'}` : item.label,
      });
    }
  }
  return out;
}
