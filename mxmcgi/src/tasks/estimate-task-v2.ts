/**
 * Task V2 用户侧估价：按管线可计费跳数 + provider_pricing.charge_mode / platform_* 粗算 MXM-TOKEN。
 *
 * 两段估价（含人工审核的编排业务）：
 * - create：只估「首次 manualReview 之前」的费用（开局即可预检）
 * - after_review：按审核确认后的规格估「后续调用」费用（通过审核前预检）
 *
 * 无 manualReview 时 create/after_review 均估全管线。
 */

import { ConfigurationError } from './errors';
import { loadTaskDefinition } from './task-definition';
import { mergeEffectivePipeline } from './business-pipeline-defaults';
import {
  parseNestedTextTaskKey,
  parseNestedVideoTaskKey,
} from './business-pipeline';
import { resolveOutlineModel } from '../core/outline/outline-model-routing';
import { resolveWritingModel } from '../core/writing/writing-model-routing';
import { resolveGraphModel } from '../core/graph/graph-model-routing';
import { resolveVideoModel } from '../core/video/video-model-routing';
import { resolveAudioModel } from '../core/audio/audio-model-routing';
import { resolveMusicModel } from '../core/music/music-model-routing';
import { resolveTextModel } from '../core/text/text-model-routing';
import { DEFAULT_AI_IMAGE_GENERATOR } from '../core/graph/graph-image-business';
import {
  BillingService,
  BillingMisconfiguredError,
  BILLING_MISCONFIGURED_CODE,
  BILLING_MISCONFIGURED_MESSAGE,
} from '../statistics/billing-service';
import { RepositoryFactory } from '@mxmai/mxmdata';
import type { PipelineStep, TaskScope, TaskTemplate } from './types';
import {
  buildUsageEstimateForChargeMode,
} from './estimate-usage-mid';
import {
  countAlbumItemsFromParams,
  countTimelineAiUsage,
} from './estimate-pipeline-helpers';

export { countAlbumItemsFromParams, countTimelineAiUsage } from './estimate-pipeline-helpers';

export type { UsageEstimate } from './estimate-usage-mid';
export {
  buildUsageEstimate,
  buildUsageEstimateForChargeMode,
  midDurationSeconds,
  midTextChars,
} from './estimate-usage-mid';

/** 估价窗口：开局（审核前）| 审核后后续 | 全管线 */
export type EstimatePhase = 'create' | 'after_review' | 'full';

export type EstimateBreakdownItem = {
  label: string;
  provider: string;
  modelKey: string;
  scope: string;
  estimatedTokens: number;
  chargeMode?: string;
  /** pre | primary | post */
  phase?: string;
};

export type EstimateTaskV2Result = {
  estimatedTokens: number;
  currentBalance: number;
  allowed: boolean;
  hasPricing: boolean;
  isAdmin: boolean;
  code?: string;
  message?: string;
  breakdown: EstimateBreakdownItem[];
  provider: string;
  modelKey: string;
  scope: string;
  /** create 且管线含人工审核：后续大头费用在审核后再估 */
  deferredUntilManualReview?: boolean;
  estimatePhase?: EstimatePhase;
};

function pipelineHasManualReview(pre: PipelineStep[], post: PipelineStep[]): boolean {
  return [...pre, ...post].some((s) => s.step === 'manualReview');
}

function firstManualReviewIndex(steps: PipelineStep[]): number {
  return steps.findIndex((s) => s.step === 'manualReview');
}

/**
 * 按估价窗口切分管线。
 * create + 有审核：只保留首次 manualReview 之前的步骤（不含审核本身与之后）。
 * after_review：估首次 manualReview 之后的剩余步骤（不含审核本身与之前已消耗跳）。
 */
