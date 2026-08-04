/**
 * pre 热点提取节点：在 webSearch 之后调用独立 text 业务，
 * 把大量检索条收成少量 topicChips。
 *
 * params:
 * - textKey?: string  默认 text/expert/industry-hot-topics（仅默认，非锁定）
 * - maxTopics?: number  发现池提炼条数，默认 TOPIC_POOL_DEFAULT（不再读用户 topic_count）
 * - maxInputItems?: number
 * - sectorFrom / dateModeFrom / reportDateFrom?: 字段名（默认 industry / date_mode / report_date）
 * - fieldMapping?: { sector?, dateMode?, reportDate?, voiceCategory?, voiceId? } 同义覆盖
 * - voiceCategoryFrom / voiceIdFrom?: 写作风格选题字段名（默认 voice_category / voice_id）
 */
import type { PipelineStep, TaskContext } from '../types';
import { ConfigurationError } from '../errors';
import { getContract, withContract } from './input-stage';
import { resolveIndustryDailyDateLabel } from './industry-daily-date';
import { resolveSectorLabel } from './industry-search-track-classify';
import { registerInputStep } from '../pipeline-registry';
import {
  clampTopicMaxResults,
  extractTopicChipsViaTextBusiness,
  isWritingStyleTopicExtractKey,
  TOPIC_POOL_DEFAULT,
  type WebsourcePayload,
} from '../websearch-topic-extract';
import { putEvidence, resolveWebsourcePayload, slimWebSearchForContract } from './evidence';
import { resolveVoiceStyleTopicBrief } from './voice-style-topics';

/** 仅作缺省；业务应在节点显式配置 textKey */
export const DEFAULT_HOT_TOPICS_TEXT_KEY = 'text/expert/industry-hot-topics';

function mergeParams(ctx: TaskContext): Record<string, unknown> {
  const params = { ...((ctx.params ?? {}) as Record<string, unknown>) };
  const contract = getContract(ctx);
  const basic =
    contract?.basic && typeof contract.basic === 'object'
      ? (contract.basic as Record<string, unknown>)
      : {};
  return { ...basic, ...params };
}

function readMappedField(
  merged: Record<string, unknown>,
  fieldName: string | undefined,
  fallbackKeys: string[]
): string {
  const keys = [fieldName, ...fallbackKeys].filter((k): k is string => Boolean(k && String(k).trim()));
  for (const k of keys) {
    const v = String(merged[k] ?? '').trim();
    if (v) return v;
  }
  return '';
}

export function resolveHotTopicsTextKey(step: PipelineStep): string {
  const fromParams = String(
    (step.params as Record<string, unknown> | undefined)?.textKey ??
      (step as { nestedTextTaskKey?: string }).nestedTextTaskKey ??
      ''
  ).trim();
  if (fromParams.startsWith('text/')) return fromParams;
  return DEFAULT_HOT_TOPICS_TEXT_KEY;
}

/** 解析 sector / 日期上下文；无日期字段时不调用日报日期解析 */
export function resolveHotTopicsContext(
  merged: Record<string, unknown>,
  step: PipelineStep
): {
  sector: string;
  dateMode?: string;
  dateLabel: string;
  ymd: string;
} {
  const params = (step.params ?? {}) as Record<string, unknown>;
  const mapping =
    params.fieldMapping && typeof params.fieldMapping === 'object' && !Array.isArray(params.fieldMapping)
      ? (params.fieldMapping as Record<string, unknown>)
      : {};

  const sectorFrom = String(params.sectorFrom ?? mapping.sector ?? '').trim() || undefined;
  const dateModeFrom = String(params.dateModeFrom ?? mapping.dateMode ?? '').trim() || undefined;
  const reportDateFrom = String(params.reportDateFrom ?? mapping.reportDate ?? '').trim() || undefined;

  // sector：优先映射字段，否则走 resolveSectorLabel（兼容 industry / industry_custom）
  let sector = '';
  if (sectorFrom) {
    sector = String(merged[sectorFrom] ?? '').trim();
  }
  if (!sector) {
    sector = resolveSectorLabel(merged);
  }

  const hasDateHint =
    Boolean(readMappedField(merged, dateModeFrom, ['date_mode', 'dateMode'])) ||
    Boolean(readMappedField(merged, reportDateFrom, ['report_date', 'reportDate', 'report_ymd']));

  if (!hasDateHint) {
    return { sector: sector || '综合', dateLabel: '', ymd: '' };
  }

  const dateParams: Record<string, unknown> = { ...merged };
  if (dateModeFrom) {
    dateParams.date_mode = merged[dateModeFrom] ?? merged.date_mode;
  }
  if (reportDateFrom) {
    dateParams.report_date = merged[reportDateFrom] ?? merged.report_date;
  }
  const resolved = resolveIndustryDailyDateLabel(dateParams);
  return {
    sector: sector || '综合',
    dateMode: resolved.mode,
    dateLabel: resolved.dateLabel,
    ymd: resolved.ymd,
  };
}

