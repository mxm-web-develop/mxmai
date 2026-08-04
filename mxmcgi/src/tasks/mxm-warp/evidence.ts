/**
 * 任务运行时证据缓存：检索等大块材料进 state.evidence，
 * 合同只保留结构真源 + 短指针；LLM 按步领取 evidencePack。
 * @see docs/adr/core-skill-output.md §10
 */
import type { TaskContext } from '../types';
import type { MxmWarpContract } from './contract-types';

export type EvidenceItemBrief = {
  title: string;
  url?: string;
  snippet?: string;
  domain?: string;
};

export type EvidenceDigest = {
  key: string;
  kind: 'webSearch';
  query?: string;
  hitCount?: number;
  /** 给 LLM 的短摘要（已限长） */
  digestText: string;
  items?: EvidenceItemBrief[];
  topicChips?: unknown;
  /** 工具步（如 extractHotTopics）可读的较完整负载；超预算时截断 */
  payload?: Record<string, unknown>;
  /** 可选 MinIO 指针（超大原文） */
  objectKey?: string;
  updatedAt: string;
  charCount: number;
};

export type TaskEvidenceStore = Record<string, EvidenceDigest>;

/** 合同侧指针：无大段 text / 无完整 items / 无发现池 topicPool */
export type WebSearchContractPointer = {
  query?: string;
  hitCount?: number;
  truncated?: boolean;
  depth?: unknown;
  providers?: unknown;
  topicChips?: unknown;
  /** 极短提示，禁止当作全文证据 */
  digest?: string;
  evidenceKey: string;
  prunedToSelection?: boolean;
};

const DIGEST_TEXT_MAX = 1800;
const PACK_ITEM_MAX = 12;
const PACK_SNIPPET_MAX = 220;
const PAYLOAD_TEXT_MAX = 24_000;
const PAYLOAD_ITEMS_MAX = 40;
const TRACE_JSON_MAX = 24_000;
const EVIDENCE_PACK_DEFAULT_MAX = 8_000;

export function isAdminPipelineDebug(ctx: TaskContext): boolean {
  const p = (ctx.params ?? {}) as Record<string, unknown>;
  return p.__adminPipelineDebug === true || p.adminPipelineDebug === true;
}

/** webSearch target → evidence 键 */
export function targetToEvidenceKey(target: string): string {
  if (target === 'sources.websource') return 'websource';
  if (target === 'sources.industry_overview' || target === 'industry_overview') {
    return 'industry_overview';
  }
  if (target.startsWith('enrich_search.')) {
    const sub = target.slice('enrich_search.'.length).trim() || 'result';
    if (sub === 'result') return 'enrich_result';
    if (sub === 'result_supplement') return 'enrich_supplement';
    // 时段大势专用：键名与业务 evidenceKeys 对齐
    if (sub === 'industry_overview') return 'industry_overview';
    return `enrich_${sub.replace(/[^a-zA-Z0-9_]+/g, '_')}`;
  }
  return target.replace(/[^a-zA-Z0-9_]+/g, '_').slice(0, 64) || 'unknown';
}

