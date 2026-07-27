/**
 * Task v2：formSchema 中 kbRecall / webSearch / mxmKbInput 字段解析
 * 支持多 item 列表、pre/post 阶段、合并格式化后供 unifiedTemplate 插值。
 */
import { RepositoryFactory } from '@mxmai/mxmdata';
import type { ContextResolvePhase, JsonSchemaV2, TaskContext } from './types';
import { ValidationError } from './errors';
import { assertVirtualFolder } from '../folder-index/folder-content-resolver';
import { virtualFolderIndexService } from '../folder-index/virtual-folder-index-service';
import { SearchService } from '../core/search/search-service';
import { listUsableSearchProviderNames } from '../core/search/search-config';
import type { SearchDepth, SearchResultItem } from '../core/search/types';

export const KB_RECALL_MAX_CHARS = 3500;
export const WEB_SEARCH_MAX_CHARS = 2500;
export const DOMAIN_SEARCH_MAX_CHARS = 3500;
export const MAX_CONTEXT_FIELDS = 10;
export const DEFAULT_MAX_CONTEXT_ITEMS = 5;

export type ContextFieldKind = 'kbRecall' | 'mxmKbInput' | 'webSearch' | 'domainSearch';

export interface ContextFieldDescriptor {
  fieldName: string;
  kind: ContextFieldKind;
  fieldSchema: Record<string, unknown>;
}

export interface ContextFieldMeta {
  kind: ContextFieldKind;
  hitCount?: number;
  truncated?: boolean;
  folderId?: string;
  folderLabel?: string;
  searchDepth?: SearchDepth;
  providers?: string[];
  query?: string;
  charCount?: number;
}

export interface ContextFieldAggregateMeta {
  kind: ContextFieldKind;
  itemCount: number;
  hitCount?: number;
  truncated?: boolean;
  charCount?: number;
  items: ContextFieldMeta[];
}

export interface KbRecallInput {
  folderId: string;
  query: string;
  limit?: number;
}

export interface WebSearchInput {
  searchDepth: SearchDepth;
  query: string;
  maxResults?: number;
}

export interface DomainSearchInput {
  searchDepth: SearchDepth;
  query: string;
  domain?: 'legal' | 'finance' | 'stock' | 'crypto' | 'business' | 'auto';
}

const SEARCH_DEPTH_VALUES = new Set<SearchDepth>(['quick', 'standard', 'deep']);

function normalizeSearchDepth(raw: unknown, fallback: SearchDepth = 'standard'): SearchDepth {
  const s = typeof raw === 'string' ? raw.trim() : '';
  return SEARCH_DEPTH_VALUES.has(s as SearchDepth) ? (s as SearchDepth) : fallback;
}

function schemaProperties(formSchema?: JsonSchemaV2): Record<string, unknown> {
  return ((formSchema as { properties?: Record<string, unknown> })?.properties ?? {}) as Record<
    string,
    unknown
  >;
}

export function readContextResolvePhase(fieldSchema: Record<string, unknown>): ContextResolvePhase {
  const phase = fieldSchema['x-resolve-phase'];
  return phase === 'post' ? 'post' : 'pre';
}

export function readMaxContextItems(fieldSchema: Record<string, unknown>): number {
  const raw = fieldSchema['x-max-items'];
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return Math.min(20, Math.floor(raw));
  }
  return DEFAULT_MAX_CONTEXT_ITEMS;
}

export function readAutoFrom(fieldSchema: Record<string, unknown>): string {
  const auto = fieldSchema['x-auto-from'];
  if (typeof auto === 'string' && auto.trim()) return auto.trim();
  if (fieldSchema['x-auto-from-prompt'] === true) return 'prompt';
  return 'prompt';
}