function slicePipelineForEstimatePhase(
  pre: PipelineStep[],
  post: PipelineStep[],
  estimatePhase: EstimatePhase,
): { pre: PipelineStep[]; post: PipelineStep[]; includePrimary: boolean; deferred: boolean } {
  const hasReview = pipelineHasManualReview(pre, post);
  if (!hasReview || estimatePhase === 'full') {
    return { pre, post, includePrimary: true, deferred: false };
  }

  const preIdx = firstManualReviewIndex(pre);
  const postIdx = firstManualReviewIndex(post);

  if (estimatePhase === 'create') {
    if (preIdx >= 0) {
      return {
        pre: pre.slice(0, preIdx),
        post: [],
        includePrimary: false,
        deferred: true,
      };
    }
    // 审核仅在 post：开局估完整 pre + primary，不估审核后的 post 尾部
    if (postIdx >= 0) {
      return {
        pre,
        post: [],
        includePrimary: true,
        deferred: true,
      };
    }
    return { pre, post, includePrimary: true, deferred: false };
  }

  // after_review：估审核之后
  if (preIdx >= 0) {
    return {
      pre: pre.slice(preIdx + 1),
      post,
      includePrimary: true,
      deferred: false,
    };
  }
  if (postIdx >= 0) {
    return {
      pre: [],
      post: post.slice(postIdx + 1),
      includePrimary: false,
      deferred: false,
    };
  }
  return { pre: [], post, includePrimary: false, deferred: false };
}