function resolveWritingVoiceFields(
  merged: Record<string, unknown>,
  step: PipelineStep
): { voiceCategory: string; voiceId: string } {
  const params = (step.params ?? {}) as Record<string, unknown>;
  const mapping =
    params.fieldMapping && typeof params.fieldMapping === 'object' && !Array.isArray(params.fieldMapping)
      ? (params.fieldMapping as Record<string, unknown>)
      : {};
  const voiceCategoryFrom =
    String(params.voiceCategoryFrom ?? mapping.voiceCategory ?? '').trim() || undefined;
  const voiceIdFrom = String(params.voiceIdFrom ?? mapping.voiceId ?? '').trim() || undefined;
  return {
    voiceCategory: readMappedField(merged, voiceCategoryFrom, [
      'voice_category',
      'voiceCategory',
    ]),
    voiceId: readMappedField(merged, voiceIdFrom, ['voice_id', 'voiceId']),
  };
}

export async function runExtractHotTopicsStep(
  ctx: TaskContext,
  step: PipelineStep
): Promise<TaskContext> {
  const contract = getContract(ctx);
  if (!contract) {
    throw new ConfigurationError('创作素材尚未就绪，请先完成联网检索后再试');
  }
  const websource = resolveWebsourcePayload(ctx, contract) as WebsourcePayload | undefined;
  if (
    !websource ||
    typeof websource !== 'object' ||
    !Array.isArray(websource.items) ||
    websource.items.length === 0
  ) {
    throw new ConfigurationError(
      '创作素材尚未就绪或与选题未匹配上，请返回上一步重新检索后再试'
    );
  }

  const userId = String(ctx.userId ?? '').trim();
  if (!userId) {
    throw new ConfigurationError('extractHotTopics：需要 userId');
  }

  const params = (step.params ?? {}) as Record<string, unknown>;
  const merged = mergeParams(ctx);
  const { sector, dateMode, dateLabel, ymd } = resolveHotTopicsContext(merged, step);
  const language = String(merged.language ?? 'zh').trim() || 'zh';
  // 发现池整池提炼；不再读用户 topic_count（UI 已取消）
  const maxTopics = clampTopicMaxResults(
    params.maxTopics ?? params.poolSize ?? TOPIC_POOL_DEFAULT
  );
  const maxInputItems =
    typeof params.maxInputItems === 'number' && Number.isFinite(params.maxInputItems)
      ? Math.max(1, Math.min(80, Math.floor(params.maxInputItems)))
      : Math.min(websource.items.length, 80);

  const textKey = resolveHotTopicsTextKey(step);
  const writingStyle = isWritingStyleTopicExtractKey(textKey);
  const voiceFields = writingStyle ? resolveWritingVoiceFields(merged, step) : null;
  const voiceStyle =
    writingStyle && voiceFields?.voiceCategory && voiceFields.voiceId
      ? await resolveVoiceStyleTopicBrief({
          voiceCategory: voiceFields.voiceCategory,
          voiceId: voiceFields.voiceId,
          language,
        })
      : null;

  const extracted = await extractTopicChipsViaTextBusiness({
    textKey,
    userId,
    industry: writingStyle
      ? voiceFields?.voiceCategory || sector || '综合'
      : sector || '综合',
    dateMode,
    dateLabel: dateLabel || undefined,
    ymd: ymd || undefined,
    language,
    websource,
    parentTaskId: ctx.taskId,
    maxTopics,
    maxInputItems,
    resultClean:
      params.resultClean === undefined
        ? true
        : (params.resultClean as boolean | Record<string, unknown> | null),
    ...(writingStyle
      ? {
          voiceCategory: voiceFields?.voiceCategory,
          voiceId: voiceFields?.voiceId,
          voiceStyle,
        }
      : {}),
  });

  if (!extracted.topics.length) {
    throw new ConfigurationError('未能提炼出可用热点，请换行业、日期或检索范围后重试');
  }

  const nestedUsage = Array.isArray(ctx.state.pipelineNestedUsage)
    ? [...(ctx.state.pipelineNestedUsage as unknown[])]
    : [];
  nestedUsage.push({
    nestedTextTaskKey: textKey,
    taskId: extracted.textTaskId,
    purpose: 'extractHotTopics',
    filteredOut: extracted.filteredOut,
    topicCount: extracted.topics.length,
  });

  const fullWithChips: Record<string, unknown> = {
    ...websource,
    topicChips: extracted.topics,
    topicPool: extracted.topics,
    topicSourceMap: extracted.topicSourceMap,
  };
  let next = putEvidence(ctx, 'websource', fullWithChips);
  next = {
    ...next,
    state: {
      ...next.state,
      pipelineNestedUsage: nestedUsage,
    },
  };
  return withContract(next, {
    ...contract,
    sources: {
      ...contract.sources,
      websource: slimWebSearchForContract(fullWithChips, 'websource'),
    },
  });
}

let registered = false;

export function registerExtractHotTopicsStep(): void {
  if (registered) return;
  registered = true;
  registerInputStep('extractHotTopics', async (ctx, step) => runExtractHotTopicsStep(ctx, step));
}

registerExtractHotTopicsStep();