export function collectContextFieldDescriptors(
  formSchema?: JsonSchemaV2,
  phase?: ContextResolvePhase
): ContextFieldDescriptor[] {
  const props = schemaProperties(formSchema);
  const out: ContextFieldDescriptor[] = [];
  for (const [fieldName, defRaw] of Object.entries(props)) {
    if (!defRaw || typeof defRaw !== 'object') continue;
    const def = defRaw as Record<string, unknown>;
    const ui = String(def['x-ui-type'] ?? '');
    if (ui !== 'kbRecall' && ui !== 'mxmKbInput' && ui !== 'webSearch' && ui !== 'domainSearch') continue;
    if (phase && readContextResolvePhase(def) !== phase) continue;
    out.push({
      fieldName,
      kind: ui as ContextFieldKind,
      fieldSchema: def,
    });
  }
  return out;
}

function readMaxChars(fieldSchema: Record<string, unknown>, defaultMax: number): number {
  const raw = fieldSchema['x-context-max-chars'];
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return Math.floor(raw);
  }
  return defaultMax;
}

function isLegacyKbRecallObject(o: Record<string, unknown>): boolean {
  return typeof o.folderId === 'string' || typeof o.query === 'string';
}

function isLegacyWebSearchObject(o: Record<string, unknown>): boolean {
  return typeof o.query === 'string' || typeof o.searchDepth === 'string' || o.provider != null;
}

export function normalizeKbRecallItems(raw: unknown): KbRecallInput[] {
  if (!raw || typeof raw !== 'object') return [];
  const o = raw as Record<string, unknown>;
  let rows: unknown[] = [];
  if (Array.isArray(o.items)) {
    rows = o.items;
  } else if (isLegacyKbRecallObject(o)) {
    rows = [o];
  }
  const out: KbRecallInput[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const r = row as Record<string, unknown>;
    const folderId = typeof r.folderId === 'string' ? r.folderId.trim() : '';
    const query = typeof r.query === 'string' ? r.query.trim() : '';
    if (!folderId || !query) continue;
    const limit =
      typeof r.limit === 'number' && Number.isFinite(r.limit)
        ? Math.min(20, Math.max(1, Math.floor(r.limit)))
        : 8;
    out.push({ folderId, query, limit });
  }
  return out;
}

function isLegacyDomainSearchObject(o: Record<string, unknown>): boolean {
  return typeof o.domain === 'string';
}

export function normalizeDomainSearchItems(raw: unknown): Array<Record<string, unknown>> {
  if (!raw || typeof raw !== 'object') return [];
  const o = raw as Record<string, unknown>;
  if (Array.isArray(o.items)) {
    return o.items.filter((x) => x && typeof x === 'object' && !Array.isArray(x)) as Array<
      Record<string, unknown>
    >;
  }
  if (isLegacyDomainSearchObject(o)) return [o];
  return [];
}

export function normalizeWebSearchItems(raw: unknown): Array<Record<string, unknown>> {
  if (!raw || typeof raw !== 'object') return [];
  const o = raw as Record<string, unknown>;
  if (Array.isArray(o.items)) return o.items.filter((x) => x && typeof x === 'object' && !Array.isArray(x)) as Array<Record<string, unknown>>;
  if (isLegacyWebSearchObject(o)) return [o];
  return [];
}

function resolveAutoQuery(
  autoFrom: string,
  ctx: TaskContext,
  fieldSchema: Record<string, unknown>
): string {
  if (autoFrom === 'coreText') {
    const core = ctx.state.coreArtifact as { text?: string } | undefined;
    if (typeof core?.text === 'string' && core.text.trim()) return core.text.trim();
    return '';
  }
  if (autoFrom.startsWith('field:')) {
    const field = autoFrom.slice('field:'.length);
    const v = ctx.params[field];
    if (typeof v === 'string' && v.trim()) return v.trim();
    return '';
  }
  const prompt = typeof ctx.params.prompt === 'string' ? ctx.params.prompt : '';
  return prompt.trim();
}

function parseKbRecallInput(raw: unknown): KbRecallInput | null {
  const items = normalizeKbRecallItems(raw);
  return items[0] ?? null;
}

