/**
 * 选题后剪枝：大检索池仅用于发现；用户选定话题后，未选题材料不得进入后续 LLM。
 * 纯函数，无业务硬编码（字段名可配）。
 *
 * 匹配优先级（禁止中英专名死表）：
 * 1. topicSourceMap（提炼阶段记下的 topic→url）——跨语言意译后的正确回挂
 * 2. 同文字符串包含 / 关键词（仅作同语种兜底）
 * 剪枝为空时由 softMinKept + enrich 按选题补检索，勿靠别名词典硬撑。
 */

import { splitCoreTopics } from './pick-main-topic';

export type PruneSearchItem = {
  title?: string;
  url?: string;
  snippet?: string;
  domain?: string;
  [k: string]: unknown;
};

export type PruneWebsourcePayload = {
  query?: string;
  hitCount?: number;
  truncated?: boolean;
  depth?: unknown;
  providers?: unknown;
  text?: string;
  items?: PruneSearchItem[];
  topicChips?: unknown;
  /** 热点提炼写入：选题文案 → 支撑该 chip 的检索 URL */
  topicSourceMap?: Record<string, string[]>;
  evidenceKey?: string;
  [k: string]: unknown;
};

export function normalizeSelectedTopics(rawList: unknown[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of rawList) {
    for (const t of splitCoreTopics(raw)) {
      if (seen.has(t)) continue;
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

/** 从话题抽出可匹配键：书名号内专名、较长中文片段、拉丁词（同语种兜底，无别名表） */
export function extractTopicMatchKeys(topic: string): string[] {
  const keys: string[] = [];
  const t = topic.trim();
  if (!t) return keys;
  for (const m of t.matchAll(/《([^》]+)》/g)) {
    const inner = String(m[1] ?? '').trim();
    if (inner.length >= 2) keys.push(inner);
  }
  for (const m of t.matchAll(/[\u4e00-\u9fff]{2,12}/g)) {
    keys.push(m[0]!);
  }
  for (const m of t.matchAll(/[A-Za-z][A-Za-z0-9.+-]{1,}/g)) {
    keys.push(m[0]!);
  }
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
  return [
    ...new Set(
      keys
        .map((k) => k.trim())
        .filter((k) => k.length >= 2 && !stop.has(k))
    ),
  ];
}

function normalizeUrlKey(url: string): string {
  return url.trim().replace(/\/+$/, '').toLowerCase();
}

/** 选题文案 → 来源 URL（允许选题与 map key 互为包含，兼容轻微改写） */
export function resolveUrlsForTopic(
  topic: string,
  topicSourceMap: Record<string, string[]> | undefined | null
): string[] {
  if (!topicSourceMap || !topic.trim()) return [];
  const t = topic.trim();
  const direct = topicSourceMap[t];
  if (Array.isArray(direct) && direct.length) {
    return [...new Set(direct.map(String).filter(Boolean))];
  }
  const out: string[] = [];
  for (const [key, urls] of Object.entries(topicSourceMap)) {
    if (!key || !Array.isArray(urls)) continue;
    if (key === t || key.includes(t) || t.includes(key)) {
      for (const u of urls) {
        const s = String(u ?? '').trim();
        if (s) out.push(s);
      }
    }
  }
  return [...new Set(out)];
}

function itemMatchesSourceMap(
  item: PruneSearchItem,
  selected: string[],
  topicSourceMap: Record<string, string[]> | undefined
): boolean {
  if (!topicSourceMap || selected.length === 0) return false;
  const url = String(item.url ?? '').trim();
  if (!url) return false;
  const uk = normalizeUrlKey(url);
  for (const topic of selected) {
    for (const src of resolveUrlsForTopic(topic, topicSourceMap)) {
      if (normalizeUrlKey(src) === uk) return true;
    }
  }
  return false;
}

/** 同语种字符串兜底（不含跨语言专名表） */
export function itemMatchesSelectedTopics(
  item: PruneSearchItem,
  selected: string[],
  topicSourceMap?: Record<string, string[]> | null
): boolean {
  if (selected.length === 0) return false;
  if (itemMatchesSourceMap(item, selected, topicSourceMap ?? undefined)) return true;

  const title = String(item.title ?? '').trim();
  const snippet = String(item.snippet ?? '').trim();
  const hay = `${title}\n${snippet}`.toLowerCase();
  for (const topic of selected) {
    const t = topic.trim();
    if (!t) continue;
    if (title === t) return true;
    const tl = t.toLowerCase();
    if (title.includes(t) || t.includes(title) || hay.includes(tl)) return true;
    const compactTitle = title.replace(/…$/u, '').trim();
    const compactTopic = t.replace(/…$/u, '').trim();
    if (
      compactTitle &&
      compactTopic &&
      (compactTitle.includes(compactTopic) || compactTopic.includes(compactTitle))
    ) {
      return true;
    }
    const keys = extractTopicMatchKeys(t);
    if (keys.length === 0) continue;
    const strong = keys.filter((k) => k.length >= 4);
    if (strong.some((k) => hay.includes(k.toLowerCase()))) return true;
    const hits = keys.filter((k) => hay.includes(k.toLowerCase())).length;
    if (hits >= 2 || (keys.length === 1 && hits === 1 && keys[0]!.length >= 3)) {
      return true;
    }
  }
  return false;
}

function rebuildWebsourceText(
  items: PruneSearchItem[],
  query: string | undefined,
  maxChars: number
): string {
  const lines: string[] = [];
  if (query) lines.push(`查询: ${query}`);
  lines.push(`保留条目: ${items.length}（已按用户选题剪枝）`);
  lines.push('');
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    const title = String(it.title ?? '').trim() || '(无标题)';
    const snip = String(it.snippet ?? '').trim();
    const domain = String(it.domain ?? '').trim();
    lines.push(`${i + 1}. ${title}${domain ? ` (${domain})` : ''}`);
    if (snip) lines.push(`   ${snip.slice(0, 240)}`);
  }
  const text = lines.join('\n');
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n…[truncated]`;
}

/**
 * 按已选话题裁剪 websource / evidence 载荷。
 * 优先 topicSourceMap（提炼回挂）；否则同语种字符串兜底。
 */
export function pruneWebsourceToSelection(
  payload: PruneWebsourcePayload | null | undefined,
  selectedTopics: string[],
  opts?: { textMaxChars?: number; topicSourceMap?: Record<string, string[]> | null }
): {
  pruned: PruneWebsourcePayload;
  keptCount: number;
  droppedCount: number;
  selectedTopics: string[];
} {
  const selected = normalizeSelectedTopics(selectedTopics);
  const textMax = opts?.textMaxChars ?? 6_000;
  const base =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload
      : ({} as PruneWebsourcePayload);

  const topicSourceMap =
    opts?.topicSourceMap ??
    (base.topicSourceMap && typeof base.topicSourceMap === 'object'
      ? (base.topicSourceMap as Record<string, string[]>)
      : undefined);

  const rawItems = Array.isArray(base.items) ? base.items : [];
  const kept =
    selected.length === 0
      ? []
      : rawItems.filter((it) => itemMatchesSelectedTopics(it, selected, topicSourceMap));

  const pruned: PruneWebsourcePayload = {
    query: typeof base.query === 'string' ? base.query : undefined,
    depth: base.depth,
    providers: base.providers,
    items: kept,
    hitCount: kept.length,
    truncated: true,
    topicChips: selected.length > 0 ? selected : [],
    text: rebuildWebsourceText(
      kept,
      typeof base.query === 'string' ? base.query : undefined,
      textMax
    ),
    prunedToSelection: true,
    discoveryHitCount: typeof base.hitCount === 'number' ? base.hitCount : rawItems.length,
    evidenceKey: typeof base.evidenceKey === 'string' ? base.evidenceKey : undefined,
    ...(topicSourceMap ? { topicSourceMap } : {}),
  };

  return {
    pruned,
    keptCount: kept.length,
    droppedCount: Math.max(0, rawItems.length - kept.length),
    selectedTopics: selected,
  };
}
