/**
 * 行业日报趋势检索策略（queryBuilder=industryTrend）。
 * 字段约定由业务 formSchema / createGuide 提供；本插件不绑定 taskKey。
 */
import type { DeepSearchRequest, SearchDepth } from '../../../core/search/types';
import type { PipelineStep, TaskContext } from '../../types';
import { getContract, withContract } from '../input-stage';
import { resolveIndustrySearchStrategy } from '../industry-search-strategy';
import {
  buildMultilingualIndustryQueries,
  preferItemsForSearchRegion,
} from '../industry-search-region';
import {
  industryDailySearchBounds,
  resolveIndustryDailyDateLabel,
} from '../industry-daily-date';
import { resolveSearchTrackForParams } from '../industry-search-track-classify';
import { registerWebSearchQueryBuilder } from './registry';
import type { WebSearchQueryBuilder } from './types';

export function mergeIndustryParams(ctx: TaskContext): Record<string, unknown> {
  const params = { ...((ctx.params ?? {}) as Record<string, unknown>) };
  const contract = getContract(ctx);
  const basic =
    contract?.basic && typeof contract.basic === 'object'
      ? (contract.basic as Record<string, unknown>)
      : {};
  return { ...basic, ...params };
}

function isOmitTopic(params: Record<string, unknown>): boolean {
  const v = params.omitTopic;
  return v === true || v === 1 || v === '1' || String(v ?? '').trim().toLowerCase() === 'true';
}

/** 日报趋势查询：行业 + 日期/周期 + 赛道后缀；omitTopic=true 时忽略 core_topic（时段大势专用） */
export function buildIndustryTrendSearchQuery(params: Record<string, unknown>): string {
  const strategy = resolveIndustrySearchStrategy(params);
  const { sector, track, searchRegion } = strategy;
  const { ymd, mode } = resolveIndustryDailyDateLabel(params);
  const topic = isOmitTopic(params) ? '' : String(params.core_topic ?? '').trim();
  const multilingual = buildMultilingualIndustryQueries({
    sector,
    track,
    region: searchRegion,
    ymd,
    dateMode: mode,
    maxQueries: 1,
  });
  const base = multilingual[0] || `${sector} ${ymd} news`.trim();
  if (!topic) return base;
  return `${base} ${topic}`.replace(/\s+/g, ' ').trim();
}

const industryTrendBuilder: WebSearchQueryBuilder = {
  name: 'industryTrend',

  buildQuery(ctx, step) {
    const stepParams = (step.params ?? {}) as Record<string, unknown>;
    return buildIndustryTrendSearchQuery({ ...mergeIndustryParams(ctx), ...stepParams });
  },

  buildRequest(ctx, step, query, opts) {
    const params = (step.params ?? {}) as Record<string, unknown>;
    const depthRaw = typeof params.depth === 'string' ? params.depth.trim() : '';
    const merged = { ...mergeIndustryParams(ctx), ...params };
    const strategy = resolveIndustrySearchStrategy(merged);
    const { ymd, mode } = resolveIndustryDailyDateLabel(merged);
    const bounds = industryDailySearchBounds(mode, ymd);
    const depth: SearchDepth =
      depthRaw === 'quick' || depthRaw === 'standard' || depthRaw === 'deep'
        ? (depthRaw as SearchDepth)
        : strategy.depth;
    return {
      query,
      dimensions: strategy.dimensions,
      depth,
      numResults: opts.maxResults,
      timeRange: bounds.timeRange,
      startDate: bounds.startDate,
      endDate: bounds.endDate,
      includeDomains: strategy.includeDomains,
      language: 'all',
    } satisfies DeepSearchRequest;
  },

  async prepareContext(ctx) {
    const merged = mergeIndustryParams(ctx);
    const dateResolved = resolveIndustryDailyDateLabel(merged);
    const trackResolved = await resolveSearchTrackForParams(merged, {
      userId: String(ctx.userId ?? '').trim() || undefined,
      parentTaskId: ctx.taskId,
      requireModelForCustom: true,
      hostScope: ctx.scope,
      hostTaskKey: ctx.taskKey,
      hostSubtype: ctx.subtype ?? null,
    });
    let next: TaskContext = {
      ...ctx,
      params: {
        ...ctx.params,
        search_track: trackResolved.track,
        report_ymd: dateResolved.ymd,
        report_date: dateResolved.ymd,
        date_mode: dateResolved.mode,
      },
    };
    const c = getContract(next);
    if (c) {
      next = withContract(next, {
        ...c,
        basic: {
          ...c.basic,
          search_track: trackResolved.track,
          report_ymd: dateResolved.ymd,
          report_date: dateResolved.ymd,
          date_label: dateResolved.dateLabel,
        },
      });
    }
    return next;
  },

  async runMultiQuery({ ctx, searchRequest, searchFn, maxResults, primaryQuery }) {
    const mergedParams = mergeIndustryParams(ctx);
    const strategy = resolveIndustrySearchStrategy(mergedParams);
    const { ymd, mode } = resolveIndustryDailyDateLabel(mergedParams);
    const highRecall = maxResults >= 40;
    const queries = buildMultilingualIndustryQueries({
      sector: strategy.sector,
      track: strategy.track,
      region: strategy.searchRegion,
      ymd,
      dateMode: mode,
      maxQueries: highRecall ? 9 : 3,
      expandAllSuffixes: highRecall,
    });
    const queryLabel = queries.join(' | ') || primaryQuery;
    const seen = new Set<string>();
    const allItems: Array<{ title?: string; url?: string; snippet?: string; domain?: string }> = [];
    const prov = new Set<string>();
    const batchSize = 3;
    for (let i = 0; i < queries.length; i += batchSize) {
      if (allItems.length >= maxResults) break;
      const batch = queries.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map((q) =>
          searchFn({
            ...searchRequest,
            query: q,
            language: 'all',
          })
        )
      );
      for (const res of results) {
        for (const p of res.providers ?? []) {
          if (p) prov.add(p);
        }
        for (const it of res.items ?? []) {
          const key = String(it.url ?? '').trim() || `${it.title}|${it.snippet}`;
          if (seen.has(key)) continue;
          seen.add(key);
          allItems.push(it);
        }
      }
    }
    return {
      items: preferItemsForSearchRegion(allItems, strategy.searchRegion),
      providers: [...prov],
      queryLabel,
    };
  },
};

export function registerIndustryTrendQueryBuilder(): void {
  registerWebSearchQueryBuilder(industryTrendBuilder);
}

registerIndustryTrendQueryBuilder();