function parseWebSearchInput(raw: unknown): WebSearchInput | null {
  const rows = normalizeWebSearchItems(raw);
  if (!rows.length) return null;
  const o = rows[0];
  const query = typeof o.query === 'string' ? o.query.trim() : '';
  if (!query) return null;
  const searchDepth = normalizeSearchDepth(o.searchDepth);
  const maxResults =
    typeof o.maxResults === 'number' && Number.isFinite(o.maxResults)
      ? Math.min(15, Math.max(1, Math.floor(o.maxResults)))
      : 6;
  return { searchDepth, query, maxResults };
}

async function resolveWebSearchInput(
  raw: unknown,
  fieldSchema: Record<string, unknown>,
  promptTopic: string
): Promise<WebSearchInput | null> {
  const parsed = parseWebSearchInput(raw);
  if (parsed) return parsed;

  const autoFrom = readAutoFrom(fieldSchema);
  if (autoFrom === 'prompt' && fieldSchema['x-auto-from-prompt'] !== true) return null;

  const topic = promptTopic.trim();
  if (!topic) return null;

  const o =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const query =
    typeof o.query === 'string' && o.query.trim() ? o.query.trim() : topic;
  const searchDepth = normalizeSearchDepth(o.searchDepth);

  const maxResults =
    typeof o.maxResults === 'number' && Number.isFinite(o.maxResults)
      ? Math.min(15, Math.max(1, Math.floor(o.maxResults)))
      : 8;

  return { searchDepth, query, maxResults };
}

async function resolveWebSearchItems(
  raw: unknown,
  fieldSchema: Record<string, unknown>,
  ctx: TaskContext
): Promise<WebSearchInput[]> {
  const rows = normalizeWebSearchItems(raw);
  const maxItems = readMaxContextItems(fieldSchema);
  const autoFrom = readAutoFrom(fieldSchema);
  const fallbackTopic =
    autoFrom === 'coreText'
      ? resolveAutoQuery('coreText', ctx, fieldSchema)
      : typeof ctx.params.prompt === 'string'
        ? ctx.params.prompt.trim()
        : '';

  const out: WebSearchInput[] = [];
  for (const row of rows.slice(0, maxItems)) {
    let query = typeof row.query === 'string' ? row.query.trim() : '';
    if (!query && (fieldSchema['x-auto-from-prompt'] === true || autoFrom !== 'prompt')) {
      query = resolveAutoQuery(autoFrom, ctx, fieldSchema) || fallbackTopic;
    }
    if (!query) continue;
    const searchDepth = normalizeSearchDepth(row.searchDepth);
    const maxResults =
      typeof row.maxResults === 'number' && Number.isFinite(row.maxResults)
        ? Math.min(15, Math.max(1, Math.floor(row.maxResults)))
        : 6;
    out.push({ searchDepth, query, maxResults });
  }

  if (out.length === 0 && rows.length === 0 && fieldSchema['x-auto-from-prompt'] === true) {
    const single = await resolveWebSearchInput(raw, fieldSchema, fallbackTopic);
    if (single) out.push(single);
  }

  return out;
}

async function resolveKbRecallItems(
  raw: unknown,
  fieldSchema: Record<string, unknown>
): Promise<KbRecallInput[]> {
  const items = normalizeKbRecallItems(raw);
  const maxItems = readMaxContextItems(fieldSchema);
  return items.slice(0, maxItems);
}

async function buildFolderLabel(folderId: string): Promise<string> {
  const folderRepo = RepositoryFactory.createFolderRepository();
  const path = await folderRepo.getFolderPath(folderId);
  if (!path.length) return folderId;
  return path.map((f) => f.name).join(' / ');
}

async function assertFolderIndexed(userId: string, folderId: string) {
  let folder;
  try {
    folder = await assertVirtualFolder(folderId, userId);
  } catch (e) {
    throw new ValidationError(e instanceof Error ? e.message : String(e));
  }
  if (folder.index_status !== 'indexed') {
    throw new ValidationError(
      `虚拟文件夹尚未向量化（当前状态: ${folder.index_status ?? 'none'}）。请先在资产中心对该文件夹执行「向量化」。`
    );
  }
  if (!folder.knowledge_base_id) {
    throw new ValidationError('虚拟文件夹缺少 knowledge_base_id，请重新向量化后再试。');
  }
  return folder;
}

