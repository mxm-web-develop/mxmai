/**
 * 话题写作选题检索策略（queryBuilder=voiceCategoryTrend）。
 * 类别定检索域；若已有 voice_id 则叠加 search_angles 题材类型角。
 * 节目名/风格显示名不进检索（只由 extractHotTopics 合同消费）。
 */
import type { DeepSearchRequest, SearchDepth } from '../../../core/search/types';
import type { PipelineStep, TaskContext } from '../../types';
import { getContract, withContract } from '../input-stage';
import {
  buildVoiceCategoryTrendQueries,
  buildVoiceStyleTopicQueries,
  timeRangeForVoiceCategory,
  VOICE_STYLE_SEARCH_MAX,
} from '../voice-style-topics';
import { registerWebSearchQueryBuilder } from './registry';
import type { WebSearchQueryBuilder } from './types';

export function mergeVoiceCategoryParams(ctx: TaskContext): Record<string, unknown> {
  const params = { ...((ctx.params ?? {}) as Record<string, unknown>) };
  const contract = getContract(ctx);
  const basic =
    contract?.basic && typeof contract.basic === 'object'
      ? (contract.basic as Record<string, unknown>)
      : {};
  return { ...basic, ...params };
}

function resolveVoiceCategory(merged: Record<string, unknown>, step: PipelineStep): string {
  const p = (step.params ?? {}) as Record<string, unknown>;
  const mapping =
    p.fieldMapping && typeof p.fieldMapping === 'object' && !Array.isArray(p.fieldMapping)
      ? (p.fieldMapping as Record<string, unknown>)
      : {};
  const fromKey = String(p.categoryFrom ?? mapping.voiceCategory ?? mapping.category ?? '').trim();
  if (fromKey) {
    const v = String(merged[fromKey] ?? '').trim();
    if (v) return v;
  }
  return String(merged.voice_category ?? merged.voiceCategory ?? '').trim();
}

function resolveVoiceId(merged: Record<string, unknown>, step: PipelineStep): string {
  const p = (step.params ?? {}) as Record<string, unknown>;
  const mapping =
    p.fieldMapping && typeof p.fieldMapping === 'object' && !Array.isArray(p.fieldMapping)
      ? (p.fieldMapping as Record<string, unknown>)
      : {};
  const fromKey = String(p.voiceIdFrom ?? mapping.voiceId ?? mapping.voice_id ?? '').trim();
  if (fromKey) {
    const v = String(merged[fromKey] ?? '').trim();
    if (v) return v;
  }
  return String(merged.voice_id ?? merged.voiceId ?? '').trim();
}

function resolveLanguage(merged: Record<string, unknown>): string {
  return String(merged.language ?? 'zh').trim() || 'zh';
}

/** 有 voice_id → 类别域 + 风格题材角；否则仅类别域 */
function buildTrendQueries(merged: Record<string, unknown>, step: PipelineStep) {
  const voiceCategory = resolveVoiceCategory(merged, step);
  const voiceId = resolveVoiceId(merged, step);
  const language = resolveLanguage(merged);
  if (voiceId) {
    const built = buildVoiceStyleTopicQueries({ voiceCategory, voiceId, language });
    return {
      primary: built.primary,
      queries: built.queries,
      voiceCategory,
      voiceId,
    };
  }
  const built = buildVoiceCategoryTrendQueries({ voiceCategory, language });
  return {
    primary: built.primary,
    queries: built.queries,
    voiceCategory,
    voiceId: '',
  };
}

const voiceCategoryTrendBuilder: WebSearchQueryBuilder = {
  name: 'voiceCategoryTrend',

  buildQuery(ctx, step) {
    const merged = { ...mergeVoiceCategoryParams(ctx), ...((step.params ?? {}) as Record<string, unknown>) };
    return buildTrendQueries(merged, step).primary;
  },

  buildRequest(ctx, step, query, opts) {
    const params = (step.params ?? {}) as Record<string, unknown>;
    const merged = { ...mergeVoiceCategoryParams(ctx), ...params };
    const voiceCategory = resolveVoiceCategory(merged, step);
    const depthRaw = typeof params.depth === 'string' ? params.depth.trim() : '';
    const depth: SearchDepth =
      depthRaw === 'quick' || depthRaw === 'standard' || depthRaw === 'deep'
        ? (depthRaw as SearchDepth)
        : 'standard';
    return {
      query,
      dimensions: ['web'],
      depth,
      numResults: Math.min(opts.maxResults, VOICE_STYLE_SEARCH_MAX),
      timeRange: timeRangeForVoiceCategory(voiceCategory),
      language: resolveLanguage(merged) === 'zh' ? 'zh' : 'all',
    } satisfies DeepSearchRequest;
  },

  async prepareContext(ctx, step) {
    const merged = mergeVoiceCategoryParams(ctx);
    const voiceCategory = resolveVoiceCategory(merged, step);
    const voiceId = resolveVoiceId(merged, step);
    if (!voiceCategory && !voiceId) return ctx;
    let next: TaskContext = {
      ...ctx,
      params: {
        ...ctx.params,
        ...(voiceCategory ? { voice_category: voiceCategory } : {}),
        ...(voiceId ? { voice_id: voiceId } : {}),
      },
    };
    const c = getContract(next);
    if (c) {
      next = withContract(next, {
        ...c,
        basic: {
          ...c.basic,
          ...(voiceCategory ? { voice_category: voiceCategory } : {}),
          ...(voiceId ? { voice_id: voiceId } : {}),
        },
      });
    }
    return next;
  },

  async runMultiQuery({ ctx, step, searchRequest, searchFn, maxResults, primaryQuery }) {
    const merged = { ...mergeVoiceCategoryParams(ctx), ...((step.params ?? {}) as Record<string, unknown>) };
    const built = buildTrendQueries(merged, step);
    const queries = built.queries.length > 0 ? built.queries : [primaryQuery];
    const queryLabel = queries.join(' | ') || primaryQuery;
    const seen = new Set<string>();
    const allItems: Array<{ title?: string; url?: string; snippet?: string; domain?: string }> = [];
    const prov = new Set<string>();
    const cap = Math.min(maxResults, VOICE_STYLE_SEARCH_MAX);
    const results = await Promise.all(
      queries.map((q) =>
        searchFn({
          ...searchRequest,
          query: q,
          numResults: Math.ceil(cap / Math.max(1, queries.length)),
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
        if (allItems.length >= cap) break;
      }
      if (allItems.length >= cap) break;
    }
    return {
      items: allItems.slice(0, cap),
      providers: [...prov],
      queryLabel,
    };
  },
};

export function registerVoiceCategoryTrendQueryBuilder(): void {
  registerWebSearchQueryBuilder(voiceCategoryTrendBuilder);
}

registerVoiceCategoryTrendQueryBuilder();