function truncateStr(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n…[truncated]`;
}

function briefItems(raw: unknown, maxItems: number): EvidenceItemBrief[] {
  if (!Array.isArray(raw)) return [];
  const out: EvidenceItemBrief[] = [];
  for (const it of raw) {
    if (!it || typeof it !== 'object' || Array.isArray(it)) continue;
    const o = it as Record<string, unknown>;
    const title = String(o.title ?? '').trim();
    if (!title && !o.url) continue;
    out.push({
      title: title || String(o.url ?? ''),
      url: typeof o.url === 'string' ? o.url : undefined,
      snippet:
        typeof o.snippet === 'string' ? truncateStr(o.snippet, PACK_SNIPPET_MAX) : undefined,
      domain: typeof o.domain === 'string' ? o.domain : undefined,
    });
    if (out.length >= maxItems) break;
  }
  return out;
}

/** 合同上挂的短指针（不再焊大段原文 / 发现池） */
export function slimWebSearchForContract(
  payload: Record<string, unknown>,
  evidenceKey: string
): WebSearchContractPointer {
  const text = typeof payload.text === 'string' ? payload.text : '';
  const pruned = payload.prunedToSelection === true;
  return {
    query: typeof payload.query === 'string' ? payload.query : undefined,
    hitCount:
      typeof payload.hitCount === 'number'
        ? payload.hitCount
        : Array.isArray(payload.items)
          ? payload.items.length
          : undefined,
    truncated: true,
    depth: payload.depth,
    providers: payload.providers,
    // 仅已选/当前 chips；topicPool 永不进合同指针（只活在 C 端换一批 / 剪枝前 evidence）
    topicChips: payload.topicChips,
    digest: text ? truncateStr(text, 280) : undefined,
    evidenceKey,
    ...(pruned ? { prunedToSelection: true } : {}),
  };
}

function buildPayloadForStore(payload: Record<string, unknown>): Record<string, unknown> {
  const text = typeof payload.text === 'string' ? truncateStr(payload.text, PAYLOAD_TEXT_MAX) : payload.text;
  const items = Array.isArray(payload.items) ? payload.items.slice(0, PAYLOAD_ITEMS_MAX) : payload.items;
  return {
    ...payload,
    text,
    items,
  };
}

export function buildEvidenceDigest(
  key: string,
  payload: Record<string, unknown>
): EvidenceDigest {
  const text = typeof payload.text === 'string' ? payload.text : '';
  const items = briefItems(payload.items, PACK_ITEM_MAX);
  const digestText = truncateStr(text, DIGEST_TEXT_MAX);
  const stored = buildPayloadForStore(payload);
  const charCount = JSON.stringify(stored).length;
  return {
    key,
    kind: 'webSearch',
    query: typeof payload.query === 'string' ? payload.query : undefined,
    hitCount:
      typeof payload.hitCount === 'number'
        ? payload.hitCount
        : items.length || undefined,
    digestText,
    items,
    topicChips: payload.topicChips,
    payload: stored,
    updatedAt: new Date().toISOString(),
    charCount,
  };
}

export function getEvidenceStore(ctx: TaskContext): TaskEvidenceStore {
  const raw = ctx.state.evidence;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as TaskEvidenceStore;
  }
  return {};
}

export function putEvidence(
  ctx: TaskContext,
  key: string,
  payload: Record<string, unknown>
): TaskContext {
  const digest = buildEvidenceDigest(key, payload);
  const store = { ...getEvidenceStore(ctx), [key]: digest };
  return { ...ctx, state: { ...ctx.state, evidence: store } };
}

export function getEvidence(ctx: TaskContext, key: string): EvidenceDigest | undefined {
  return getEvidenceStore(ctx)[key];
}

/** 工具步取较完整 websource；优先 evidence.payload，回退合同（含历史全量） */
export function resolveWebsourcePayload(
  ctx: TaskContext,
  contract?: MxmWarpContract | null
): Record<string, unknown> | undefined {
  const fromEv = getEvidence(ctx, 'websource')?.payload;
  if (fromEv && typeof fromEv === 'object') return fromEv;
  const ws = contract?.sources?.websource;
  if (ws && typeof ws === 'object' && !Array.isArray(ws)) {
    return ws as Record<string, unknown>;
  }
  return undefined;
}

export function resolveEvidencePayload(
  ctx: TaskContext,
  key: string,
  fallback?: unknown
): Record<string, unknown> | undefined {
  const fromEv = getEvidence(ctx, key)?.payload;
  if (fromEv && typeof fromEv === 'object') return fromEv;
  if (fallback && typeof fallback === 'object' && !Array.isArray(fallback)) {
    return fallback as Record<string, unknown>;
  }
  return undefined;
}

/** LLM 合同视图：结构真源，不含检索原文 */
export function buildContractView(
  contract: Record<string, unknown> | MxmWarpContract | null | undefined
): Record<string, unknown> {
  if (!contract || typeof contract !== 'object') {
    return { meta: {}, basic: {}, business: {}, assets: {} };
  }
  const c = contract as Record<string, unknown>;
  const enrich =
    c.enrich_search && typeof c.enrich_search === 'object' && !Array.isArray(c.enrich_search)
      ? (c.enrich_search as Record<string, unknown>)
      : {};
  const sources =
    c.sources && typeof c.sources === 'object' && !Array.isArray(c.sources)
      ? (c.sources as Record<string, unknown>)
      : {};
  const ws = sources.websource;
  let websourcePointer: unknown = undefined;
  if (ws && typeof ws === 'object' && !Array.isArray(ws)) {
    const w = ws as Record<string, unknown>;
    websourcePointer = {
      query: w.query,
      hitCount: w.hitCount,
      evidenceKey: w.evidenceKey ?? 'websource',
      // 仅已选/当前展示 chips；topicPool（发现池）只给 C 端换一批，禁止进 LLM 合同视图
      topicChips: w.topicChips,
      digest: typeof w.digest === 'string' ? w.digest : undefined,
      ...(w.prunedToSelection != null ? { prunedToSelection: w.prunedToSelection } : {}),
    };
  }

  const selection =
    c.selection && typeof c.selection === 'object' && !Array.isArray(c.selection)
      ? c.selection
      : undefined;

  return {
    meta: c.meta ?? {},
    basic: c.basic && typeof c.basic === 'object' ? c.basic : {},
    business: c.business && typeof c.business === 'object' ? c.business : {},
    assets: c.assets && typeof c.assets === 'object' ? c.assets : {},
    ...(selection ? { selection } : {}),
    enrich_search: {
      query: enrich.query,
      // 仅指针，不含 result 原文
      result: slimPointer(enrich.result, 'enrich_result'),
      result_supplement: slimPointer(enrich.result_supplement, 'enrich_supplement'),
      // entity_dive 可能很大：默认不进通用合同视图（需要时由步 params 显式打开）
    },
    sources: websourcePointer ? { websource: websourcePointer } : {},
  };
}

/** 按区裁剪合同视图，供 nestedText 白名单投喂 */
export function pickContractZones(
  view: Record<string, unknown>,
  zones: string[] | undefined | null
): Record<string, unknown> {
  if (!zones || zones.length === 0) return view;
  const allow = new Set(zones.map((z) => String(z).trim()).filter(Boolean));
  const out: Record<string, unknown> = {};
  // meta 始终带极简，便于排错
  if (view.meta && typeof view.meta === 'object') {
    const m = view.meta as Record<string, unknown>;
    out.meta = {
      scope: m.scope,
      taskKey: m.taskKey,
      subtype: m.subtype,
      taskId: m.taskId,
    };
  }
  for (const z of allow) {
    if (z === 'meta') continue;
    if (view[z] !== undefined) out[z] = view[z];
  }
  return out;
}

function slimPointer(raw: unknown, defaultKey: string): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  return {
    query: r.query,
    hitCount: r.hitCount,
    evidenceKey: r.evidenceKey ?? defaultKey,
    digest: typeof r.digest === 'string' ? r.digest : undefined,
  };
}

export type EvidenceExtractBrief = {
  url?: string;
  title?: string;
  summary?: string;
  keyPoints?: string[];
  dataPoints?: string[];
  confidence?: number;
};

export type EvidencePackEntry = {
  key: string;
  query?: string;
  hitCount?: number;
  digestText: string;
  items?: EvidenceItemBrief[];
  /** 正文抽取：优先于短 snippet，供鉴真 / 内联出处 */
  extracted?: EvidenceExtractBrief[];
  topicChips?: unknown;
};

export type CitationBriefItem = {
  title: string;
  url?: string;
  domain?: string;
  summary?: string;
  evidenceKey?: string;
};

const PACK_EXTRACTED_MAX = 6;
const PACK_EXTRACT_SUMMARY_MAX = 480;
const CITATION_BRIEF_MAX = 24;

function isArticleLikeUrl(url?: string): boolean {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  try {
    const u = new URL(url);
    const parts = u.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
    if (parts.length < 2) return false;
    if (/^(channel|list|index|category|tag|topic|sports)$/i.test(parts[0] || '')) return false;
    if (parts.length === 1 && !/\.(html?|shtml)$/i.test(parts[0]!)) return false;
    return true;
  } catch {
    return false;
  }
}

/** 发现池归档等：默认不进 LLM evidencePack */
function isArchivedEvidenceKey(key: string): boolean {
  return key === 'websource_discovery' || key.endsWith('_discovery');
}

function briefExtracted(
  payload: Record<string, unknown> | undefined,
  max = PACK_EXTRACTED_MAX
): EvidenceExtractBrief[] {
  const raw = payload?.extracted;
  if (!Array.isArray(raw)) return [];
  const out: EvidenceExtractBrief[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const o = row as Record<string, unknown>;
    const summaryRaw =
      (typeof o.summary === 'string' && o.summary.trim()) ||
      (typeof o.content === 'string' && o.content.trim()) ||
      '';
    const summary = summaryRaw
      ? truncateStr(summaryRaw, PACK_EXTRACT_SUMMARY_MAX)
      : undefined;
    const title = typeof o.title === 'string' ? o.title.trim() : undefined;
    const url = typeof o.url === 'string' ? o.url.trim() : undefined;
    if (!summary && !url && !title) continue;
    const keyPoints = Array.isArray(o.keyPoints)
      ? o.keyPoints.map((x) => String(x ?? '').trim()).filter(Boolean).slice(0, 6)
      : undefined;
    const dataPoints = Array.isArray(o.dataPoints)
      ? o.dataPoints.map((x) => String(x ?? '').trim()).filter(Boolean).slice(0, 8)
      : undefined;
    out.push({
      ...(url ? { url } : {}),
      ...(title ? { title } : {}),
      ...(summary ? { summary } : {}),
      ...(keyPoints?.length ? { keyPoints } : {}),
      ...(dataPoints?.length ? { dataPoints } : {}),
      ...(typeof o.confidence === 'number' ? { confidence: o.confidence } : {}),
    });
    if (out.length >= max) break;
  }
  return out;
}

function packEntrySize(entry: EvidencePackEntry): number {
  return JSON.stringify(entry).length;
}

/** 按预算组装投喂包；keys 缺省=全部可用（排除 *_discovery 归档）。优先保留 extracted + url。 */
export function buildEvidencePack(
  ctx: TaskContext,
  opts?: { keys?: string[]; maxChars?: number }
): EvidencePackEntry[] {
  const store = getEvidenceStore(ctx);
  const keys = opts?.keys?.length
    ? opts.keys
    : Object.keys(store).filter((k) => !isArchivedEvidenceKey(k));
  const maxChars = opts?.maxChars ?? EVIDENCE_PACK_DEFAULT_MAX;
  const out: EvidencePackEntry[] = [];
  let used = 2;
  for (const key of keys) {
    const d = store[key];
    if (!d) continue;
    const extracted = briefExtracted(d.payload as Record<string, unknown> | undefined);
    const full: EvidencePackEntry = {
      key: d.key,
      query: d.query,
      hitCount: d.hitCount,
      digestText: d.digestText,
      items: d.items,
      ...(extracted.length ? { extracted } : {}),
      topicChips: d.topicChips,
    };
    const fullSize = packEntrySize(full);
    if (used + fullSize <= maxChars) {
      out.push(full);
      used += fullSize;
      continue;
    }
    // 压一轮：优先 extracted + 带 url 的 items，digest 缩短
    const room = Math.max(160, maxChars - used - 80);
    const slimItems = (d.items ?? [])
      .filter((it) => typeof it.url === 'string' && it.url.trim())
      .slice(0, 6)
      .map((it) => ({
        title: it.title,
        url: it.url,
        domain: it.domain,
        snippet: it.snippet ? truncateStr(it.snippet, 120) : undefined,
      }));
    const preferred: EvidencePackEntry = {
      key: d.key,
      query: d.query,
      hitCount: d.hitCount,
      digestText: truncateStr(d.digestText, Math.min(280, Math.floor(room * 0.25))),
      ...(slimItems.length ? { items: slimItems } : {}),
      ...(extracted.length
        ? {
            extracted: extracted.slice(0, 4).map((e) => ({
              ...e,
              summary: e.summary ? truncateStr(e.summary, 240) : undefined,
            })),
          }
        : {}),
    };
    let preferredSize = packEntrySize(preferred);
    if (used + preferredSize > maxChars) {
      // 再压：只留 extracted（或 url 列表）
      const tiny: EvidencePackEntry = {
        key: d.key,
        query: d.query,
        hitCount: d.hitCount,
        digestText: truncateStr(d.digestText, 120),
        ...(extracted.length
          ? {
              extracted: extracted.slice(0, 3).map((e) => ({
                url: e.url,
                title: e.title,
                summary: e.summary ? truncateStr(e.summary, 160) : undefined,
              })),
            }
          : slimItems.length
            ? { items: slimItems.slice(0, 4) }
            : {}),
      };
      preferredSize = packEntrySize(tiny);
      if (used + preferredSize <= maxChars) {
        out.push(tiny);
        used += preferredSize;
      }
      break;
    }
    out.push(preferred);
    used += preferredSize;
    break;
  }
  return out;
}

/**
 * 成稿用可追溯来源清单（output 注入）：来自 evidence items/extracted + business.source_map。
 * 禁止把全量检索原文塞进成稿上下文。
 */
export function buildCitationBrief(
  ctx: TaskContext,
  opts?: { maxItems?: number; keys?: string[] }
): CitationBriefItem[] {
  const maxItems = opts?.maxItems ?? CITATION_BRIEF_MAX;
  const store = getEvidenceStore(ctx);
  const keys = opts?.keys?.length
    ? opts.keys
    : Object.keys(store).filter((k) => !isArchivedEvidenceKey(k));
  const seen = new Set<string>();
  const out: CitationBriefItem[] = [];

  const push = (item: CitationBriefItem) => {
    const id = (item.url || item.title).trim().toLowerCase();
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push(item);
  };

  for (const key of keys) {
    if (out.length >= maxItems) break;
    const d = store[key];
    if (!d) continue;
    for (const ex of briefExtracted(d.payload as Record<string, unknown> | undefined, 8)) {
      if (out.length >= maxItems) break;
      push({
        title: (ex.title || ex.url || 'source').trim(),
        url: ex.url,
        summary: ex.summary ? truncateStr(ex.summary, 200) : undefined,
        evidenceKey: key,
      });
    }
    for (const it of d.items ?? []) {
      if (out.length >= maxItems) break;
      push({
        title: it.title,
        url: it.url,
        domain: it.domain,
        summary: it.snippet ? truncateStr(it.snippet, 160) : undefined,
        evidenceKey: key,
      });
    }
  }

  const contract = ctx.state.contract as Record<string, unknown> | undefined;
  const business =
    contract?.business && typeof contract.business === 'object'
      ? (contract.business as Record<string, unknown>)
      : undefined;
  const sourceMap = business?.source_map;
  if (Array.isArray(sourceMap)) {
    for (const row of sourceMap) {
      if (out.length >= maxItems) break;
      if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
      const o = row as Record<string, unknown>;
      const title = String(o.title ?? o.name ?? o.source ?? o.url ?? '').trim();
      const url = typeof o.url === 'string' ? o.url.trim() : undefined;
      if (!title && !url) continue;
      push({
        title: title || url!,
        url,
        domain: typeof o.domain === 'string' ? o.domain : undefined,
        summary:
          typeof o.note === 'string'
            ? truncateStr(o.note, 120)
            : typeof o.claim === 'string'
              ? truncateStr(o.claim, 120)
              : undefined,
        evidenceKey: 'business.source_map',
      });
    }
  }

  // 优先文章级 URL，频道首页放到末尾
  out.sort((a, b) => Number(isArticleLikeUrl(b.url)) - Number(isArticleLikeUrl(a.url)));
  return out.slice(0, maxItems);
}

/** Admin 逐步 I/O：截断 JSON 快照 */
export function snapshotForTrace(value: unknown, maxChars = TRACE_JSON_MAX): unknown {
  try {
    const s = JSON.stringify(value);
    if (s == null) return value;
    if (s.length <= maxChars) return value;
    return {
      __truncated: true,
      preview: `${s.slice(0, maxChars)}…`,
      originalChars: s.length,
    };
  } catch {
    return String(value).slice(0, Math.min(maxChars, 2000));
  }
}
