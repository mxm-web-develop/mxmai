/**
 * 管线步骤：groupItemBatch — 平台通用「组内数组项并发回填」（enrich / post）。
 *
 * group 合同形状：business 下某列为同构对象数组；本节点在同任务内并发处理每一项
 * （检索 / nestedText 填字段 / 可选 LLM 成稿），结果写回数组，不另建子任务。
 *
 * 业务差异只允许通过节点配置表达（见 docs/adr/pipeline-reusable-steps.md）：
 * - itemsFrom:         列表路径（contract. / state. / params.），如 "contract.business.variants"
 * - concurrency:       并发度（默认 3，硬上限 8）
 * - maxItems:          处理上限（默认 12，硬上限 48）
 * - itemBasicMapping:  写入每项临时合同 basic 的模板（${item.*} / ${contract.*} / ${params.*}）
 * - itemWebSearch:     可选；同 webSearch 节点参数，queryTemplate 支持 ${item.*}
 * - itemNestedText:    可选；{ nestedTextTaskKey, field_specs?, inputMapping? }
 *                      expert 默认把 JSON 合并进「该项」本身（不是父 business 对象）
 * - itemManuscript:    可选；{ field, systemPrompt?, mode? }
 *                      mode='assemble'：由 title/bullets/body 确定性拼 Markdown（演示文稿用，禁止二次 LLM 写设计规范）
 *                      默认 mode='llm'：systemPrompt 成稿；如需 LLM 改写，请挂 pipeline.post polishManuscript
 * - commonGroundFrom:  可选路径，并入每项临时 basic.common_ground（默认 contract.business.common_ground）
 *
 * 与 groupFanout 区别：本节点同步等待、同任务合并；fanout 是异步派发独立子任务。
 */
import type { PipelineStep, TaskContext, TaskRunV2Request } from './types';
import { ConfigurationError } from './errors';
import type { MxmWarpContract } from './mxm-warp/contract-types';
import { buildManuscriptLanguageDirective } from './mxm-warp/manuscript-language-directive';

const DEFAULT_MAX_ITEMS = 12;
const HARD_MAX_ITEMS = 48;
const DEFAULT_CONCURRENCY = 3;
const HARD_CONCURRENCY = 8;
const SINGLE_PLACEHOLDER_RE = /^\$\{([^}]+)\}$/;

export interface GroupItemBatchItemResult {
  index: number;
  label: string;
  status: 'ready' | 'failed';
  error?: string;
}

export interface GroupItemBatchResult {
  itemsFrom: string;
  total: number;
  readyCount: number;
  failedCount: number;
  items: GroupItemBatchItemResult[];
}

function readByPath(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const seg of path.split('.').filter(Boolean)) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

function writeByPath(root: Record<string, unknown>, path: string, value: unknown): void {
  const segs = path.split('.').filter(Boolean);
  if (segs.length === 0) return;
  let cur: Record<string, unknown> = root;
  for (let i = 0; i < segs.length - 1; i++) {
    const seg = segs[i]!;
    const next = cur[seg];
    if (!next || typeof next !== 'object' || Array.isArray(next)) {
      cur[seg] = {};
    }
    cur = cur[seg] as Record<string, unknown>;
  }
  cur[segs[segs.length - 1]!] = value;
}

export function resolveGroupItemTemplate(
  ctx: TaskContext,
  item: Record<string, unknown>,
  index: number,
  total: number,
  template: string
): unknown {
  const trimmed = template.trim();
  const single = trimmed.match(SINGLE_PLACEHOLDER_RE);
  if (single) {
    return resolveItemPath(ctx, item, index, total, single[1]!) ?? '';
  }
  return template.replace(/\$\{([^}]+)\}/g, (_m, rawPath: string) => {
    const v = resolveItemPath(ctx, item, index, total, rawPath);
    if (v == null) return '';
    return typeof v === 'object' ? JSON.stringify(v) : String(v);
  });
}

function resolveItemPath(
  ctx: TaskContext,
  item: Record<string, unknown>,
  index: number,
  total: number,
  rawPath: string
): unknown {
  const path = rawPath.trim();
  if (path === 'itemJson') return JSON.stringify(item);
  if (path === 'index') return index + 1;
  if (path === 'total') return total;
  if (path === 'item') return item;
  if (path.startsWith('item.')) return readByPath(item, path.slice('item.'.length));
  if (path.startsWith('contract.')) {
    return readByPath(ctx.state.contract, path.slice('contract.'.length));
  }
  if (path.startsWith('params.')) return readByPath(ctx.params, path.slice('params.'.length));
  if (path.startsWith('state.')) return readByPath(ctx.state, path.slice('state.'.length));
  return undefined;
}

