/**
 * 任务列表轻量响应：省略 result 媒体与 requestParams 大字段，详情仍走 GET /api/v2/tasks/:id
 */

const MAX_LIST_TEXT_LEN = 80;
const MAX_OUTPUT_PREVIEW_LEN = 160;
const LARGE_STRING_THRESHOLD = 256;

const LIST_TEXT_PARAM_KEYS = new Set([
  'source_material',
  'source_text',
  'text',
  'prompt',
  'script',
  'lyrics',
  'content',
  'description',
  'negative_prompt',
]);

function truncateForList(value: string, max = MAX_LIST_TEXT_LEN): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}…`;
}

function isLargeString(value: unknown): boolean {
  return typeof value === 'string' && value.length > LARGE_STRING_THRESHOLD;
}

function pruneParamsObject(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (key === 'metadata' && value && typeof value === 'object' && !Array.isArray(value)) {
      const meta = value as Record<string, unknown>;
      const pruned: Record<string, unknown> = {};
      if (typeof meta.label === 'string' && meta.label.trim()) {
        pruned.label = meta.label.trim();
      }
      if (Object.keys(pruned).length > 0) out.metadata = pruned;
      continue;
    }

    if (key === 'source_material' || key === 'source_ref') {
      continue;
    }

    if (LIST_TEXT_PARAM_KEYS.has(key) && typeof value === 'string') {
      out[key] = truncateForList(value);
      continue;
    }

    if ((key === 'storage_form' || key === 'format' || key === 'output_format') && typeof value === 'string') {
      const fmt = value.trim().toLowerCase();
      if (fmt && fmt.length <= 16) out[key] = fmt;
      continue;
    }

    if (isLargeString(value)) {
      out[key] = truncateForList(value);
      continue;
    }

    if (Array.isArray(value)) {
      if (value.some((item) => isLargeString(item))) continue;
      if (value.length > 0 && value.length <= 8) out[key] = value;
      continue;
    }

    if (value && typeof value === 'object') {
      const nested = pruneParamsObject(value as Record<string, unknown>);
      if (Object.keys(nested).length > 0) out[key] = nested;
      continue;
    }

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
    }
  }

  return out;
}

/** 列表接口用：仅保留展示标题/子类型所需字段 */
export function pruneRequestParamsForListView(requestParams: unknown): unknown {
  if (!requestParams || typeof requestParams !== 'object') return requestParams;

  const rp = requestParams as Record<string, unknown>;
  const pruned: Record<string, unknown> = {};

  for (const key of ['graphType', 'taskKey', 'subtype', 'scope'] as const) {
    const value = rp[key];
    if (typeof value === 'string' && value.trim()) pruned[key] = value.trim();
  }

  if (rp.metadata && typeof rp.metadata === 'object' && !Array.isArray(rp.metadata)) {
    const meta = rp.metadata as Record<string, unknown>;
    if (typeof meta.label === 'string' && meta.label.trim()) {
      pruned.metadata = { label: meta.label.trim() };
    }
  }

  if (rp.params && typeof rp.params === 'object' && !Array.isArray(rp.params)) {
    pruned.params = pruneParamsObject(rp.params as Record<string, unknown>);
  }

  const clipPreviewSummary = extractAutocutClipPreviewSummary(requestParams);
  if (clipPreviewSummary.length > 0) {
    pruned.businessPipelineState = { clipPreviewSummary };
  }

  return pruned;
}

export type AutocutClipPreviewSummaryItem = {
  clipId: string;
  kind: 'video' | 'image';
  url: string;
  label?: string;
  childTaskId?: string;
};

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * 从自动剪辑父任务 requestParams 提取轻量片段预览（供列表卡片展示，避免下发完整 OpenReel JSON）
 */
export function extractAutocutClipPreviewSummary(
  requestParams: unknown,
  maxItems = 8
): AutocutClipPreviewSummaryItem[] {
  const rp = readRecord(requestParams);
  if (!rp) return [];

  const rootBps = readRecord(rp.businessPipelineState);
  let script = readRecord(rootBps?.videoEditScriptJson);
  if (!script) {
    const inner = readRecord(rp.params);
    const innerBps = readRecord(inner?.businessPipelineState);
    script = readRecord(innerBps?.videoEditScriptJson);
  }
  // 已裁剪的列表摘要可直接回传
  const existing = rootBps?.clipPreviewSummary;
  if (!script && Array.isArray(existing)) {
    return existing
      .map((item) => {
        const o = readRecord(item);
        if (!o) return null;
        const clipId = typeof o.clipId === 'string' ? o.clipId : '';
        const kind = o.kind === 'image' || o.kind === 'video' ? o.kind : null;
        const url = typeof o.url === 'string' ? o.url.trim() : '';
        if (!clipId || !kind || !url) return null;
        return {
          clipId,
          kind,
          url,
          ...(typeof o.label === 'string' ? { label: o.label } : {}),
          ...(typeof o.childTaskId === 'string' ? { childTaskId: o.childTaskId } : {}),
        } satisfies AutocutClipPreviewSummaryItem;
      })
      .filter((x): x is AutocutClipPreviewSummaryItem => Boolean(x))
      .slice(0, maxItems);
  }
  if (!script) return [];

  const project = readRecord(script.project);
  const timeline = readRecord(project?.timeline);
  const tracks = Array.isArray(timeline?.tracks) ? timeline.tracks : [];
  const out: AutocutClipPreviewSummaryItem[] = [];
  let index = 0;

  for (const trackRaw of tracks) {
    if (out.length >= maxItems) break;
    const track = readRecord(trackRaw);
    const clips = Array.isArray(track?.clips) ? track.clips : [];
    for (const clipRaw of clips) {
      if (out.length >= maxItems) break;
      const clip = readRecord(clipRaw);
      if (!clip) continue;
      const clipId = typeof clip.id === 'string' ? clip.id : `clip-${index}`;
      const meta = readRecord(clip.metadata) ?? {};
      const renderMode = typeof meta.mxmRenderMode === 'string' ? meta.mxmRenderMode : '';
      if (!renderMode) continue;

      const childTaskId =
        typeof meta.mxmAiGenTaskId === 'string' && meta.mxmAiGenTaskId.trim()
          ? meta.mxmAiGenTaskId.trim()
          : undefined;
      const renderedVideo =
        typeof meta.mxmRenderedVideoUrl === 'string' ? meta.mxmRenderedVideoUrl.trim() : '';
      const aiImage =
        typeof meta.mxmAiGeneratedImageUrl === 'string'
          ? meta.mxmAiGeneratedImageUrl.trim()
          : typeof meta.mxmSourceImageUrl === 'string'
            ? meta.mxmSourceImageUrl.trim()
            : '';
      const prompt =
        (typeof meta.mxmVideoPrompt === 'string' && meta.mxmVideoPrompt.trim()) ||
        (typeof meta.mxmImagePrompt === 'string' && meta.mxmImagePrompt.trim()) ||
        (typeof meta.mxmPrompt === 'string' && meta.mxmPrompt.trim()) ||
        '';
      const albumTitle =
        typeof meta.albumTitle === 'string'
          ? meta.albumTitle.trim()
          : meta.albumResult &&
              typeof meta.albumResult === 'object' &&
              typeof (meta.albumResult as { title?: unknown }).title === 'string'
            ? String((meta.albumResult as { title: string }).title).trim()
            : '';
      const albumCount =
        typeof meta.albumItemCount === 'number'
          ? meta.albumItemCount
          : meta.albumResult &&
              typeof meta.albumResult === 'object' &&
              typeof (meta.albumResult as { itemCount?: unknown }).itemCount === 'number'
            ? Number((meta.albumResult as { itemCount: number }).itemCount)
            : 0;
      const label = albumTitle
        ? truncateForList(
            albumCount > 0 ? `${albumTitle} · ${albumCount}张` : albumTitle,
            40
          )
        : prompt
          ? truncateForList(prompt, 40)
          : meta.mxmAiOutputKind === 'image'
            ? `AI配图 · ${index + 1}`
            : meta.resultKind === 'image-album'
              ? `内容配图图集 · ${index + 1}`
              : `AI视频 · ${index + 1}`;

      const isAiClip =
        renderMode === 'ai-video-gen' || Boolean(meta.mxmAiOutputKind) || Boolean(childTaskId);

      if (renderedVideo && (isAiClip || meta.mxmRenderStatus === 'ready')) {
        out.push({
          clipId,
          kind: 'video',
          url: renderedVideo,
          label,
          ...(childTaskId ? { childTaskId } : {}),
        });
        index += 1;
        continue;
      }

      if (aiImage && (isAiClip || renderMode === 'static-image')) {
        out.push({
          clipId,
          kind: 'image',
          url: aiImage,
          label,
          ...(childTaskId ? { childTaskId } : {}),
        });
        index += 1;
      }
    }
  }

  return out;
}

/** 从 result 提取列表卡片用的输出摘要（不含 input prompt） */
export function extractContentPreviewFromResult(result: unknown): string {
  if (!result || typeof result !== 'object') return '';

  const r = result as Record<string, unknown>;
  const metadata = r.metadata;
  const meta =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : null;

  // writing-collection：用篇目标题/导语，绝不回退到策划 JSON
  if (meta?.resultKind === 'writing-collection') {
    const fromCollection = previewFromWritingCollection(meta);
    if (fromCollection) return fromCollection;
  }

  const topText = typeof r.text === 'string' ? r.text.trim() : '';
  if (topText && !looksLikePlanningJson(topText)) {
    return truncateForList(topText, MAX_OUTPUT_PREVIEW_LEN);
  }

  if (!meta) return '';

  const text = typeof meta.text === 'string' ? meta.text.trim() : '';
  if (text && !looksLikePlanningJson(text)) {
    return truncateForList(text, MAX_OUTPUT_PREVIEW_LEN);
  }

  const fromCollectionFallback = previewFromWritingCollection(meta);
  if (fromCollectionFallback) return fromCollectionFallback;

  const formatted = typeof meta.formattedContent === 'string' ? meta.formattedContent.trim() : '';
  if (formatted && formatted.length <= LARGE_STRING_THRESHOLD && !formatted.startsWith('JVBERi')) {
    return truncateForList(formatted, MAX_OUTPUT_PREVIEW_LEN);
  }

  const outline = meta.outline;
  if (typeof outline === 'string' && outline.trim()) {
    return truncateForList(outline, MAX_OUTPUT_PREVIEW_LEN);
  }
  if (outline && typeof outline === 'object' && !Array.isArray(outline)) {
    const o = outline as Record<string, unknown>;
    const title = typeof o.title === 'string' ? o.title.trim() : '';
    if (title) return truncateForList(title, MAX_OUTPUT_PREVIEW_LEN);
    const sections = o.sections ?? o.chapters;
    if (Array.isArray(sections) && sections.length > 0) {
      const first = sections[0];
      if (typeof first === 'string' && first.trim()) {
        return truncateForList(first, MAX_OUTPUT_PREVIEW_LEN);
      }
      if (first && typeof first === 'object' && !Array.isArray(first)) {
        const heading =
          (first as Record<string, unknown>).title ?? (first as Record<string, unknown>).heading;
        if (typeof heading === 'string' && heading.trim()) {
          return truncateForList(heading, MAX_OUTPUT_PREVIEW_LEN);
        }
      }
    }
  }

  return '';
}

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

function previewFromWritingCollection(meta: Record<string, unknown>): string {
  const title =
    typeof meta.collectionTitle === 'string' ? meta.collectionTitle.trim() : '';
  const collection = meta.collectionResult;
  const items =
    collection && typeof collection === 'object' && !Array.isArray(collection)
      ? (collection as { items?: unknown }).items
      : null;
  if (!Array.isArray(items) || items.length === 0) {
    if (title) {
      const n =
        typeof meta.collectionReadyCount === 'number'
          ? meta.collectionReadyCount
          : typeof meta.collectionItemCount === 'number'
            ? meta.collectionItemCount
            : 0;
      return truncateForList(
        n > 0 ? `「${title}」· ${n} 路探索稿` : `「${title}」探索集合`,
        MAX_OUTPUT_PREVIEW_LEN
      );
    }
    return '';
  }

  const lines: string[] = [];
  if (title) lines.push(`「${title}」`);
  for (let i = 0; i < Math.min(items.length, 4); i++) {
    const it = items[i];
    if (!it || typeof it !== 'object') continue;
    const o = it as Record<string, unknown>;
    const name = typeof o.name === 'string' ? o.name.trim() : '';
    const pieceTitle = typeof o.title === 'string' ? o.title.trim() : '';
    const label = name || pieceTitle;
    if (!label) continue;
    lines.push(`${i + 1}. ${label}`);
  }
  return truncateForList(lines.join('\n'), MAX_OUTPUT_PREVIEW_LEN);
}

export type WritingOutputFormat = 'pdf' | 'markdown' | 'json' | 'txt' | 'csv';

const KNOWN_OUTPUT_FORMATS = new Set<string>(['pdf', 'markdown', 'json', 'txt', 'csv', 'md']);

function normalizeOutputFormat(raw: unknown): WritingOutputFormat | undefined {
  if (typeof raw !== 'string') return undefined;
  const s = raw.trim().toLowerCase();
  if (s === 'md') return 'markdown';
  if (KNOWN_OUTPUT_FORMATS.has(s) && s !== 'md') return s as WritingOutputFormat;
  return undefined;
}

function formatFromStorageKey(key: unknown): WritingOutputFormat | undefined {
  if (typeof key !== 'string') return undefined;
  const lower = key.toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'markdown';
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.txt')) return 'txt';
  if (lower.endsWith('.csv')) return 'csv';
  return undefined;
}

/** 列表卡片用：从 result 推断输出文档格式 */
export function extractOutputFormatFromResult(result: unknown): WritingOutputFormat | undefined {
  if (!result || typeof result !== 'object') return undefined;

  const r = result as Record<string, unknown>;

  const existing = normalizeOutputFormat(r.outputFormat) ?? normalizeOutputFormat(r.format);
  if (existing) return existing;

  const metadata = r.metadata;
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const meta = metadata as Record<string, unknown>;
    // 阅读态优先：sidecar PDF 成功时列表展示 PDF
    const reading = normalizeOutputFormat(meta.reading_format);
    if (reading === 'pdf' && meta.pdfRenderStatus !== 'failed') return 'pdf';
    const fromMeta =
      normalizeOutputFormat(meta.format) ??
      normalizeOutputFormat(meta.storage_form) ??
      normalizeOutputFormat(meta.storageForm);
    if (fromMeta) return fromMeta;
    if (meta.outline != null) return 'json';
  }

  const storageInfo = r.storageInfo;
  if (storageInfo && typeof storageInfo === 'object' && !Array.isArray(storageInfo)) {
    const si = storageInfo as Record<string, unknown>;
    const keys = si.keys;
    if (Array.isArray(keys)) {
      for (const key of keys) {
        const fromKey = formatFromStorageKey(key);
        if (fromKey) return fromKey;
      }
    }
    const fromSingleKey = formatFromStorageKey(si.key);
    if (fromSingleKey) return fromSingleKey;
  }

  const mediaUrls = r.mediaUrls;
  if (Array.isArray(mediaUrls)) {
    for (const url of mediaUrls) {
      const fromUrl = formatFromStorageKey(typeof url === 'string' ? url.split('?')[0] : undefined);
      if (fromUrl) return fromUrl;
    }
  }

  return undefined;
}

/** 列表接口用：不返回 mediaUrls / storageInfo / 大 metadata，保留输出摘要与格式；图集保留失败计数供 UI */
export function pruneTaskResultForListView(result: unknown): Record<string, unknown> | undefined {
  if (!result || typeof result !== 'object') return undefined;

  const r = result as Record<string, unknown>;
  const mediaUrls = r.mediaUrls;
  const storageInfo =
    r.storageInfo && typeof r.storageInfo === 'object'
      ? (r.storageInfo as { keys?: unknown; urls?: unknown })
      : null;
  const storageKeyCount = Array.isArray(storageInfo?.keys) ? storageInfo!.keys!.length : 0;
  const storageUrlCount = Array.isArray(storageInfo?.urls) ? storageInfo!.urls!.length : 0;
  const urlCount = Array.isArray(mediaUrls) ? mediaUrls.length : 0;
  const declaredCount = typeof r.mediaCount === 'number' ? r.mediaCount : 0;
  const mediaCount = Math.max(urlCount, declaredCount, storageKeyCount, storageUrlCount);
  const contentPreviewRaw = extractContentPreviewFromResult(result);
  const meta = (r.metadata && typeof r.metadata === 'object' ? r.metadata : null) as Record<
    string,
    unknown
  > | null;
  const cachedPreview =
    typeof r.contentPreview === 'string' && r.contentPreview.trim()
      ? r.contentPreview.trim()
      : '';
  // 旧任务可能把策划 JSON 缓存进 listContentPreview；文集优先现算摘要
  const contentPreview =
    meta?.resultKind === 'writing-collection'
      ? contentPreviewRaw ||
        (cachedPreview && !looksLikePlanningJson(cachedPreview) ? cachedPreview : undefined)
      : (cachedPreview && !looksLikePlanningJson(cachedPreview) ? cachedPreview : undefined) ||
        contentPreviewRaw ||
        undefined;
  const outputFormat = extractOutputFormatFromResult(result);
  const albumFailedCount =
    typeof meta?.albumFailedCount === 'number' ? meta.albumFailedCount : undefined;
  const albumReadyCount =
    typeof meta?.albumReadyCount === 'number' ? meta.albumReadyCount : undefined;
  const collectionReadyCount =
    typeof meta?.collectionReadyCount === 'number' ? meta.collectionReadyCount : undefined;
  const collectionFailedCount =
    typeof meta?.collectionFailedCount === 'number' ? meta.collectionFailedCount : undefined;
  const collectionItemCount =
    typeof meta?.collectionItemCount === 'number' ? meta.collectionItemCount : undefined;
  const collectionTitle =
    typeof meta?.collectionTitle === 'string' ? meta.collectionTitle.trim() : undefined;
  const resultKind = typeof meta?.resultKind === 'string' ? meta.resultKind : undefined;
  const collectionTeasers = buildCollectionTeasers(meta);
  const pdfRenderStatus =
    typeof meta?.pdfRenderStatus === 'string' ? meta.pdfRenderStatus : undefined;
  const pdfRenderError =
    typeof meta?.pdfRenderError === 'string' ? meta.pdfRenderError : undefined;
  const readingFormat =
    typeof meta?.reading_format === 'string' ? meta.reading_format : undefined;
  const presentationRenderStatus =
    typeof meta?.presentationRenderStatus === 'string'
      ? meta.presentationRenderStatus
      : undefined;
  const presentationSlideCount =
    typeof meta?.presentationSlideCount === 'number' ? meta.presentationSlideCount : undefined;
  const warnings = Array.isArray(meta?.warnings)
    ? meta!.warnings!.filter((w): w is string => typeof w === 'string').slice(0, 5)
    : undefined;
  const hasPdfPreview = Boolean(
    meta?.pdfStorage &&
      typeof meta.pdfStorage === 'object' &&
      typeof (meta.pdfStorage as { key?: unknown }).key === 'string'
  );
  const presentationStorage =
    meta?.presentationStorage &&
    typeof meta.presentationStorage === 'object' &&
    !Array.isArray(meta.presentationStorage) &&
    typeof (meta.presentationStorage as { key?: unknown }).key === 'string'
      ? {
          key: String((meta.presentationStorage as { key: string }).key),
          bucket:
            typeof (meta.presentationStorage as { bucket?: unknown }).bucket === 'string'
              ? String((meta.presentationStorage as { bucket: string }).bucket)
              : undefined,
          url:
            typeof (meta.presentationStorage as { url?: unknown }).url === 'string'
              ? String((meta.presentationStorage as { url: string }).url)
              : undefined,
        }
      : undefined;
  const hasPresentationPreview = Boolean(presentationStorage?.key);

  return {
    hasMedia: typeof r.hasMedia === 'boolean' ? r.hasMedia : mediaCount > 0,
    mediaCount,
    ...(contentPreview ? { contentPreview } : {}),
    ...(outputFormat ? { outputFormat } : {}),
    ...((albumFailedCount != null ||
    albumReadyCount != null ||
    collectionReadyCount != null ||
    collectionFailedCount != null ||
    collectionItemCount != null ||
    collectionTitle ||
    collectionTeasers ||
    resultKind ||
    pdfRenderStatus ||
    presentationRenderStatus ||
    presentationSlideCount != null ||
    readingFormat ||
    warnings ||
    hasPdfPreview ||
    hasPresentationPreview)
      ? {
          metadata: {
            ...(resultKind ? { resultKind } : {}),
            ...(albumReadyCount != null ? { albumReadyCount } : {}),
            ...(albumFailedCount != null ? { albumFailedCount } : {}),
            ...(collectionTitle ? { collectionTitle } : {}),
            ...(collectionItemCount != null ? { collectionItemCount } : {}),
            ...(collectionReadyCount != null ? { collectionReadyCount } : {}),
            ...(collectionFailedCount != null ? { collectionFailedCount } : {}),
            ...(collectionTeasers ? { collectionTeasers } : {}),
            ...(pdfRenderStatus ? { pdfRenderStatus } : {}),
            ...(pdfRenderError ? { pdfRenderError } : {}),
            ...(presentationRenderStatus ? { presentationRenderStatus } : {}),
            ...(presentationSlideCount != null ? { presentationSlideCount } : {}),
            ...(presentationStorage ? { presentationStorage } : {}),
            ...(readingFormat ? { reading_format: readingFormat } : {}),
            ...(warnings?.length ? { warnings } : {}),
            ...(hasPdfPreview ? { hasPdfPreview: true } : {}),
            ...(hasPresentationPreview ? { hasPresentationPreview: true } : {}),
          },
        }
      : {}),
  };
}

function buildCollectionTeasers(
  meta: Record<string, unknown> | null
): Array<{ id: string; name?: string; title: string; angle?: string; textPreview?: string }> | undefined {
  if (!meta) return undefined;
  const collection = meta.collectionResult;
  const items =
    collection && typeof collection === 'object' && !Array.isArray(collection)
      ? (collection as { items?: unknown }).items
      : null;
  if (!Array.isArray(items) || items.length === 0) return undefined;
  // writing-collection / presentation-deck 都可出页/篇 teasers；其它仅多篇时
  if (
    meta.resultKind !== 'writing-collection' &&
    meta.resultKind !== 'presentation-deck' &&
    items.length < 2
  ) {
    return undefined;
  }
  const out: Array<{
    id: string;
    name?: string;
    title: string;
    angle?: string;
    textPreview?: string;
  }> = [];
  for (let i = 0; i < Math.min(items.length, 10); i++) {
    const it = items[i];
    if (!it || typeof it !== 'object') continue;
    const o = it as Record<string, unknown>;
    const title = typeof o.title === 'string' ? o.title.trim() : '';
    const name = typeof o.name === 'string' ? o.name.trim() : '';
    if (!title && !name) continue;
    out.push({
      id: String(o.id ?? `v${i + 1}`),
      ...(name ? { name } : {}),
      title: title || name,
      ...(typeof o.angle === 'string' && o.angle.trim() ? { angle: o.angle.trim() } : {}),
      ...(typeof o.textPreview === 'string' && o.textPreview.trim()
        ? { textPreview: o.textPreview.trim().slice(0, 120) }
        : {}),
    });
  }
  return out.length ? out : undefined;
}

export function toTaskListSummary<T extends Record<string, unknown>>(task: T): T {
  return {
    ...task,
    result: task.result ? pruneTaskResultForListView(task.result) : undefined,
    requestParams: pruneRequestParamsForListView(task.requestParams),
  };
}
