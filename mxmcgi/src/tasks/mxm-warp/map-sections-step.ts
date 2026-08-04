/**
 * 平台原语 mapSections：对合同内数组字段逐项 fan-out nestedText，再 merge 回数组。
 * 用于长文 L2/L3（如行业日报 body_sections），禁止单次 LLM 交付整本。
 *
 * params:
 * - itemsFrom: 相对合同路径，默认 business.body_sections
 * - nestedTextTaskKey: 必填 text/*
 * - claimPaths / evidenceKeys / evidenceMaxChars / field_specs / commitPaths：透传 nestedText
 * - concurrency / maxItems
 * - sectionField: 写入迷你合同时的数组字段名（默认取 itemsFrom 末段，通常 body_sections）
 */
import type { PipelineStep, TaskContext } from '../types';
import { ConfigurationError } from '../errors';
import { getContract, withContract } from './input-stage';
import { registerInputStep } from '../pipeline-registry';
// 注意：勿静态 import business-pipeline-steps（易循环依赖）；运行时动态加载 runNestedTextStep

const DEFAULT_CONCURRENCY = 2;
const HARD_CONCURRENCY = 6;
const DEFAULT_MAX_ITEMS = 12;
const HARD_MAX_ITEMS = 24;

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
    if (!next || typeof next !== 'object' || Array.isArray(next)) cur[seg] = {};
    cur = cur[seg] as Record<string, unknown>;
  }
  cur[segs[segs.length - 1]!] = value;
}