function readItemsList(ctx: TaskContext, itemsFrom: string): {
  parent: Record<string, unknown> | null;
  listKey: string | null;
  items: Record<string, unknown>[];
  absolutePath: string;
} {
  const path = itemsFrom.trim();
  let raw: unknown;
  let parent: Record<string, unknown> | null = null;
  let listKey: string | null = null;

  if (path.startsWith('contract.')) {
    const sub = path.slice('contract.'.length);
    const segs = sub.split('.').filter(Boolean);
    const contract =
      ctx.state.contract && typeof ctx.state.contract === 'object'
        ? (ctx.state.contract as Record<string, unknown>)
        : null;
    if (!contract) {
      return { parent: null, listKey: null, items: [], absolutePath: path };
    }
    if (segs.length === 1) {
      raw = contract[segs[0]!];
      parent = contract;
      listKey = segs[0]!;
    } else {
      const parentPath = segs.slice(0, -1).join('.');
      parent = readByPath(contract, parentPath) as Record<string, unknown> | null;
      listKey = segs[segs.length - 1]!;
      raw = parent && typeof parent === 'object' ? parent[listKey] : undefined;
    }
  } else if (path.startsWith('state.')) {
    raw = readByPath(ctx.state, path.slice('state.'.length));
  } else if (path.startsWith('params.')) {
    raw = readByPath(ctx.params, path.slice('params.'.length));
  } else {
    throw new ConfigurationError(
      `groupItemBatch.itemsFrom 路径必须以 contract. / state. / params. 开头，收到：${itemsFrom}`
    );
  }

  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw) as unknown;
    } catch {
      /* ignore */
    }
  }
  if (!Array.isArray(raw)) {
    return { parent, listKey, items: [], absolutePath: path };
  }
  const items = raw.filter(
    (it): it is Record<string, unknown> => !!it && typeof it === 'object' && !Array.isArray(it)
  );
  return { parent, listKey, items, absolutePath: path };
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (!items.length) return [];
  const limit =
    !Number.isFinite(concurrency) || concurrency >= items.length
      ? items.length
      : Math.max(1, Math.floor(concurrency));
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await worker(items[i]!, i);
      }
    })
  );
  return out;
}