function scoreOfResult(r: Record<string, unknown>): number {
  if (typeof r.combined_score === 'number') return r.combined_score;
  if (typeof r.similarity === 'number') return r.similarity;
  return 0;
}

export function formatKbRecallBlock(
  folderLabel: string,
  query: string,
  results: Array<Record<string, unknown>>,
  maxChars: number
): { text: string; hitCount: number; truncated: boolean } {
  const header = `【知识召回 · 文件夹: ${folderLabel}】\n查询: ${query}\n`;
  if (results.length === 0) {
    return { text: `${header}\n（未召回相关内容）`, hitCount: 0, truncated: false };
  }

  const sorted = [...results].sort((a, b) => scoreOfResult(b) - scoreOfResult(a));
  const lines: string[] = [header.trimEnd()];
  let truncated = false;
  let hitCount = 0;

  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    const content = typeof r.content === 'string' ? r.content.trim() : '';
    if (!content) continue;
    const score = scoreOfResult(r);
    const scoreNote = score > 0 ? ` (score: ${(score * 100).toFixed(1)}%)` : '';
    const block = `[${hitCount + 1}] ${content}${scoreNote}`;
    const candidate = `${lines.join('\n\n')}\n\n${block}`;
    if (candidate.length > maxChars) {
      truncated = true;
      break;
    }
    lines.push(block);
    hitCount += 1;
  }

  return { text: lines.join('\n\n'), hitCount, truncated };
}

const SEARCH_DEPTH_LABELS: Record<SearchDepth, string> = {
  quick: '快速',
  standard: '标准',
  deep: '深度',
};

export function formatWebSearchBlock(
  searchDepth: SearchDepth,
  query: string,
  items: SearchResultItem[],
  maxChars: number
): { text: string; hitCount: number; truncated: boolean } {
  const depthLabel = SEARCH_DEPTH_LABELS[searchDepth] ?? searchDepth;
  const header = `【联网检索 · ${depthLabel}】\n查询: ${query}\n`;
  if (items.length === 0) {
    return { text: `${header}\n（未检索到结果）`, hitCount: 0, truncated: false };
  }

  const lines: string[] = [header.trimEnd()];
  let truncated = false;
  let hitCount = 0;

  for (const item of items) {
    const title = (item.title || '').trim();
    const snippet = (item.snippet || '').trim();
    const url = (item.url || '').trim();
    const block = `[${hitCount + 1}] ${title}\n${snippet}${url ? `\n来源: ${url}` : ''}`.trim();
    const candidate = `${lines.join('\n\n')}\n\n${block}`;
    if (candidate.length > maxChars) {
      truncated = true;
      break;
    }
    lines.push(block);
    hitCount += 1;
  }

  return { text: lines.join('\n\n'), hitCount, truncated };
}

function mergeBlocks(blocks: string[], maxChars: number): { text: string; truncated: boolean } {
  const parts: string[] = [];
  let truncated = false;
  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    const candidate = parts.length ? `${parts.join('\n\n')}\n\n${trimmed}` : trimmed;
    if (candidate.length > maxChars) {
      truncated = true;
      break;
    }
    parts.push(trimmed);
  }
  return { text: parts.join('\n\n'), truncated };
}

