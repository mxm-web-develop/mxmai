/**
 * enrich 确定性步骤：pruneToSelection — 无 LLM。
 * 用户选题后，把 discovery 大检索池裁成仅与已选话题相关的证据；未选题材料抛弃。
 *
 * params（均可选）：
 * - sourceFields?: string[]  默认 ['core_topic','main_topic']
 * - websourcePath?: 合同路径，默认 sources.websource
 * - evidenceKey?: 默认 websource
 * - archiveDiscovery?: boolean 默认 **false** —— 未选题发现池直接丢弃；仅调试时可 true 归档到 websource_discovery
 * - minKeptItems?: number  默认 0；>0 时 kept 不足会抛错（除非 softMinKept）
 * - softMinKept?: boolean  默认 false；true 时 kept 不足只告警，不中断（后续 enrich 会按选题补检索）
 */
import type { PipelineStep, TaskContext } from '../types';
import { registerInputStep, registerOutputStep } from '../pipeline-registry';
import { ConfigurationError } from '../errors';
import { getContract, withContract } from './input-stage';
import {
  getEvidence,
  putEvidence,
  resolveWebsourcePayload,
  slimWebSearchForContract,
} from './evidence';
import {
  normalizeSelectedTopics,
  pruneWebsourceToSelection,
  type PruneWebsourcePayload,
} from './prune-to-selection';

function readBasicAndParams(ctx: TaskContext): Record<string, unknown> {
  const contract = getContract(ctx);
  const basic =
    contract?.basic && typeof contract.basic === 'object'
      ? (contract.basic as Record<string, unknown>)
      : {};
  return { ...basic, ...((ctx.params ?? {}) as Record<string, unknown>) };
}

function collectSelectedTopics(
  merged: Record<string, unknown>,
  sourceFields: string[]
): string[] {
  const raws = sourceFields.map((f) => merged[f]);
  return normalizeSelectedTopics(raws);
}

export async function runPruneToSelectionStep(
  ctx: TaskContext,
  step: PipelineStep
): Promise<TaskContext> {
  const contract = getContract(ctx);
  if (!contract) return ctx;

  const params = (step.params ?? {}) as Record<string, unknown>;
  const sourceFields = Array.isArray(params.sourceFields)
    ? params.sourceFields.map((x) => String(x ?? '').trim()).filter(Boolean)
    : ['core_topic', 'main_topic'];
  const evidenceKey =
    String(params.evidenceKey ?? '').trim() || 'websource';
  const archiveDiscovery = params.archiveDiscovery === true;
  const softMinKept =
    params.softMinKept === true ||
    params.softMinKept === 1 ||
    String(params.softMinKept ?? '').trim().toLowerCase() === 'true';
  const minKeptRaw = Number(params.minKeptItems ?? 0);
  const minKeptItems =
    Number.isFinite(minKeptRaw) && minKeptRaw > 0 ? Math.floor(minKeptRaw) : 0;

  const merged = readBasicAndParams(ctx);
  const selected = collectSelectedTopics(merged, sourceFields);

  const fullPayload =
    (resolveWebsourcePayload(ctx, contract) as PruneWebsourcePayload | undefined) ??
    (getEvidence(ctx, evidenceKey)?.payload as PruneWebsourcePayload | undefined);

  let next: TaskContext = ctx;

  // 归档发现池（可选）：后续 LLM 默认 evidencePack 不含 *_discovery
  // 同时写入 industry_overview：时段大势证据 = pre 大检索池，避免 enrich 再跑一轮同质 industryTrend
  if (archiveDiscovery && fullPayload && Array.isArray(fullPayload.items) && fullPayload.items.length > 0) {
    const already = getEvidence(ctx, 'websource_discovery');
    if (!already) {
      next = putEvidence(next, 'websource_discovery', {
        ...fullPayload,
        archivedFrom: evidenceKey,
        note: 'discovery pool archived before pruneToSelection',
      });
    }
    if (!getEvidence(next, 'industry_overview')) {
      next = putEvidence(next, 'industry_overview', {
        ...fullPayload,
        note: 'period overview evidence reused from pre discovery (no extra webSearch)',
      });
      const c0 = getContract(next)!;
      next = withContract(next, {
        ...c0,
        enrich_search: {
          ...(c0.enrich_search && typeof c0.enrich_search === 'object' ? c0.enrich_search : {}),
          industry_overview: slimWebSearchForContract(
            fullPayload as Record<string, unknown>,
            'industry_overview'
          ),
        },
      });
    }
  }

  const { pruned, keptCount, droppedCount, selectedTopics } = pruneWebsourceToSelection(
    fullPayload,
    selected
  );

  if (minKeptItems > 0 && selectedTopics.length > 0 && keptCount < minKeptItems) {
    const discoveryN = Array.isArray(fullPayload?.items) ? fullPayload!.items!.length : 0;
    const msg =
      `pruneToSelection：选题可核证据不足 kept=${keptCount} < minKeptItems=${minKeptItems}` +
      `（discovery=${discoveryN}）。selected=${selectedTopics.slice(0, 3).join('；')}`;
    if (softMinKept) {
      console.warn(`[pruneToSelection] softMinKept：${msg}；继续由 enrich 按选题补检索`);
    } else {
      throw new ConfigurationError(`${msg}。请改选话题或扩大检索后再试`);
    }
  }

  next = putEvidence(next, evidenceKey, pruned as Record<string, unknown>);

  const pointer = slimWebSearchForContract(pruned as Record<string, unknown>, evidenceKey);
  const sources = {
    ...(contract.sources && typeof contract.sources === 'object' ? { ...contract.sources } : {}),
    websource: {
      ...pointer,
      topicChips: selectedTopics,
      prunedToSelection: true,
      keptCount,
      droppedCount,
    },
  };

  const basic = {
    ...(contract.basic ?? {}),
  };

  next = withContract(next, {
    ...getContract(next)!,
    basic,
    sources,
    selection: {
      topics: selectedTopics,
      prunedAt: new Date().toISOString(),
      keptCount,
      droppedCount,
    },
  });

  return next;
}

export function registerPruneToSelectionStep(): void {
  registerInputStep('pruneToSelection', runPruneToSelectionStep);
  registerOutputStep('pruneToSelection', runPruneToSelectionStep);
}

registerPruneToSelectionStep();