async function resolvePhysical(
  scope: TaskScope | string,
  taskKey: string,
  subtype: string | null,
): Promise<{ provider: string; model: string }> {
  const st = subtype ?? undefined;
  try {
    switch (scope) {
      case 'outline': {
        const r = await resolveOutlineModel(taskKey, st);
        return { provider: r.provider, model: r.modelName };
      }
      case 'writing': {
        const r = await resolveWritingModel(taskKey, st);
        return { provider: r.provider, model: r.modelName };
      }
      case 'graph': {
        const r = await resolveGraphModel(taskKey, subtype || 'default');
        return { provider: r.provider, model: r.modelName };
      }
      case 'video': {
        const r = await resolveVideoModel(taskKey, st);
        return { provider: r.provider, model: r.modelName };
      }
      case 'audio': {
        const r = await resolveAudioModel(taskKey, st);
        return { provider: r.provider, model: r.modelName };
      }
      case 'music': {
        const r = await resolveMusicModel(taskKey, st);
        return { provider: r.provider, model: r.modelName };
      }
      case 'text': {
        const r = await resolveTextModel(taskKey, st);
        return { provider: r.provider, model: r.modelName };
      }
      default:
        throw new ConfigurationError(`不支持的 scope: ${scope}`);
    }
  } catch (e) {
    if (e instanceof ConfigurationError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    if (/未配置.+业务模型/.test(msg)) throw new ConfigurationError(msg);
    throw e;
  }
}

async function estimateOneCall(
  label: string,
  provider: string,
  modelKey: string,
  scope: string,
  params: Record<string, unknown>,
  phase: string,
): Promise<EstimateBreakdownItem> {
  if (provider === 'internal') {
    return { label, provider, modelKey, scope, estimatedTokens: 0, phase, chargeMode: 'internal' };
  }
  const pricing = await BillingService.getPricing(provider, modelKey, scope);
  const chargeMode = pricing?.charge_mode ?? null;
  const usage = buildUsageEstimateForChargeMode(scope, chargeMode, params);
  const { tokens, chargeMode: mode } = await BillingService.estimateTokens({
    provider,
    modelKey,
    scope,
    ...usage,
  });
  return {
    label,
    provider,
    modelKey,
    scope,
    estimatedTokens: tokens,
    chargeMode: mode,
    phase,
  };
}

async function estimateAlbumImageBatchStep(
  step: PipelineStep,
  phase: 'pre' | 'post',
  params: Record<string, unknown>,
): Promise<EstimateBreakdownItem | null> {
  const fromSpec = countAlbumItemsFromParams(params);
  const fromMax = Math.max(0, Math.min(48, Math.floor(Number(params.max_items ?? 0) || 0)));
  const imageCount = fromSpec > 0 ? fromSpec : fromMax;
  if (imageCount <= 0) return null;

  const taskKey =
    String(step.params?.graphTaskKey ?? '').trim() || DEFAULT_AI_IMAGE_GENERATOR.taskKey;
  const subtype =
    String(step.params?.graphSubtype ?? '').trim() || DEFAULT_AI_IMAGE_GENERATOR.subtype;

  try {
    const resolved = await resolvePhysical('graph', taskKey, subtype || null);
    return await estimateOneCall(
      `${phase}:albumImageBatch×${imageCount}`,
      resolved.provider,
      resolved.model,
      'graph',
      { ...params, image_count: imageCount },
      phase,
    );
  } catch (e) {
    if (e instanceof BillingMisconfiguredError) throw e;
    throw e instanceof ConfigurationError ? e : new BillingMisconfiguredError();
  }
}

async function estimateTimelineAiFromParams(
  phase: 'pre' | 'post',
  params: Record<string, unknown>,
): Promise<EstimateBreakdownItem[]> {
  const { imageCount, videoClipCount } = countTimelineAiUsage(params);
  const items: EstimateBreakdownItem[] = [];

  if (imageCount > 0) {
    try {
      const resolved = await resolvePhysical(
        'graph',
        DEFAULT_AI_IMAGE_GENERATOR.taskKey,
        DEFAULT_AI_IMAGE_GENERATOR.subtype,
      );
      items.push(
        await estimateOneCall(
          `${phase}:timeline-ai-image×${imageCount}`,
          resolved.provider,
          resolved.model,
          'graph',
          { ...params, image_count: imageCount },
          phase,
        ),
      );
    } catch {
      /* 无售价则跳过单项 */
    }
  }

  if (videoClipCount > 0) {
    try {
      items.push(
        await estimateOneCall(
          `${phase}:timeline-ai-video×${videoClipCount}`,
          'atlascloud',
          'bytedance/seedance-2.0-mini',
          'video',
          {
            ...params,
            // 每段按中间档时长估，总量 ≈ 段数 × 单段
            total_duration_seconds: videoClipCount * 8,
            duration: videoClipCount * 8,
          },
          phase,
        ),
      );
    } catch {
      /* skip */
    }
  }

  return items.filter((i) => i.estimatedTokens > 0);
}

async function estimatePipelineSteps(
  steps: PipelineStep[],
  phase: 'pre' | 'post',
  params: Record<string, unknown>,
): Promise<EstimateBreakdownItem[]> {
  const items: EstimateBreakdownItem[] = [];
  for (const step of steps) {
    if (step.step === 'manualReview') continue;

    if (step.step === 'nestedText') {
      const raw =
        (typeof step.nestedTextTaskKey === 'string' && step.nestedTextTaskKey) ||
        (typeof step.params?.taskKey === 'string' && step.params.taskKey) ||
        '';
      if (!raw) continue;
      try {
        const key = String(raw).startsWith('text/') ? String(raw) : `text/${raw}`;
        const parsed = parseNestedTextTaskKey(key);
        const resolved = await resolvePhysical('text', parsed.taskKey, parsed.subtype);
        items.push(
          await estimateOneCall(
            `${phase}:nestedText:${raw}`,
            resolved.provider,
            resolved.model,
            'text',
            params,
            phase,
          ),
        );
      } catch (e) {
        // 前置 prompt 文本节点缺价时不拖垮整单估价（主费用在 primary 生图）
        console.warn(
          `[estimate] skip nestedText ${raw}:`,
          e instanceof Error ? e.message : e,
        );
      }
      continue;
    }

    if (step.step === 'albumImageBatch') {
      const row = await estimateAlbumImageBatchStep(step, phase, params);
      if (row && row.estimatedTokens > 0) items.push(row);
      continue;
    }

    if (step.step === 'nestedVideo' || step.step === 'videoTimelineRender') {
      // 审核后若已有时间轴 JSON，优先按 AI 段计数估
      const fromTimeline = await estimateTimelineAiFromParams(phase, params);
      if (fromTimeline.length > 0) {
        items.push(...fromTimeline);
        continue;
      }

      const raw =
        (typeof step.nestedVideoTaskKey === 'string' && step.nestedVideoTaskKey) ||
        (typeof step.params?.nestedVideoTaskKey === 'string' && step.params.nestedVideoTaskKey) ||
        '';
      if (!raw) {
        try {
          items.push(
            await estimateOneCall(
              `${phase}:ai-video@seedance-mini`,
              'atlascloud',
              'bytedance/seedance-2.0-mini',
              'video',
              params,
              phase,
            ),
          );
        } catch {
          /* 无售价跳过 */
        }
        continue;
      }
      try {
        const p = parseNestedVideoTaskKey(
          String(raw).startsWith('video/') ? String(raw) : `video/${raw}`,
        );
        const resolved = await resolvePhysical('video', p.taskKey, p.subtype);
        items.push(
          await estimateOneCall(
            `${phase}:nestedVideo:${raw}`,
            resolved.provider,
            resolved.model,
            'video',
            params,
            phase,
          ),
        );
      } catch (e) {
        if (e instanceof BillingMisconfiguredError) throw e;
        throw e instanceof ConfigurationError ? e : new BillingMisconfiguredError();
      }
    }
  }
  return items;
}

export type CollectEstimateResult = {
  items: EstimateBreakdownItem[];
  deferredUntilManualReview: boolean;
};

/**
 * 汇总一个业务在指定窗口内的可计费调用。
 */
export async function collectBusinessEstimateBreakdown(params: {
  scope: TaskScope;
  taskKey: string;
  subtype: string | null;
  formParams: Record<string, unknown>;
  template: TaskTemplate;
  rowExtra: Record<string, unknown> | null;
  primaryProvider: string;
  primaryModel: string;
  estimatePhase?: EstimatePhase;
}): Promise<CollectEstimateResult> {
  const estimatePhase = params.estimatePhase ?? 'create';
  const { pre, post } = mergeEffectivePipeline(params.scope, params.template, params.rowExtra);
  const sliced = slicePipelineForEstimatePhase(pre, post, estimatePhase);
  const items: EstimateBreakdownItem[] = [];

  items.push(...(await estimatePipelineSteps(sliced.pre, 'pre', params.formParams)));

  // primary：审核在 pre 内开局不估；审核在 post 或无审核时开局要估；审核通过后若尚未跑过 primary 则纳入
  if (sliced.includePrimary && params.primaryProvider !== 'internal') {
    items.push(
      await estimateOneCall(
        `primary:${params.scope}/${params.taskKey}`,
        params.primaryProvider,
        params.primaryModel,
        params.scope,
        params.formParams,
        'primary',
      ),
    );
  }

  items.push(...(await estimatePipelineSteps(sliced.post, 'post', params.formParams)));

  // 开局延后估价窗口：预估审核后 albumImageBatch（按 album_spec 张数，否则 max_items）
  // 避免图集只显示规划 LLM 费用（如 2）而忽略即将生成的 N 张图
  if (estimatePhase === 'create' && sliced.deferred) {
    const postAlbumSteps = post.filter((s) => s.step === 'albumImageBatch');
    for (const step of postAlbumSteps) {
      const row = await estimateAlbumImageBatchStep(step, 'post', params.formParams);
      if (row && row.estimatedTokens > 0) {
        items.push({ ...row, label: `planned:${row.label}` });
      }
    }
  }

  const billed = items.filter((i) => i.estimatedTokens > 0);

  const remainingHasBillableStep = [...sliced.pre, ...sliced.post].some(
    (s) =>
      s.step === 'nestedText' ||
      s.step === 'nestedVideo' ||
      s.step === 'videoTimelineRender' ||
      s.step === 'albumImageBatch',
  );
  const remainingHasPrimaryBill =
    sliced.includePrimary && params.primaryProvider !== 'internal';

  // 开局且后续费用延后：审核前可以没有可计费跳（极少），允许 0 并通过
  if (billed.length === 0) {
    if (sliced.deferred && estimatePhase === 'create') {
      return { items: [], deferredUntilManualReview: true };
    }
    if (estimatePhase === 'after_review') {
      // 第二次审核后可能已无付费调用（仅收尾）→ 允许 0
      if (!remainingHasBillableStep && !remainingHasPrimaryBill) {
        return { items: [], deferredUntilManualReview: false };
      }
      throw new BillingMisconfiguredError(
        '审核通过后无法估价：请确认规格已含生成条目（如图集 items / 时间轴 AI 段）',
      );
    }
    throw new BillingMisconfiguredError();
  }

  return {
    items: billed,
    deferredUntilManualReview: sliced.deferred && estimatePhase === 'create',
  };
}

export async function estimateTaskV2(params: {
  scope: TaskScope;
  taskKey: string;
  subtype?: string | null;
  params?: Record<string, unknown>;
  userId: string;
  estimatePhase?: EstimatePhase;
}): Promise<EstimateTaskV2Result> {
  const scope = params.scope;
  const taskKey = params.taskKey;
  const subtype = params.subtype ?? null;
  const estimatePhase: EstimatePhase = params.estimatePhase ?? 'create';
  const formParams = (params.params && typeof params.params === 'object' ? params.params : {}) as Record<
    string,
    unknown
  >;

  const { template, row } = await loadTaskDefinition({ scope, taskKey, subtype, lang: 'zh' });
  const resolved = await resolvePhysical(scope, taskKey, subtype);
  const rowExtra = (row.extra ?? null) as Record<string, unknown> | null;

  let breakdown: EstimateBreakdownItem[] = [];
  let deferredUntilManualReview = false;

  try {
    const collected = await collectBusinessEstimateBreakdown({
      scope,
      taskKey,
      subtype,
      formParams,
      template,
      rowExtra,
      primaryProvider: resolved.provider,
      primaryModel: resolved.model,
      estimatePhase,
    });
    breakdown = collected.items;
    deferredUntilManualReview = collected.deferredUntilManualReview;
  } catch (e) {
    if (e instanceof BillingMisconfiguredError) {
      const bal = await getBalance(params.userId);
      return {
        estimatedTokens: 0,
        currentBalance: bal.balance,
        allowed: false,
        hasPricing: false,
        isAdmin: bal.isAdmin,
        code: BILLING_MISCONFIGURED_CODE,
        message: e.message || BILLING_MISCONFIGURED_MESSAGE,
        breakdown: [],
        provider: resolved.provider,
        modelKey: resolved.model,
        scope,
        deferredUntilManualReview: false,
        estimatePhase,
      };
    }
    throw e;
  }

  const estimatedTokens = breakdown.reduce((s, b) => s + b.estimatedTokens, 0);
  const bal = await getBalance(params.userId);
  const check = await BillingService.checkBalance({
    userId: params.userId,
    provider: resolved.provider,
    modelKey: resolved.model,
    scope,
    estimatedTokensOverride: estimatedTokens,
    allowZeroKnownCost:
      estimatedTokens === 0 &&
      (deferredUntilManualReview || estimatePhase === 'after_review'),
  });

  return {
    estimatedTokens: check.estimatedTokens || estimatedTokens,
    currentBalance: check.currentBalance,
    allowed: check.allowed,
    hasPricing: check.hasPricing,
    isAdmin: bal.isAdmin,
    code: check.code,
    message: check.message,
    breakdown,
    provider: resolved.provider,
    modelKey: resolved.model,
    scope,
    deferredUntilManualReview,
    estimatePhase,
  };
}

async function getBalance(userId: string): Promise<{ balance: number; isAdmin: boolean }> {
  try {
    const userRepo = RepositoryFactory.createUserRepository();
    const user = await userRepo.findById(userId);
    const isAdmin = user?.role === 'admin';
    const assetCode = process.env.PLATFORM_TOKEN_ASSET_CODE || 'MXM-TOKEN';
    const walletRepo = RepositoryFactory.createWalletRepository();
    const wallet = await walletRepo.findWalletByUserAndAsset(userId, assetCode);
    return { balance: Number(wallet?.available_balance || '0'), isAdmin };
  } catch {
    return { balance: 0, isAdmin: false };
  }
}

/** 供 runTaskV2 创建前复用同一套估量（始终 create 窗口） */
export async function estimateTokensForRun(params: {
  scope: TaskScope;
  taskKey: string;
  subtype: string | null;
  formParams: Record<string, unknown>;
  provider: string;
  modelKey: string;
  template: Awaited<ReturnType<typeof loadTaskDefinition>>['template'];
  rowExtra: Record<string, unknown> | null;
  estimatePhase?: EstimatePhase;
}): Promise<{
  estimatedTokens: number;
  breakdown: EstimateBreakdownItem[];
  deferredUntilManualReview: boolean;
}> {
  const collected = await collectBusinessEstimateBreakdown({
    scope: params.scope,
    taskKey: params.taskKey,
    subtype: params.subtype,
    formParams: params.formParams,
    template: params.template,
    rowExtra: params.rowExtra,
    primaryProvider: params.provider,
    primaryModel: params.modelKey,
    estimatePhase: params.estimatePhase ?? 'create',
  });
  return {
    estimatedTokens: collected.items.reduce((s, b) => s + b.estimatedTokens, 0),
    breakdown: collected.items,
    deferredUntilManualReview: collected.deferredUntilManualReview,
  };
}