async function resolveKbRecallFieldMulti(
  userId: string | undefined,
  inputs: KbRecallInput[],
  fieldSchema: Record<string, unknown>
): Promise<{ text: string; meta: ContextFieldAggregateMeta }> {
  if (!userId) {
    throw new ValidationError('知识召回需要登录用户');
  }
  const maxChars = readMaxChars(fieldSchema, KB_RECALL_MAX_CHARS);
  const itemMetas: ContextFieldMeta[] = [];
  const blocks: string[] = [];

  await Promise.all(
    inputs.map(async (input) => {
      await assertFolderIndexed(userId, input.folderId);
      const folderLabel = await buildFolderLabel(input.folderId);
      const results = await virtualFolderIndexService.search(
        userId,
        input.folderId,
        input.query,
        input.limit ?? 8
      );
      const formatted = formatKbRecallBlock(
        folderLabel,
        input.query,
        (Array.isArray(results) ? results : []) as Array<Record<string, unknown>>,
        maxChars
      );
      blocks.push(formatted.text);
      itemMetas.push({
        kind: 'kbRecall',
        hitCount: formatted.hitCount,
        truncated: formatted.truncated,
        folderId: input.folderId,
        folderLabel,
        query: input.query,
        charCount: formatted.text.length,
      });
    })
  );

  const merged = mergeBlocks(blocks, maxChars);
  const totalHits = itemMetas.reduce((s, m) => s + (m.hitCount ?? 0), 0);
  return {
    text: merged.text,
    meta: {
      kind: 'kbRecall',
      itemCount: inputs.length,
      hitCount: totalHits,
      truncated: merged.truncated || itemMetas.some((m) => m.truncated),
      charCount: merged.text.length,
      items: itemMetas,
    },
  };
}

async function resolveDomainSearchFieldMulti(
  inputs: DomainSearchInput[],
  fieldSchema: Record<string, unknown>
): Promise<{ text: string; meta: ContextFieldAggregateMeta }> {
  const { DataSourceService } = await import('../core/data-sources/data-source-service');
  const service = new DataSourceService();
  const maxChars = readMaxChars(fieldSchema, DOMAIN_SEARCH_MAX_CHARS);
  const itemMetas: ContextFieldMeta[] = [];
  const blocks: string[] = [];

  await Promise.all(
    inputs.map(async (input) => {
      const domain = input.domain && input.domain !== 'auto' ? input.domain : undefined;
      const combined = await service.combinedSearch(input.query, {
        domain,
        depth: input.searchDepth,
      });
      const formatted = formatDomainSearchBlock(input, combined, maxChars);
      blocks.push(formatted.text);
      itemMetas.push({
        kind: 'domainSearch',
        hitCount: formatted.hitCount,
        truncated: formatted.truncated,
        searchDepth: input.searchDepth,
        query: input.query,
        charCount: formatted.text.length,
      });
    })
  );

  const merged = mergeBlocks(blocks, maxChars);
  const totalHits = itemMetas.reduce((s, m) => s + (m.hitCount ?? 0), 0);
  return {
    text: merged.text,
    meta: {
      kind: 'domainSearch',
      itemCount: inputs.length,
      hitCount: totalHits,
      truncated: merged.truncated || itemMetas.some((m) => m.truncated),
      charCount: merged.text.length,
      items: itemMetas,
    },
  };
}

function formatDomainSearchBlock(
  input: DomainSearchInput,
  combined: import('../core/data-sources/types').CombinedDomainSearchResult,
  maxChars: number
): { text: string; hitCount: number; truncated: boolean } {
  const parts: string[] = [];
  parts.push(`【专业数据源检索】领域: ${combined.domain} · topic: ${combined.topicType ?? 'general'}`);
  parts.push(`查询: ${input.query}`);

  if (combined.dataSource?.summary) {
    parts.push('\n--- 结构化数据 ---');
    parts.push(combined.dataSource.summary);
  }

  const webItems = combined.webResults ?? [];
  if (webItems.length > 0) {
    parts.push('\n--- 网页参考 ---');
    for (const item of webItems.slice(0, 5)) {
      parts.push(`• ${item.title} (${item.domain})\n  ${item.snippet?.slice(0, 200) ?? ''}`);
    }
  }

  let text = parts.join('\n');
  let truncated = false;
  const hitCount = (combined.dataSource ? 1 : 0) + webItems.length;
  if (text.length > maxChars) {
    text = text.slice(0, maxChars) + '\n…（已截断）';
    truncated = true;
  }
  return { text, hitCount, truncated };
}