function cloneJson<T>(v: T): T {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(v);
  }
  return JSON.parse(JSON.stringify(v)) as T;
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    const direct = JSON.parse(trimmed) as unknown;
    if (direct && typeof direct === 'object' && !Array.isArray(direct)) {
      return direct as Record<string, unknown>;
    }
  } catch {
    /* try fence */
  }
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) {
    try {
      const inner = JSON.parse(fence[1].trim()) as unknown;
      if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
        return inner as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return null;
}

/** 分路检索证据挂在 item 上，供后续 batch（成稿导演 / output 成稿）复用 */
const ITEM_SOURCES_KEY = '_warpSources';
const ITEM_ENRICH_SEARCH_KEY = '_warpEnrichSearch';

function buildItemContract(
  parent: MxmWarpContract,
  item: Record<string, unknown>,
  basicOverlay: Record<string, unknown>
): MxmWarpContract {
  const itemSources = item[ITEM_SOURCES_KEY];
  const itemEnrich = item[ITEM_ENRICH_SEARCH_KEY];
  return {
    meta: { ...parent.meta },
    basic: {
      ...parent.basic,
      ...basicOverlay,
    },
    business: {},
    sources:
      itemSources && typeof itemSources === 'object'
        ? cloneJson(itemSources)
        : cloneJson(parent.sources ?? {}),
    assets: cloneJson(parent.assets ?? {}),
    enrich_search:
      itemEnrich && typeof itemEnrich === 'object' ? cloneJson(itemEnrich) : {},
  };
}

function resolveItemBasicMapping(
  ctx: TaskContext,
  item: Record<string, unknown>,
  index: number,
  total: number,
  mapping: Record<string, string> | undefined,
  commonGround: unknown
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (mapping && typeof mapping === 'object') {
    for (const [k, tmpl] of Object.entries(mapping)) {
      if (typeof tmpl !== 'string') continue;
      out[k] = resolveGroupItemTemplate(ctx, item, index, total, tmpl);
    }
  }
  if (commonGround != null && out.common_ground == null) {
    out.common_ground = commonGround;
  }
  return out;
}

export async function runGroupItemBatchStep(
  ctx: TaskContext,
  step: PipelineStep
): Promise<TaskContext> {
  const userId = ctx.userId;
  if (!userId) throw new ConfigurationError('groupItemBatch：缺少 userId');

  const params = (step.params ?? {}) as Record<string, unknown>;
  const itemsFrom = String(params.itemsFrom ?? 'contract.business.variants').trim();
  const listed = readItemsList(ctx, itemsFrom);
  if (listed.items.length === 0) {
    throw new ConfigurationError(`groupItemBatch：${itemsFrom} 为空或不是对象数组`);
  }

  const maxItemsRaw = Number(params.maxItems ?? DEFAULT_MAX_ITEMS);
  const maxItems = Math.min(
    HARD_MAX_ITEMS,
    Number.isFinite(maxItemsRaw) && maxItemsRaw >= 1 ? Math.floor(maxItemsRaw) : DEFAULT_MAX_ITEMS
  );
  const concurrencyRaw = Number(params.concurrency ?? DEFAULT_CONCURRENCY);
  const concurrency = Math.min(
    HARD_CONCURRENCY,
    Number.isFinite(concurrencyRaw) && concurrencyRaw >= 1
      ? Math.floor(concurrencyRaw)
      : DEFAULT_CONCURRENCY
  );

  const items = listed.items.slice(0, maxItems).map((it) => cloneJson(it));
  const total = items.length;

  const itemBasicMapping =
    params.itemBasicMapping &&
    typeof params.itemBasicMapping === 'object' &&
    !Array.isArray(params.itemBasicMapping)
      ? (params.itemBasicMapping as Record<string, string>)
      : undefined;

  const commonGroundFrom = String(
    params.commonGroundFrom ?? 'contract.business.common_ground'
  ).trim();
  const commonGround = commonGroundFrom.startsWith('contract.')
    ? readByPath(ctx.state.contract, commonGroundFrom.slice('contract.'.length))
    : commonGroundFrom.startsWith('state.')
      ? readByPath(ctx.state, commonGroundFrom.slice('state.'.length))
      : undefined;

  const itemWebSearch =
    params.itemWebSearch && typeof params.itemWebSearch === 'object' && !Array.isArray(params.itemWebSearch)
      ? (params.itemWebSearch as Record<string, unknown>)
      : null;

  const itemNestedText =
    params.itemNestedText &&
    typeof params.itemNestedText === 'object' &&
    !Array.isArray(params.itemNestedText)
      ? (params.itemNestedText as Record<string, unknown>)
      : null;

  const itemManuscript =
    params.itemManuscript &&
    typeof params.itemManuscript === 'object' &&
    !Array.isArray(params.itemManuscript)
      ? (params.itemManuscript as Record<string, unknown>)
      : null;

  const parentContract = ctx.state.contract as MxmWarpContract | undefined;
  if (!parentContract || typeof parentContract !== 'object') {
    throw new ConfigurationError('groupItemBatch：缺少 state.contract');
  }

  const { runWebSearchStep } = itemWebSearch
    ? await import('./mxm-warp/web-search-step')
    : { runWebSearchStep: null as null | typeof import('./mxm-warp/web-search-step').runWebSearchStep };
  const needsTextRunner = Boolean(itemNestedText);
  const { runTaskV2 } = needsTextRunner
    ? await import('./task-engine')
    : { runTaskV2: null as null | typeof import('./task-engine').runTaskV2 };
  const { parseNestedTextTaskKey } = needsTextRunner
    ? await import('./business-pipeline')
    : {
        parseNestedTextTaskKey: null as null | typeof import('./business-pipeline').parseNestedTextTaskKey,
      };
  const { createWarpLlmAdapter } = itemManuscript
    ? await import('./mxm-warp/llm-adapter')
    : {
        createWarpLlmAdapter: null as null | typeof import('./mxm-warp/llm-adapter').createWarpLlmAdapter,
      };

  const modelKey = String(ctx.params.logicalModel ?? ctx.params.model ?? '').trim();
  const provider = String(ctx.params.provider ?? '').trim();

  const results = await mapPool(items, concurrency, async (item, index) => {
    const label =
      String(item.name ?? item.id ?? item.title ?? '').trim() || `item ${index + 1}/${total}`;
    try {
      const basicOverlay = resolveItemBasicMapping(
        ctx,
        item,
        index,
        total,
        itemBasicMapping,
        commonGround
      );
      let itemContract = buildItemContract(parentContract, item, basicOverlay);

      let itemCtx: TaskContext = {
        ...ctx,
        params: { ...ctx.params },
        state: {
          ...ctx.state,
          contract: itemContract,
        },
      };

      if (itemWebSearch && runWebSearchStep) {
        const tmpl = String(itemWebSearch.queryTemplate ?? '').trim();
        const query = tmpl
          ? String(resolveGroupItemTemplate(ctx, item, index, total, tmpl)).trim()
          : String(itemWebSearch.query ?? '').trim();
        if (!query) {
          throw new Error('itemWebSearch 未解析出 query');
        }
        itemCtx = await runWebSearchStep(itemCtx, {
          step: 'webSearch',
          params: {
            ...itemWebSearch,
            query,
            queryTemplate: undefined,
            target: 'sources.websource',
          },
        });
        itemContract = itemCtx.state.contract as MxmWarpContract;
        // 写回数组项，避免下一阶段（output 成稿）丢失分路证据
        item[ITEM_SOURCES_KEY] = cloneJson(itemContract.sources ?? {});
        item[ITEM_ENRICH_SEARCH_KEY] = cloneJson(itemContract.enrich_search ?? {});
      }

      if (itemNestedText && runTaskV2 && parseNestedTextTaskKey) {
        const key = String(itemNestedText.nestedTextTaskKey ?? '').trim();
        if (!key.startsWith('text/')) {
          throw new Error(`itemNestedText.nestedTextTaskKey 须为 text/*，收到：${key || '空'}`);
        }
        const { taskKey, subtype } = parseNestedTextTaskKey(key);
        const fieldSpecs = itemNestedText.field_specs;
        const depth = Number((ctx.params as Record<string, unknown>)._pipelineDepth ?? 0) + 1;
        const req: TaskRunV2Request = {
          scope: 'text',
          taskKey,
          subtype,
          params: {
            contract: itemContract,
            field_specs: Array.isArray(fieldSpecs) ? fieldSpecs : [],
            _pipelineDepth: depth,
            metadata: {
              parentPipelineTaskId: ctx.taskId,
              nestedTextTaskKey: key,
              groupItemIndex: index + 1,
              groupItemTotal: total,
            },
          },
        };
        const textRes = await runTaskV2(req, userId);
        if (!textRes.success || !textRes.syncResult) {
          throw new Error(
            `nestedText 失败：${key}（status=${textRes.status}，taskId=${textRes.taskId}）`
          );
        }
        const parsed = parseJsonObject(textRes.syncResult.text ?? '');
        if (parsed) {
          let { sanitizeDeckSlideFillPatch } = {
            sanitizeDeckSlideFillPatch: null as null | typeof import('../core/presentation/deck-ir').sanitizeDeckSlideFillPatch,
          };
          try {
            ({ sanitizeDeckSlideFillPatch } = await import('../core/presentation/deck-ir'));
          } catch {
            /* optional */
          }
          const cleaned = sanitizeDeckSlideFillPatch
            ? sanitizeDeckSlideFillPatch(parsed, item)
            : parsed;
          Object.assign(item, cleaned);
          itemContract = {
            ...itemContract,
            business: { ...itemContract.business, ...cleaned },
          };
        }
      }

      if (itemManuscript) {
        const field = String(itemManuscript.field ?? 'manuscript').trim() || 'manuscript';
        const mode = String(itemManuscript.mode ?? 'llm').trim().toLowerCase();
        if (mode === 'assemble' || mode === 'from_slide' || mode === 'deterministic') {
          const { assembleSlideManuscriptMarkdown } = await import('../core/presentation/deck-ir');
          item[field] = assembleSlideManuscriptMarkdown(item);
        } else if (createWarpLlmAdapter) {
        let systemPrompt = String(itemManuscript.systemPrompt ?? '').trim();
        if (!systemPrompt) {
          throw new Error(
            'itemManuscript.systemPrompt 不能为空（Core Skill 业务应由 warp-runner 注入 SKILL+references）'
          );
        }
        if (!modelKey || !provider) {
          throw new Error('itemManuscript 需要宿主 params.model / params.provider（或 logicalModel）');
        }
        const llm = createWarpLlmAdapter({
          scope: 'writing',
          modelKey,
          provider,
        });
        const manuscriptContract: MxmWarpContract = {
          ...itemContract,
          business: { ...itemContract.business, ...item },
          basic: {
            ...itemContract.basic,
            ...basicOverlay,
          },
        };
        const lang = String(
          basicOverlay.language ?? itemContract.basic?.language ?? 'zh'
        ).trim();
        const languageDirective = buildManuscriptLanguageDirective(lang);
        const { sliceContractForSkill } = await import('./skill/context');
        const text = await llm({
          system: `${systemPrompt}\n\n${languageDirective}`,
          user: JSON.stringify(
            { contract: sliceContractForSkill(manuscriptContract as unknown as Record<string, unknown>) },
            null,
            2
          ),
          ctx: itemCtx,
        });
        let manuscript = text.trim();
        if (!manuscript) {
          throw new Error('itemManuscript LLM 未返回正文');
        }

        // 确定性抛光：标点、近重复段、元话语/套话等（不改事实）
        // LLM 改写请经 pipeline.post: [{ step: "polishManuscript", nestedTextTaskKey: "text/transform/prose-deai" }]
        try {
          const { polishEditorialMarkdown } = await import('./mxm-warp/markdown-polish');
          manuscript = polishEditorialMarkdown(manuscript, { language: lang }).trim();
        } catch (polishErr) {
          console.warn('[groupItemBatch] deterministicPolish 跳过:', polishErr);
        }
        // seek 成稿：补缺标题、控粗体、拆墙字（不改事实）
        try {
          const { normalizeSeekManuscript } = await import('./mxm-warp/seek-manuscript-normalize');
          const topicFallback = String(
            basicOverlay.topic ??
              itemContract.basic?.topic ??
              item.topic ??
              ''
          ).trim();
          const voiceId = String(
            basicOverlay.voice_id ?? item.voice_id ?? itemContract.basic?.voice_id ?? ''
          ).trim();
          manuscript = normalizeSeekManuscript(manuscript, {
            fallbackTitle: topicFallback || undefined,
            voiceId: voiceId || undefined,
          }).trim();
        } catch (seekNormErr) {
          console.warn('[groupItemBatch] seekManuscriptNormalize 跳过:', seekNormErr);
        }
        // 演示文稿脏稿兜底：若 LLM 仍吐出 HTML/设计规范，回退 IR 拼装
        try {
          const { looksLikeSlideMarkupGarbage, assembleSlideManuscriptMarkdown } = await import(
            '../core/presentation/deck-ir'
          );
          if (looksLikeSlideMarkupGarbage(manuscript)) {
            manuscript = assembleSlideManuscriptMarkdown(item);
          }
        } catch {
          /* optional */
        }
        item[field] = manuscript;
        }
      }

      items[index] = item;
      return { index: index + 1, label, status: 'ready' as const };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error(`[groupItemBatch] #${index + 1}/${total}「${label}」失败:`, err);
      return { index: index + 1, label, status: 'failed' as const, error };
    }
  });

  const ready = results.filter((r) => r.status === 'ready');
  const failed = results.filter((r) => r.status === 'failed');
  if (ready.length === 0) {
    const sample = failed[0]?.error ?? '未知错误';
    throw new Error(`groupItemBatch：全部数组项失败（${failed.length}）：${sample}`);
  }
  if (failed.length > 0) {
    console.warn(
      `[groupItemBatch] 部分失败 ${failed.length}/${total}（taskId=${ctx.taskId}），已保留 ${ready.length} 项`
    );
  }

  // 写回合同数组（保留未处理的尾项）
  const nextContract = cloneJson(parentContract) as Record<string, unknown>;
  const fullList = Array.isArray(readByPath(nextContract, itemsFrom.replace(/^contract\./, '')))
    ? ([...(readByPath(nextContract, itemsFrom.replace(/^contract\./, '')) as unknown[])] as unknown[])
    : [...listed.items];
  for (let i = 0; i < items.length; i++) {
    fullList[i] = items[i];
  }
  if (itemsFrom.startsWith('contract.')) {
    writeByPath(nextContract, itemsFrom.slice('contract.'.length), fullList);
  }

  const batchResult: GroupItemBatchResult = {
    itemsFrom,
    total,
    readyCount: ready.length,
    failedCount: failed.length,
    items: results,
  };

  const nestedUsage = Array.isArray(ctx.state.pipelineNestedUsage)
    ? [...(ctx.state.pipelineNestedUsage as unknown[])]
    : [];

  return {
    ...ctx,
    state: {
      ...ctx.state,
      contract: nextContract,
      groupItemBatchResult: batchResult,
      pipelineNestedUsage: nestedUsage,
    },
  };
}
