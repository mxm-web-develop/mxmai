/**
 * C 端选题：从发现池翻窗 + 创建任务前按已选话题剪枝 websource。
 * 与 mxmcgi prune-to-selection 语义对齐（web 不依赖 mxmcgi 包）。
 */

export function splitTopicList(raw: unknown): string[] {
  const s = String(raw ?? '').trim();
  if (!s) return [];
  return s
    .split(/[；;\n]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export function pageTopicPool(
  pool: string[],
  pageSize: number,
  pageIndex: number
): { chips: string[]; pageIndex: number; pageCount: number } {
  const size = Math.max(1, Math.min(40, Math.floor(pageSize) || 8));
  const unique = [...new Set(pool.map((t) => t.trim()).filter(Boolean))];
  if (unique.length === 0) return { chips: [], pageIndex: 0, pageCount: 0 };
  const pageCount = Math.max(1, Math.ceil(unique.length / size));
  const idx = ((pageIndex % pageCount) + pageCount) % pageCount;
  const start = idx * size;
  return {
    chips: unique.slice(start, start + size),
    pageIndex: idx,
    pageCount,
  };
}

function extractTopicMatchKeys(topic: string): string[] {
  const keys: string[] = [];
  const t = topic.trim();
  if (!t) return keys;
  for (const m of t.matchAll(/《([^》]+)》/g)) {
    const inner = String(m[1] ?? '').trim();
    if (inner.length >= 2) keys.push(inner);
  }
  for (const m of t.matchAll(/[\u4e00-\u9fff]{2,12}/g)) keys.push(m[0]!);
  for (const m of t.matchAll(/[A-Za-z][A-Za-z0-9.+-]{2,}/g)) keys.push(m[0]!);
  const stop = new Set([
    '本周',
    '今日',
    '最新',
    '引发',
    '热议',
    '公开',
    '评价',
    '电影',
    '电视剧',
    '综艺',
    '中国',
    '年度',
    '总票房',
    '突破',
  ]);
  return [...new Set(keys.map((k) => k.trim()).filter((k) => k.length >= 2 && !stop.has(k)))];
}

function itemMatches(topic: string, title: string, snippet: string): boolean {
  const t = topic.trim();
  if (!t) return false;
  if (title === t) return true;
  if (title.includes(t) || t.includes(title)) return true;
  const hay = `${title}\n${snippet}`.toLowerCase();
  if (hay.includes(t.toLowerCase())) return true;
  const a = title.replace(/…$/u, '').trim();
  const b = t.replace(/…$/u, '').trim();
  if (a && b && (a.includes(b) || b.includes(a))) return true;
  const keys = extractTopicMatchKeys(t);
  if (keys.length === 0) return false;
  const strong = keys.filter((k) => k.length >= 4);
  if (strong.some((k) => hay.includes(k.toLowerCase()))) return true;
  const hits = keys.filter((k) => hay.includes(k.toLowerCase())).length;
  return hits >= 2 || (keys.length === 1 && hits === 1 && keys[0]!.length >= 3);
}

/** 创建任务前：websource 只留与已选话题相关的条目；丢弃 topicPool 等发现池字段 */
export function slimWebsourceForSelectedTopics(
  websource: Record<string, unknown> | null | undefined,
  selectedRaw: unknown
): Record<string, unknown> | null {
  if (!websource || typeof websource !== 'object') return websource ?? null;
  const selected = splitTopicList(selectedRaw);
  const items = Array.isArray(websource.items) ? (websource.items as Record<string, unknown>[]) : [];
  // 未选题：保留发现池，勿剪成空（否则后续 extractHotTopics / 成稿无证据）
  if (selected.length === 0) {
    return {
      ...websource,
      items,
      hitCount: typeof websource.hitCount === 'number' ? websource.hitCount : items.length,
      topicChips: Array.isArray(websource.topicChips) ? websource.topicChips : [],
      prunedToSelection: false,
    };
  }

  const keptClean = items.filter((it) =>
    selected.some((topic) =>
      itemMatches(topic, String(it.title ?? ''), String(it.snippet ?? ''))
    )
  );

  // 选题匹配不到任何条目时回退整池，避免 items=[] 直接导致管线失败
  const useFallback = keptClean.length === 0 && items.length > 0;
  const finalItems = useFallback ? items : keptClean;

  return {
    query: websource.query,
    depth: websource.depth,
    providers: websource.providers,
    items: finalItems,
    hitCount: finalItems.length,
    truncated: !useFallback,
    topicChips: selected,
    prunedToSelection: true,
    ...(useFallback ? { pruneMatchMiss: true } : {}),
    discoveryHitCount:
      typeof websource.hitCount === 'number' ? websource.hitCount : items.length,
  };
}
