import type { WritingTaskItem } from '../../api/client';

const pickStr = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

export type WritingCollectionTeaser = {
  id: string;
  name?: string;
  title: string;
  angle?: string;
  textPreview?: string;
};

function looksLikePlanningJson(text: string): boolean {
  const t = text.trimStart();
  if (!t.startsWith('{') && !t.startsWith('[')) return false;
  return (
    /"variants"\s*:/.test(t) ||
    /"structure_plan"\s*:/.test(t) ||
    /"style_profile"\s*:/.test(t) ||
    /"field_specs"\s*:/.test(t)
  );
}

export function pickWritingCollectionMeta(task: WritingTaskItem): {
  isCollection: boolean;
  title?: string;
  readyCount?: number;
  itemCount?: number;
  teasers: WritingCollectionTeaser[];
} {
  const resultMeta = (task.result?.metadata ?? {}) as Record<string, unknown>;
  const taskMeta = (task.metadata ?? {}) as Record<string, unknown>;
  const meta = { ...taskMeta, ...resultMeta };

  const taskV2 = (meta.taskV2 ?? null) as { taskKey?: string; subtype?: string } | null;
  const isSeekGroup =
    taskV2?.taskKey === 'group' &&
    (taskV2?.subtype === 'seek' || String(taskV2?.subtype ?? '').includes('seek'));

  const readyCount =
    typeof meta.collectionReadyCount === 'number' ? meta.collectionReadyCount : undefined;
  const itemCount =
    typeof meta.collectionItemCount === 'number'
      ? meta.collectionItemCount
      : typeof readyCount === 'number'
        ? readyCount
        : undefined;
  const title =
    typeof meta.collectionTitle === 'string' && meta.collectionTitle.trim()
      ? meta.collectionTitle.trim()
      : undefined;

  const teasersRaw = meta.collectionTeasers;
  const teasers: WritingCollectionTeaser[] = [];
  if (Array.isArray(teasersRaw)) {
    for (let i = 0; i < teasersRaw.length; i++) {
      const it = teasersRaw[i];
      if (!it || typeof it !== 'object') continue;
      const o = it as Record<string, unknown>;
      const pieceTitle = pickStr(o.title) || pickStr(o.name);
      if (!pieceTitle) continue;
      teasers.push({
        id: pickStr(o.id) || `v${i + 1}`,
        name: pickStr(o.name) || undefined,
        title: pieceTitle,
        angle: pickStr(o.angle) || undefined,
        textPreview: pickStr(o.textPreview) || undefined,
      });
    }
  }

  // 详情接口可能有完整 collectionResult
  if (teasers.length === 0) {
    const collection = meta.collectionResult;
    const items =
      collection && typeof collection === 'object' && !Array.isArray(collection)
        ? (collection as { items?: unknown }).items
        : null;
    if (Array.isArray(items)) {
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (!it || typeof it !== 'object') continue;
        const o = it as Record<string, unknown>;
        const pieceTitle = pickStr(o.title) || pickStr(o.name);
        if (!pieceTitle) continue;
        teasers.push({
          id: pickStr(o.id) || `v${i + 1}`,
          name: pickStr(o.name) || undefined,
          title: pieceTitle,
          angle: pickStr(o.angle) || undefined,
          textPreview: pickStr(o.textPreview) || undefined,
        });
      }
    }
  }

  // 从 contentPreview「1. xxx」行兜底抽出篇目（无 teasers 的旧列表）
  if (teasers.length === 0) {
    const preview = pickStr(task.result?.contentPreview);
    if (preview && !looksLikePlanningJson(preview)) {
      for (const line of preview.split(/\n/)) {
        const m = line.trim().match(/^\d+\.\s+(.+)$/);
        if (!m?.[1]) continue;
        teasers.push({
          id: `preview-${teasers.length + 1}`,
          title: m[1].trim(),
        });
      }
    }
  }

  const isCollection =
    meta.resultKind === 'writing-collection' ||
    isSeekGroup ||
    (readyCount != null && readyCount > 1) ||
    teasers.length > 1;

  return {
    isCollection,
    title,
    readyCount: readyCount ?? (teasers.length > 0 ? teasers.length : undefined),
    itemCount: itemCount ?? (teasers.length > 0 ? teasers.length : undefined),
    teasers,
  };
}