async function resolveDomainSearchItems(
  raw: unknown,
  fieldSchema: Record<string, unknown>,
  ctx: TaskContext
): Promise<DomainSearchInput[]> {
  const rows = normalizeDomainSearchItems(raw);
  const maxItems = readMaxContextItems(fieldSchema);
  const autoFrom = readAutoFrom(fieldSchema);
  const fallbackTopic =
    autoFrom === 'coreText'
      ? resolveAutoQuery('coreText', ctx, fieldSchema)
      : typeof ctx.params.prompt === 'string'
        ? ctx.params.prompt.trim()
        : '';

  const out: DomainSearchInput[] = [];
  for (const row of rows.slice(0, maxItems)) {
    let query = typeof row.query === 'string' ? row.query.trim() : '';
    if (!query && fieldSchema['x-auto-from-prompt'] === true) {
      query = resolveAutoQuery(autoFrom, ctx, fieldSchema) || fallbackTopic;
    }
    if (!query) continue;
    const searchDepth = normalizeSearchDepth(row.searchDepth);
    const domainRaw = typeof row.domain === 'string' ? row.domain.trim() : 'auto';
    const domain =
      domainRaw === 'legal' ||
      domainRaw === 'finance' ||
      domainRaw === 'stock' ||
      domainRaw === 'crypto' ||
      domainRaw === 'business'
        ? domainRaw
        : 'auto';
    out.push({ searchDepth, query, domain });
  }
  return out;
}

async function resolveWebSearchFieldMulti(
  inputs: WebSearchInput[],
  fieldSchema: Record<string, unknown>
): Promise<{ text: string; meta: ContextFieldAggregateMeta }> {
  const usable = await listUsableSearchProviderNames();
  if (usable.length === 0) {
    throw new ValidationError(
      '当前无可用搜索引擎，请在 Admin 搜索配置中启用至少一个信息源后再试。'
    );
  }

  const searchService = new SearchService();
  const maxChars = readMaxChars(fieldSchema, WEB_SEARCH_MAX_CHARS);
  const itemMetas: ContextFieldMeta[] = [];
  const blocks: string[] = [];

  await Promise.all(
    inputs.map(async (input) => {
      const autoResult = await searchService.autoSearch({
        query: input.query,
        depth: input.searchDepth,
      });
      const maxItems = input.maxResults ?? 8;
      const items = (autoResult.aggregated ?? []).slice(0, maxItems);
      const providers = [
        ...new Set(
          Object.values(autoResult.dimensionResults)
            .map((r) => r?.provider)
            .filter((p): p is string => typeof p === 'string' && p.length > 0)
        ),
      ];
      const formatted = formatWebSearchBlock(input.searchDepth, input.query, items, maxChars);
      blocks.push(formatted.text);
      itemMetas.push({
        kind: 'webSearch',
        hitCount: formatted.hitCount,
        truncated: formatted.truncated,
        searchDepth: input.searchDepth,
        providers,
        query: input.query,
        charCount: formatted.text.length,
      });
    })
  );

  const merged = mergeBlocks(blocks, maxChars);
  const totalHits = itemMetas.reduce((s, m) => s + (m.hitCount ?? 0), 0);
  return {
    text: merged.text,
    meta: {
      kind: 'webSearch',
      itemCount: inputs.length,
      hitCount: totalHits,
      truncated: merged.truncated || itemMetas.some((m) => m.truncated),
      charCount: merged.text.length,
      items: itemMetas,
    },
  };
}


export interface MxmKbMention {
  type: 'folder' | 'file' | 'knowledge_card';
  id: string;
  label?: string;
  folderId?: string;
  query?: string;
}

export interface MxmKbInputValue {
  text: string;
  mentions: MxmKbMention[];
}