function normalizeItemsFrom(raw: string): string {
  let p = String(raw ?? '').trim() || 'business.body_sections';
  if (p.startsWith('contract.')) p = p.slice('contract.'.length);
  if (p.startsWith('state.contract.')) p = p.slice('state.contract.'.length);
  return p;
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function runMapSectionsStep(
  ctx: TaskContext,
  step: PipelineStep
): Promise<TaskContext> {
  const params = (step.params ?? {}) as Record<string, unknown>;
  const nestedKey = String(
    params.nestedTextTaskKey ?? step.nestedTextTaskKey ?? ''
  ).trim();
  if (!nestedKey.startsWith('text/')) {
    throw new ConfigurationError('mapSections 需要 params.nestedTextTaskKey（text/*）');
  }

  const claimPaths = Array.isArray(params.claimPaths)
    ? params.claimPaths.map((p) => String(p ?? '').trim()).filter(Boolean)
    : [];
  if (claimPaths.length === 0 && params.allowWholesaleContract !== true) {
    throw new ConfigurationError(
      'mapSections 必须配置 claimPaths（L1）；禁止无领取声明的整包投喂'
    );
  }

  const contract = getContract(ctx);
  if (!contract || typeof contract !== 'object') {
    throw new ConfigurationError('mapSections：缺少 state.contract');
  }
  const itemsFrom = normalizeItemsFrom(String(params.itemsFrom ?? 'business.body_sections'));
  const rawItems = readByPath(contract, itemsFrom);
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return ctx;
  }

  const maxItems = Math.min(
    HARD_MAX_ITEMS,
    Math.max(
      1,
      Math.floor(
        typeof params.maxItems === 'number' && Number.isFinite(params.maxItems)
          ? Number(params.maxItems)
          : DEFAULT_MAX_ITEMS
      )
    )
  );
  const concurrency = Math.min(
    HARD_CONCURRENCY,
    Math.max(
      1,
      Math.floor(
        typeof params.concurrency === 'number' && Number.isFinite(params.concurrency)
          ? Number(params.concurrency)
          : DEFAULT_CONCURRENCY
      )
    )
  );

  const items = (rawItems as unknown[]).slice(0, maxItems).map((it, i) => {
    if (it && typeof it === 'object' && !Array.isArray(it)) {
      return { ...(it as Record<string, unknown>) };
    }
    return { id: `section_${i + 1}`, value: it };
  });

  const sectionField =
    String(params.sectionField ?? '').trim() ||
    itemsFrom.split('.').filter(Boolean).slice(-1)[0] ||
    'body_sections';

  const nestedStepBase: PipelineStep = {
    step: 'nestedText',
    nestedTextTaskKey: nestedKey,
    // expert/plan/validation 用 contract；transform 走 input+instruction（mapSections 主要用于 expert）
    inputMapping: nestedKey.includes('/transform/')
      ? undefined
      : { contract: '${state.contract}' },
    params: {
      outputTarget: 'business',
      claimPaths,
      evidenceKeys: params.evidenceKeys,
      evidenceMaxChars: params.evidenceMaxChars,
      field_specs: params.field_specs,
      commitPaths:
        params.commitPaths ??
        (Array.isArray(params.field_specs)
          ? (params.field_specs as Array<{ name?: string }>)
              .map((s) => String(s?.name ?? '').trim())
              .filter(Boolean)
          : [sectionField]),
    },
  };

  const { runNestedTextStep } = await import('../business-pipeline-steps');

  const enriched = await mapPool(items, concurrency, async (item, index) => {
    const miniContract = JSON.parse(JSON.stringify(contract)) as Record<string, unknown>;
    writeByPath(miniContract, itemsFrom, [item]);
    // 标注当前段，便于模板/调试
    const basic =
      miniContract.basic && typeof miniContract.basic === 'object'
        ? { ...(miniContract.basic as Record<string, unknown>) }
        : {};
    basic._map_section_index = index;
    basic._map_section_total = items.length;
    miniContract.basic = basic;

    const itemCtx: TaskContext = withContract(ctx, miniContract as never);
    const after = await runNestedTextStep(itemCtx, nestedStepBase);
    const afterContract = getContract(after);
    const biz =
      afterContract && typeof afterContract === 'object'
        ? ((afterContract as { business?: Record<string, unknown> }).business ?? {})
        : {};

    // expert 常把 field_specs 字段写在 business 根上；合并回当前段，避免 commitPaths=variants 时丢回填
    const fieldPatch: Record<string, unknown> = {};
    if (Array.isArray(params.field_specs)) {
      for (const spec of params.field_specs as Array<{ name?: unknown }>) {
        const name = String(spec?.name ?? '').trim();
        if (!name) continue;
        if (biz && Object.prototype.hasOwnProperty.call(biz, name) && biz[name] != null) {
          fieldPatch[name] = biz[name];
        }
      }
    }

    const arr = readByPath(afterContract, itemsFrom);
    if (Array.isArray(arr) && arr[0] && typeof arr[0] === 'object') {
      return { ...(arr[0] as Record<string, unknown>), ...fieldPatch };
    }
    if (biz && typeof biz === 'object' && Array.isArray(biz[sectionField])) {
      const sec = (biz[sectionField] as unknown[])[0];
      if (sec && typeof sec === 'object') {
        return { ...(sec as Record<string, unknown>), ...fieldPatch };
      }
    }
    return { ...item, ...fieldPatch };
  });

  const nextContract = JSON.parse(JSON.stringify(contract)) as Record<string, unknown>;
  // 保留未被处理的尾部项
  const rest = (rawItems as unknown[]).slice(items.length);
  writeByPath(nextContract, itemsFrom, [...enriched, ...rest]);

  let next = withContract(ctx, nextContract as never);
  const usage = Array.isArray(next.state.pipelineNestedUsage)
    ? [...(next.state.pipelineNestedUsage as unknown[])]
    : [];
  usage.push({
    purpose: 'mapSections',
    itemsFrom,
    mapped: enriched.length,
    concurrency,
  });
  next = {
    ...next,
    state: {
      ...next.state,
      pipelineNestedUsage: usage,
      mapSectionsLast: { itemsFrom, mapped: enriched.length },
    },
  };
  return next;
}

let registered = false;
export function registerMapSectionsStep(): void {
  if (registered) return;
  registered = true;
  registerInputStep('mapSections', async (ctx, step) => runMapSectionsStep(ctx, step));
}

registerMapSectionsStep();