export function pickTaskPromptPreview(task: WritingTaskItem, maxLen = 140): string {
  const rp = task.requestParams as Record<string, unknown> | undefined;
  const inner = rp?.params as Record<string, unknown> | undefined;
  const candidates = [
    pickStr(inner?.prompt),
    pickStr(inner?.text),
    pickStr(inner?.source_text),
    pickStr(inner?.source_material),
    pickStr(inner?.lyrics),
    pickStr(rp?.prompt),
  ].filter(Boolean);

  const raw = candidates[0] ?? '';
  if (!raw) return '';
  const oneLine = raw.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= maxLen) return oneLine;
  return `${oneLine.slice(0, maxLen)}…`;
}

/** 写作卡片：展示生成结果摘要（列表 API 的 contentPreview），不回退到 input prompt */
export function pickTaskOutputPreview(task: WritingTaskItem, maxLen = 160): string {
  const raw = pickTaskOutputPreviewRaw(task);
  if (!raw) return '';
  const oneLine = raw.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= maxLen) return oneLine;
  return `${oneLine.slice(0, maxLen)}…`;
}

/** 保留换行的结果预览（供刊头提取 Markdown 标题） */
export function pickTaskOutputPreviewRaw(task: WritingTaskItem, maxLen = 480): string {
  const collection = pickWritingCollectionMeta(task);
  if (collection.isCollection) {
    if (collection.teasers.length > 0) {
      const lines = collection.teasers.slice(0, 4).map((t, i) => {
        const label = t.name || t.title;
        return `${i + 1}. ${label}`;
      });
      const head = collection.title ? `「${collection.title}」` : '';
      const raw = [head, ...lines].filter(Boolean).join('\n');
      if (raw.length <= maxLen) return raw;
      return `${raw.slice(0, maxLen)}…`;
    }
    if (collection.title) {
      const n = collection.readyCount ?? collection.itemCount ?? 0;
      const raw =
        n > 0 ? `「${collection.title}」· ${n} 路探索稿` : `「${collection.title}」探索集合`;
      return raw.length <= maxLen ? raw : `${raw.slice(0, maxLen)}…`;
    }
  }

  const result = task.result as
    | { contentPreview?: string; metadata?: { text?: string } }
    | undefined;

  const fromList = pickStr(result?.contentPreview);
  const fromMeta = pickStr(result?.metadata?.text);
  const raw = [fromList, fromMeta].find((s) => s && !looksLikePlanningJson(s)) ?? '';
  if (!raw) return '';
  if (raw.length <= maxLen) return raw;
  return `${raw.slice(0, maxLen)}…`;
}

/** 从 Markdown 预览提取刊头标题（优先 # / ## 行） */
export function extractMarkdownHeadline(text: string, maxLen = 56): string {
  const raw = pickStr(text);
  if (!raw) return '';
  const lines = raw.split(/\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const heading = line.match(/^#{1,3}\s+(.+)$/);
    if (heading?.[1]) {
      const h = heading[1].replace(/\s+/g, ' ').trim();
      if (h.length <= maxLen) return h;
      return `${h.slice(0, maxLen)}…`;
    }
  }
  // 「话题」集合刊头
  const collectionHead = lines[0]?.match(/^「(.+?)」/);
  if (collectionHead?.[1]) {
    const h = collectionHead[1].trim();
    if (h.length <= maxLen) return h;
    return `${h.slice(0, maxLen)}…`;
  }
  const first = (lines[0] ?? raw).replace(/^#+\s*/, '').replace(/\s+/g, ' ').trim();
  if (!first) return '';
  if (first.length <= maxLen) return first;
  return `${first.slice(0, maxLen)}…`;
}

export function formatTaskCreatedAt(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}