export function parseMxmKbInputValue(raw: unknown): MxmKbInputValue {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { text: typeof raw === 'string' ? raw : '', mentions: [] };
  }
  const o = raw as Record<string, unknown>;
  const text = typeof o.text === 'string' ? o.text : '';
  const mentions = Array.isArray(o.mentions)
    ? (o.mentions as MxmKbMention[]).filter(
        (m) =>
          m &&
          typeof m === 'object' &&
          typeof m.id === 'string' &&
          (m.type === 'folder' || m.type === 'file' || m.type === 'knowledge_card')
      )
    : [];
  return { text, mentions };
}

async function resolveMxmKbInputField(
  userId: string | undefined,
  raw: unknown,
  fieldSchema: Record<string, unknown>
): Promise<{ text: string; meta: ContextFieldAggregateMeta }> {
  if (!userId) {
    throw new ValidationError('mxmKbInput 知识引用需要登录用户');
  }
  const parsed = parseMxmKbInputValue(raw);
  const maxChars = readMaxChars(fieldSchema, KB_RECALL_MAX_CHARS);
  const defaultQuery = (parsed.text || '').trim().slice(0, 200) || '概述';
  const itemMetas: ContextFieldMeta[] = [];
  const blocks: string[] = [];

  if (parsed.text.trim()) {
    blocks.push(`【用户输入】\n${parsed.text.trim()}`);
  }

  for (const mention of parsed.mentions) {
    const query = (mention.query || defaultQuery).trim() || '概述';
    if (mention.type === 'folder' || mention.type === 'knowledge_card') {
      await assertFolderIndexed(userId, mention.id);
      const folderLabel = mention.label || (await buildFolderLabel(mention.id));
      const results = await virtualFolderIndexService.search(userId, mention.id, query, 8);
      const formatted = formatKbRecallBlock(
        folderLabel,
        query,
        (Array.isArray(results) ? results : []) as Array<Record<string, unknown>>,
        maxChars
      );
      blocks.push(formatted.text);
      itemMetas.push({
        kind: 'mxmKbInput',
        hitCount: formatted.hitCount,
        truncated: formatted.truncated,
        folderId: mention.id,
        folderLabel,
        query,
        charCount: formatted.text.length,
      });
      continue;
    }
    // file：优先在所属文件夹内按文件名召回
    const folderId = mention.folderId;
    if (!folderId) {
      blocks.push(`【文件引用】${mention.label || mention.id}\n（缺少 folderId，仅保留引用标签）`);
      itemMetas.push({
        kind: 'mxmKbInput',
        hitCount: 0,
        folderId: undefined,
        query: mention.label || mention.id,
        charCount: 0,
      });
      continue;
    }
    await assertFolderIndexed(userId, folderId);
    const folderLabel = await buildFolderLabel(folderId);
    const fileQuery = mention.label || query;
    const results = await virtualFolderIndexService.search(userId, folderId, fileQuery, 5);
    const formatted = formatKbRecallBlock(
      `${folderLabel} · 文件:${mention.label || mention.id}`,
      fileQuery,
      (Array.isArray(results) ? results : []) as Array<Record<string, unknown>>,
      maxChars
    );
    blocks.push(formatted.text);
    itemMetas.push({
      kind: 'mxmKbInput',
      hitCount: formatted.hitCount,
      truncated: formatted.truncated,
      folderId,
      folderLabel,
      query: fileQuery,
      charCount: formatted.text.length,
    });
  }

  const merged = mergeBlocks(blocks, maxChars);
  const totalHits = itemMetas.reduce((s, m) => s + (m.hitCount ?? 0), 0);
  return {
    text: merged.text,
    meta: {
      kind: 'mxmKbInput',
      itemCount: Math.max(1, parsed.mentions.length),
      hitCount: totalHits,
      truncated: merged.truncated || itemMetas.some((m) => m.truncated),
      charCount: merged.text.length,
      items: itemMetas,
    },
  };
}

export interface ResolveContextFieldsOptions {
  phase?: ContextResolvePhase;
  /** 仅解析指定类型的 Schema 字段（如管线显式添加「联网检索」步骤） */
  kinds?: ContextFieldKind[];
}

export async function resolveContextFields(
  ctx: TaskContext,
  formSchema?: JsonSchemaV2,
  options?: ResolveContextFieldsOptions
): Promise<TaskContext> {
  const { resolveFolderCardAssets } = await import('../folder-cards/resolve-card-assets');
  let working = await resolveFolderCardAssets(ctx, formSchema);

  const phase = options?.phase;
  const kindFilter = options?.kinds?.length ? new Set(options.kinds) : null;
  let descriptors = collectContextFieldDescriptors(formSchema, phase);
  if (kindFilter) {
    descriptors = descriptors.filter((d) => kindFilter.has(d.kind));
  }
  if (descriptors.length === 0) {
    return working;
  }
  if (collectContextFieldDescriptors(formSchema).length > MAX_CONTEXT_FIELDS) {
    throw new ValidationError(
      `context 字段过多，最多允许 ${MAX_CONTEXT_FIELDS} 个 kbRecall/mxmKbInput/webSearch/domainSearch 字段。`
    );
  }

  const contextFieldRaw: Record<string, unknown> = {
    ...(((working.state as { contextFieldRaw?: Record<string, unknown> }).contextFieldRaw ??
      {}) as Record<string, unknown>),
  };
  const contextFieldMeta: Record<string, ContextFieldAggregateMeta | ContextFieldMeta> = {
    ...(((working.state as { contextFieldMeta?: Record<string, unknown> }).contextFieldMeta ??
      {}) as Record<string, ContextFieldAggregateMeta | ContextFieldMeta>),
  };
  const nextParams = { ...working.params };

  const jobs = descriptors.map(async (desc) => {
    const raw = working.params[desc.fieldName];
    if (desc.kind === 'kbRecall') {
      const inputs = await resolveKbRecallItems(raw, desc.fieldSchema);
      if (!inputs.length) return;
      contextFieldRaw[desc.fieldName] = raw;
      const { text, meta } = await resolveKbRecallFieldMulti(working.userId, inputs, desc.fieldSchema);
      nextParams[desc.fieldName] = text;
      contextFieldMeta[desc.fieldName] = meta;
      return;
    }
    if (desc.kind === 'mxmKbInput') {
      const parsed = parseMxmKbInputValue(raw);
      if (!parsed.text.trim() && parsed.mentions.length === 0) return;
      contextFieldRaw[desc.fieldName] = raw;
      const { text, meta } = await resolveMxmKbInputField(working.userId, raw, desc.fieldSchema);
      nextParams[desc.fieldName] = text;
      contextFieldMeta[desc.fieldName] = meta;
      return;
    }
    if (desc.kind === 'domainSearch') {
      const inputs = await resolveDomainSearchItems(raw, desc.fieldSchema, working);
      if (!inputs.length) return;
      contextFieldRaw[desc.fieldName] = raw;
      const { text, meta } = await resolveDomainSearchFieldMulti(inputs, desc.fieldSchema);
      nextParams[desc.fieldName] = text;
      contextFieldMeta[desc.fieldName] = meta;
      return;
    }
    const inputs = await resolveWebSearchItems(raw, desc.fieldSchema, working);
    if (!inputs.length) return;
    contextFieldRaw[desc.fieldName] = raw;
    const { text, meta } = await resolveWebSearchFieldMulti(inputs, desc.fieldSchema);
    nextParams[desc.fieldName] = text;
    contextFieldMeta[desc.fieldName] = meta;
  });

  await Promise.all(jobs);

  for (const desc of descriptors) {
    const v = nextParams[desc.fieldName];
    if (v != null && typeof v === 'object') {
      nextParams[desc.fieldName] = '';
    }
  }

  return {
    ...working,
    params: nextParams,
    state: {
      ...working.state,
      contextFieldRaw,
      contextFieldMeta,
    },
  };
}