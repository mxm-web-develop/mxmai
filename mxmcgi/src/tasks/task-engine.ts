import { randomUUID } from 'node:crypto';
import type { TaskRunV2Request, TaskRunV2Response } from './types';
import { ConfigurationError } from './errors';
import { loadTaskDefinition } from './task-definition';
import { validateWithJsonSchema } from './schema-validator';
import { ensureTaskUidFromSchema, normalizeParamsBeforeSchemaValidate } from './form-param-normalize';
import { renderPromptFromTemplate } from './prompt-template';
import type { TaskContext } from './types';
import { runFixedTaskV2Prelude } from './task-v2-prelude';
import { runBusinessPrePromptSteps } from './business-pipeline';
import { shouldDeferBusinessPrePipeline } from './deferred-media-pipeline';
import { textScopeNeedsAsyncTask } from './text-async-pipeline';
import { resolveOutlineModel } from '../core/outline/outline-model-routing';
import { resolveWritingModel } from '../core/writing/writing-model-routing';
import { resolveGraphModel } from '../core/graph/graph-model-routing';
import { resolveVideoModel } from '../core/video/video-model-routing';
import { resolveAudioModel } from '../core/audio/audio-model-routing';
import { resolveMusicModel } from '../core/music/music-model-routing';
import { resolveTextModel } from '../core/text/text-model-routing';
import type { GenerateResult } from '../models/providers';
import { BillingService } from '../statistics/billing-service';
import {
  BillingMisconfiguredError,
  BILLING_MISCONFIGURED_CODE,
  BILLING_MISCONFIGURED_MESSAGE,
} from '../statistics/billing-service';
import { UsageService } from '../statistics/usage-service';
import { estimateTokensForRun } from './estimate-task-v2';
import { mergeUsageContext, resolveUsageContextFromTaskMetadata } from '../statistics/usage-context';
import { runByModelKey } from '../models/run';
import { buildLogicalModel } from '../routes/business-bundle';
import { normalizeRenderPlanInput } from '../core/video-edit/render-plan';
import { taskExecutor } from '../task/task-executor';
import {
  applyFormSchemaDefaults,
  cloneFormSchemaWithReferenceImageEnrichment,
  mergeGraphReferenceImageFromFormSlots,
  hydrateGraphImageSlotParamsFromReferenceImage,
  prepareGraphTaskParams,
} from './graph-reference-slots';
import {
  prepareVideoTaskParams,
  cloneVideoFormSchemaWithReferenceEnrichment,
} from '../core/video/video-reference-slots';
import { shouldDeferTaskExecution, shouldExecuteTasksInline } from '../config/runtime-role';
import { buildAudioTtsParameters, normalizeAudioVoiceParams, resolveAudioPhysicalModel } from './audio-tts-params';
import {
  buildMusicGenerationParameters,
  normalizeMusicFormParams,
  resolveMusicPhysicalModel,
} from './music-generation-params';

function readTemplateGenerateParamsRaw(template: unknown): Record<string, unknown> | null {
  const t = template as { extra?: Record<string, unknown> } | null | undefined;
  const raw =
    t?.extra?.generateParams ?? t?.extra?.llmParams ?? t?.extra?.generationParams;
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
}

function pickGenerateDefaultsFromTemplate(template: any): Partial<Record<'temperature' | 'maxTokens' | 'topP', number>> {
  const raw = readTemplateGenerateParamsRaw(template);
  if (!raw) return {};
  const out: Partial<Record<'temperature' | 'maxTokens' | 'topP', number>> = {};
  const t = raw.temperature;
  const mt = raw.maxTokens;
  const tp = raw.topP;
  if (typeof t === 'number' && Number.isFinite(t)) out.temperature = t;
  if (typeof mt === 'number' && Number.isFinite(mt)) out.maxTokens = mt;
  if (typeof tp === 'number' && Number.isFinite(tp)) out.topP = tp;
  return out;
}

/** Admin generateParams.parameters → 透传至 provider API（如 M3 thinking 开关） */
function pickGenerateParamDefaultsFromTemplate(template: unknown): Record<string, unknown> {
  const raw = readTemplateGenerateParamsRaw(template);
  const params = raw?.parameters;
  return params && typeof params === 'object' && !Array.isArray(params)
    ? { ...(params as Record<string, unknown>) }
    : {};
}

function mergeGenerateDefaults<T extends Record<string, any>>(
  params: T,
  defaults: Partial<Record<'temperature' | 'maxTokens' | 'topP', number>>
): T {
  const next: Record<string, any> = { ...params };
  for (const k of ['temperature', 'maxTokens', 'topP'] as const) {
    if (next[k] === undefined && defaults[k] !== undefined) {
      next[k] = defaults[k];
    }
  }
  return next as T;
}

import type { OpenApiRunContext } from '../open-api/context';
import { extractParallelCount } from './platform-fields';
import { parallelContextVars, type ParallelBatchContext } from './parallel-variation';

export interface RunTaskV2Options {
  /** 开放 API：用发布快照做校验/默认值/参考图合并，避免 Admin 改 schema 后第三方契约漂移 */
  publishedFormSchema?: import('./types').JsonSchemaV2;
  /** 开放 API：扣费账户为发布者；任务仍关联 caller 便于轮询 */
  openApi?: OpenApiRunContext;
}

export interface RunTaskV2SingleOptions extends RunTaskV2Options {
  batchContext?: ParallelBatchContext;
  /** 子任务跳过余额预检（父批次首子任务已按份数预检） */
  skipBalanceCheck?: boolean;
  /** 余额预检乘数（多份批次首子任务传 parallel_count） */
  balanceMultiplier?: number;
  /** 多份批次已在 parallel-batch 中完成 prepare/validate，避免二次处理篡改参数 */
  parallelBatchPrepared?: boolean;
}

/** 延迟前置时保留表单原始 prompt，避免 worker 二次 render 时 ${prompt} 套娃 */
function buildDeferredAwarePromptPatch(
  deferPre: boolean,
  paramsWithDefaults: Record<string, unknown>,
  finalPromptEnhanced: string,
): { topLevelPrompt: string; innerPatch: Record<string, unknown> } {
  const userPrompt =
    typeof paramsWithDefaults.prompt === 'string' ? paramsWithDefaults.prompt.trim() : '';
  if (deferPre) {
    return { topLevelPrompt: userPrompt, innerPatch: {} };
  }
  return {
    topLevelPrompt: finalPromptEnhanced,
    innerPatch: { prompt: finalPromptEnhanced, useConfiguredPrompt: true as const },
  };
}

export async function runTaskV2(
  req: TaskRunV2Request,
  userId?: string,
  options?: RunTaskV2Options
): Promise<TaskRunV2Response> {
  const parallelCount =
    req.scope !== 'text' ? extractParallelCount(req.params as Record<string, unknown>) : 1;
  if (parallelCount > 1) {
    const { runTaskV2ParallelBatch } = await import('./parallel-batch');
    return runTaskV2ParallelBatch(req, userId, options);
  }
  return runTaskV2Single(req, userId, options);
}

export async function runTaskV2Single(
  req: TaskRunV2Request,
  userId?: string,
  options?: RunTaskV2SingleOptions
): Promise<TaskRunV2Response> {
  const { scope, taskKey, subtype } = req;
  if (scope === 'video' && taskKey === 'autocut' && (subtype === 'render' || subtype === 'timeline-render')) {
    throw new ConfigurationError(
      '视频时间轴渲染为自动剪辑管线内置节点（videoTimelineRender），不可作为独立 Task V2 业务提交。'
    );
  }
  const batchCtx = options?.batchContext;
  const openApi = options?.openApi;
  const billingUserId = openApi?.billingUserId ?? userId;
  const callerUserId = openApi?.callerUserId ?? userId;
  const { template, row } = await loadTaskDefinition({ scope, taskKey, subtype: subtype ?? null, lang: 'zh' });
  const { isMxmWarpExecution } = await import('./mxm-warp/warp-runner');
  const warpMode = isMxmWarpExecution(template, (row.extra ?? null) as Record<string, unknown> | null);

  // text v2：平台钉死 formSchema / 无管道，忽略 DB 旧字段表
  if (scope === 'text') {
    const { assertTextV2TaskKey, getTextV2FixedFormSchema } = await import('./text-v2');
    const t = assertTextV2TaskKey(taskKey);
    const fixed = getTextV2FixedFormSchema(t);
    (template as { formSchema?: unknown }).formSchema = fixed;
    (template as { contractSchema?: unknown }).contractSchema = fixed;
    (template as { pipeline?: unknown }).pipeline = { pre: [], enrich: [], post: [] };
  }

  let normalizedParams = { ...(req.params as Record<string, any>) };
  const templateFormSchema = (template as { formSchema?: import('./types').JsonSchemaV2 }).formSchema;
  const formSchemaForInput = options?.publishedFormSchema ?? templateFormSchema;
  /** mxm-warp：以 contractSchema 校验入参；无则回退 formSchema（仅便于过渡） */
  const warpValidateSchema =
    warpMode
      ? (template.contractSchema ?? templateFormSchema ?? formSchemaForInput)
      : undefined;

  if (warpMode) {
    const fs = warpValidateSchema;
    if (fs) {
      applyFormSchemaDefaults(normalizedParams, fs);
      normalizedParams = normalizeParamsBeforeSchemaValidate(fs, normalizedParams) as Record<string, any>;
      validateWithJsonSchema(fs, normalizedParams);
    }
  } else if (scope === 'graph') {
    const fs = cloneFormSchemaWithReferenceImageEnrichment(formSchemaForInput);
    if (options?.parallelBatchPrepared) {
      validateWithJsonSchema(fs, normalizedParams);
    } else {
      normalizedParams = prepareGraphTaskParams(normalizedParams, fs, {
        taskKey,
        subtype: subtype ?? null,
      }) as Record<string, any>;
      validateWithJsonSchema(fs, normalizedParams);
    }
  } else if (scope === 'video') {
    const fs = cloneVideoFormSchemaWithReferenceEnrichment(formSchemaForInput);
    if (options?.parallelBatchPrepared) {
      validateWithJsonSchema(fs, normalizedParams);
    } else {
      normalizedParams = prepareVideoTaskParams(normalizedParams, fs, {
        taskKey,
        subtype: subtype ?? null,
      }) as Record<string, any>;
      ensureTaskUidFromSchema(normalizedParams, fs);
      validateWithJsonSchema(fs, normalizedParams);
    }
  } else {
    const fs = formSchemaForInput;
    if (fs) {
      applyFormSchemaDefaults(normalizedParams, fs);
      normalizedParams = normalizeParamsBeforeSchemaValidate(fs, normalizedParams) as Record<string, any>;
    }
    if (scope === 'text') {
      const { assertTextV2TaskKey, pickTextV2ParamsForSchemaValidate } = await import('./text-v2');
      const textType = assertTextV2TaskKey(taskKey);
      // 平台注入的 _pipelineDepth / metadata 等不参与 additionalProperties:false 校验
      validateWithJsonSchema(fs, pickTextV2ParamsForSchemaValidate(textType, normalizedParams));
    } else {
      validateWithJsonSchema(fs, normalizedParams);
    }
    if (scope === 'audio') {
      normalizedParams = normalizeAudioVoiceParams(normalizedParams) as Record<string, any>;
    }
    if (scope === 'music') {
      normalizedParams = normalizeMusicFormParams(normalizedParams) as Record<string, any>;
    }
    if (scope === 'text' && normalizedParams.render_plan !== undefined) {
      normalizedParams.render_plan = normalizeRenderPlanInput(normalizedParams.render_plan);
    }
    if (scope === 'writing' && fs) {
      const props = ((fs.properties ?? {}) as Record<string, any>) ?? {};
      const hasRefSlots = Object.values(props).some(
        (sch) => sch && typeof sch === 'object' && sch['x-ui-type'] === 'referenceImages',
      );
      if (hasRefSlots) {
        mergeGraphReferenceImageFromFormSlots(normalizedParams, fs);
        hydrateGraphImageSlotParamsFromReferenceImage(normalizedParams, fs);
        mergeGraphReferenceImageFromFormSlots(normalizedParams, fs);
        applyFormSchemaDefaults(normalizedParams, fs);
      }
    }
  }

  if (options?.publishedFormSchema && templateFormSchema) {
    applyFormSchemaDefaults(normalizedParams, templateFormSchema);
  }

  let ctx: TaskContext = {
    scope,
    taskKey,
    subtype: subtype ?? null,
    userId,
    taskId: '',
    params: normalizedParams,
    state: {},
  };

  // 可选挂卡注入既有 params（手填优先）；无挂卡时为 no-op
  {
    const { resolveFolderCardAssets } = await import('../folder-cards/resolve-card-assets');
    ctx = await resolveFolderCardAssets(
      ctx,
      warpMode
        ? (template.contractSchema ?? templateFormSchema ?? formSchemaForInput)
        : (templateFormSchema ?? formSchemaForInput)
    );
  }

  const deferBusinessPrePipeline = !warpMode && shouldDeferBusinessPrePipeline(scope);

  let finalPrompt = '';
  if (warpMode) {
    // mxm-warp：不做旧 form 插值 / 旧 prelude；output Prompt 原样留给五段执行器
    finalPrompt =
      typeof template.prompt?.unifiedTemplate === 'string' ? template.prompt.unifiedTemplate : '';
    ctx = { ...ctx, state: { ...ctx.state, finalPrompt, executionMode: 'mxm-warp' } };
  } else {
    if (!deferBusinessPrePipeline) {
      ctx = await runFixedTaskV2Prelude(ctx, template);
    }

    const pipelineState = ctx.state.pipeline as Record<string, unknown> | undefined;
    if (pipelineState?.resumeProfile != null) {
      const resumeProfileStr =
        typeof pipelineState.resumeProfile === 'string'
          ? pipelineState.resumeProfile
          : JSON.stringify(pipelineState.resumeProfile, null, 2);
      ctx = {
        ...ctx,
        params: { ...ctx.params, resume_profile: resumeProfileStr },
      };
      normalizedParams = { ...normalizedParams, resume_profile: resumeProfileStr };
    }

    const contextFieldMeta = deferBusinessPrePipeline
      ? undefined
      : (ctx.state as { contextFieldMeta?: Record<string, unknown> })?.contextFieldMeta;
    const contextFieldRaw = deferBusinessPrePipeline
      ? undefined
      : (ctx.state as { contextFieldRaw?: Record<string, unknown> })?.contextFieldRaw;
    if (contextFieldMeta && Object.keys(contextFieldMeta).length > 0) {
      ctx = {
        ...ctx,
        params: {
          ...ctx.params,
          metadata: {
            ...(((ctx.params as Record<string, unknown>).metadata as Record<string, unknown> | undefined) ?? {}),
            contextFieldMeta,
            ...(contextFieldRaw && Object.keys(contextFieldRaw).length > 0 ? { contextFieldRaw } : {}),
          },
        },
      };
    }

    const rendered = renderPromptFromTemplate({
      prompt: template.prompt,
      paramsSchema: templateFormSchema ?? formSchemaForInput,
      params: ctx.params,
      contextVars: {
        userId: userId ?? '',
        taskId: batchCtx?.parentTaskId ?? '',
        uuid: '',
        timestamp: Date.now(),
        date: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
        subtype: subtype ?? '',
        ...(batchCtx ? parallelContextVars(batchCtx) : {}),
      },
    });
    finalPrompt = rendered.finalPrompt;

    if (!deferBusinessPrePipeline) {
      ctx = await runBusinessPrePromptSteps(ctx, template, scope, finalPrompt);
    } else {
      ctx = { ...ctx, state: { ...ctx.state, finalPrompt } };
    }
  }

  const deferMediaPrePipeline = deferBusinessPrePipeline;

  let finalPromptEnhanced =
    typeof (ctx.state as any)?.promptForModel === 'string' && String((ctx.state as any).promptForModel).trim()
      ? String((ctx.state as any).promptForModel).trim()
      : typeof (ctx.state as any)?.finalPrompt === 'string' && String((ctx.state as any).finalPrompt).trim()
        ? String((ctx.state as any).finalPrompt).trim()
        : finalPrompt;

  // v2 接入完整链路：余额预检 -> 创建 cgi_tasks -> 异步执行 -> 费用/用量由 TaskExecutor 内部统一处理
  if (!userId) {
    throw new Error('Missing userId');
  }

  const graphPipelineFormatted =
    scope === 'graph' &&
    typeof (ctx.state as { promptForModel?: string }).promptForModel === 'string' &&
    String((ctx.state as { promptForModel?: string }).promptForModel).trim().length > 0;

  const graphParamsExtra =
    scope === 'graph' && graphPipelineFormatted
      ? { graphPipelineFormatted: true as const }
      : {};
  const computedRoutingKey = buildLogicalModel(scope, taskKey, subtype ?? undefined);

  const extraLogicalModelRaw = (template.extra as any)?.logicalModel;
  const extraLogicalModel =
    typeof extraLogicalModelRaw === 'string' && extraLogicalModelRaw.trim() ? extraLogicalModelRaw.trim() : undefined;

  // 若配置显式 logicalModel，且与 scope 前缀一致，则优先使用
  const routingKey =
    extraLogicalModel && extraLogicalModel.startsWith(`${scope}-`)
      ? extraLogicalModel
      : computedRoutingKey;

  // 路由解析：各 scope 使用独立路由表（*_scope_config）
  const preferredProvider = (req.params.provider as any) ?? undefined;
  const paramsAnyEarly = ctx.params as Record<string, any>;
  let resolved: { provider: string; model: string; fromRouting: boolean };

  console.log(`[TaskV2] routing decision: scope=${scope}, taskKey=${taskKey}, subtype=${subtype}`);
  switch (scope) {
    case 'outline': {
      const r = await resolveOutlineModel(taskKey, subtype ?? undefined);
      resolved = { provider: r.provider, model: r.modelName, fromRouting: true };
      break;
    }
    case 'writing': {
      const r = await resolveWritingModel(taskKey, subtype ?? undefined);
      resolved = { provider: r.provider, model: r.modelName, fromRouting: true };
      break;
    }
    case 'graph': {
      // TaskV2 与 Admin 路径一致：taskKey = graph 大类（photograph/design/painting），subtype = 子业务。
      // 不得用 params.type 作为 graphType：表单里常有「类型」字段也叫 type，会覆盖 taskKey 导致路由键错位（如 graph-test-test）。
      const graphType = taskKey;
      const r = await resolveGraphModel(graphType as any, subtype || 'default');
      resolved = { provider: r.provider, model: r.modelName, fromRouting: true };
      break;
    }
    case 'video': {
      const r = await resolveVideoModel(taskKey, subtype ?? undefined);
      resolved = { provider: r.provider, model: r.modelName, fromRouting: true };
      break;
    }
    case 'audio': {
      const r = await resolveAudioModel(taskKey, subtype ?? undefined);
      const physicalModel = resolveAudioPhysicalModel(r.modelName, paramsAnyEarly);
      resolved = {
        provider: (preferredProvider as string) || r.provider,
        model: physicalModel,
        fromRouting: true,
      };
      break;
    }
    case 'music': {
      const r = await resolveMusicModel(taskKey, subtype ?? undefined);
      const physicalModel = resolveMusicPhysicalModel(r.modelName, paramsAnyEarly);
      resolved = {
        provider: (preferredProvider as string) || r.provider,
        model: physicalModel,
        fromRouting: true,
      };
      break;
    }
    case 'text': {
      const r = await resolveTextModel(taskKey, subtype ?? undefined);
      resolved = { provider: r.provider, model: r.modelName, fromRouting: r.fromDb };
      break;
    }
    default: {
      throw new Error(`[TaskV2] 不支持的 scope '${scope}'，支持: outline/writing/text/graph/video/audio/music`);
    }
  }

  // 余额预检（按 provider_pricing.platform_* 估算；不同 scope 的单位不同）
  const paramsAny = ctx.params as Record<string, any>;
  const templateGenerateDefaults = pickGenerateDefaultsFromTemplate(template as any);
  const templateParamDefaults = pickGenerateParamDefaultsFromTemplate(template as any);
  let paramsWithDefaults = mergeGenerateDefaults(paramsAny, templateGenerateDefaults);
  if (Object.keys(templateParamDefaults).length > 0) {
    const prevParams = (paramsWithDefaults as Record<string, unknown>).parameters;
    paramsWithDefaults = {
      ...paramsWithDefaults,
      parameters: {
        ...(typeof prevParams === 'object' && prevParams && !Array.isArray(prevParams)
          ? (prevParams as Record<string, unknown>)
          : {}),
        ...templateParamDefaults,
      },
    } as typeof paramsWithDefaults;
  }
  if (batchCtx) {
    const meta = {
      ...((paramsWithDefaults as Record<string, any>).metadata ?? {}),
      parentTaskId: batchCtx.parentTaskId,
      parallelIndex: batchCtx.parallelIndex,
      parallelTotal: batchCtx.parallelTotal,
      batchId: batchCtx.parentTaskId,
    };
    paramsWithDefaults = { ...paramsWithDefaults, metadata: meta } as typeof paramsWithDefaults;
  }
  if (!billingUserId) {
    throw new ConfigurationError('缺少计费用户（userId / 开放 API 发布者）');
  }

  if (!options?.skipBalanceCheck) {
    const mult = options?.balanceMultiplier ?? 1;
    let estimatedTokensOverride: number | undefined;
    let allowZeroKnownCost = false;
    try {
      const pipeEst = await estimateTokensForRun({
        scope,
        taskKey,
        subtype: subtype ?? null,
        formParams: paramsAny as Record<string, unknown>,
        provider: resolved.provider,
        modelKey: resolved.model,
        template,
        rowExtra: (row.extra ?? null) as Record<string, unknown> | null,
        estimatePhase: 'create',
      });
      estimatedTokensOverride = pipeEst.estimatedTokens * Math.max(1, mult);
      allowZeroKnownCost =
        pipeEst.deferredUntilManualReview && pipeEst.estimatedTokens === 0;
    } catch (e) {
      if (e instanceof BillingMisconfiguredError) {
        const err: any = new Error(BILLING_MISCONFIGURED_MESSAGE);
        err.code = BILLING_MISCONFIGURED_CODE;
        throw err;
      }
      throw e;
    }

    const balanceCheck = await BillingService.checkBalance({
      userId: billingUserId,
      provider: resolved.provider,
      modelKey: resolved.model,
      scope,
      estimatedTokensOverride,
      allowZeroKnownCost,
    });
    if (!balanceCheck.allowed) {
      if (balanceCheck.code === BILLING_MISCONFIGURED_CODE || !balanceCheck.hasPricing) {
        const err: any = new Error(balanceCheck.message || BILLING_MISCONFIGURED_MESSAGE);
        err.code = BILLING_MISCONFIGURED_CODE;
        throw err;
      }
      const err: any = new Error(
        balanceCheck.message ||
          `余额不足，本次预计消耗约 ${balanceCheck.estimatedTokens} MXM-TOKEN，当前余额 ${balanceCheck.currentBalance}`,
      );
      err.code = 'INSUFFICIENT_BALANCE';
      err.estimatedTokens = balanceCheck.estimatedTokens;
      err.currentBalance = balanceCheck.currentBalance;
      throw err;
    }
  }

  const textNeedsAsyncTask =
    scope === 'text' &&
    textScopeNeedsAsyncTask(template, scope, (row.extra ?? null) as Record<string, unknown> | null);

  // scope=text：默认同步；带 post pipeline（人工审核 / nestedVideo）走异步任务
  if (scope === 'text' && !textNeedsAsyncTask) {
    const syncId = `text-${randomUUID()}`;
    if (!resolved.fromRouting || !resolved.model || typeof resolved.model !== 'string') {
      throw new ConfigurationError(
        `未配置业务模型路由覆盖：logicalModel=${routingKey}。` +
          `请在 Admin「模型与定价」中为该业务保存 provider/model（将写入 text_scope_config）。`
      );
    }
    const physicalModelKey = resolved.model;

    const extractText = (r: GenerateResult): string | undefined => {
      const t = (r as { text?: string }).text;
      if (typeof t === 'string' && t.trim()) return t;
      const mt = r.metadata?.text;
      if (typeof mt === 'string' && mt.trim()) return mt;
      if (Array.isArray(r.mediaUrls) && r.mediaUrls.length && typeof r.mediaUrls[0] === 'string' && !r.mediaUrls[0].startsWith('http')) {
        return r.mediaUrls[0];
      }
      return undefined;
    };

    const openApiUsageCtx = openApi
      ? mergeUsageContext(undefined, {
          usageSource: 'open_api',
          callerUserId: openApi.callerUserId,
          publishedSlug: openApi.publishedSlug,
          publishedApiId: openApi.publishedApiId,
          endUserId: openApi.endUserId,
        })
      : undefined;

    let result: GenerateResult;
    let syncText: string | undefined;
    let warpContract: Record<string, unknown> | null = null;

    if (warpMode) {
      const { executeMxmWarpTask, contractSnapshotFromCtx } = await import('./mxm-warp/execute-warp-task');
      const warpCtx: TaskContext = {
        ...ctx,
        taskId: syncId,
        params: paramsWithDefaults as Record<string, unknown>,
      };
      const { ctx: afterWarp, text, usageBag } = await executeMxmWarpTask({
        ctx: warpCtx,
        template,
        modelScope: 'text',
        modelKey: physicalModelKey,
        provider: resolved.provider,
      });
      syncText = text;
      warpContract = contractSnapshotFromCtx(afterWarp);
      result = {
        mediaUrls: [],
        text,
        metadata: {
          text,
          usage: usageBag.usage,
          model: usageBag.model ?? physicalModelKey,
          provider: usageBag.provider ?? resolved.provider,
          mxmWarp: true,
          contract: warpContract,
          pipelineTrace: afterWarp.state.pipelineTrace,
        },
      } as unknown as GenerateResult;
    } else {
      // 同步 HTTP 响应必须带完整正文；若沿用流式 outputFormat，generate 只返回 stream 无 text，测试页会显示「无文本」
      const paramsForGen = {
        ...paramsWithDefaults,
        prompt: finalPromptEnhanced,
        useConfiguredPrompt: true,
        logicalModel: routingKey,
        outputFormat: 'json' as const,
      };
      // 必须固定 scope=text：callModelGenerate 内部曾用 runByModelKeyAnyScope，会把仅注册在 graph 的
      // 同名物理键（如 gpt-image-2-all）误当成生图模型，导致 graph 内嵌的 text/format 卡在 20%。
      result = await runByModelKey('text', physicalModelKey, paramsForGen, {
        providerOverride: resolved.provider as any,
      });
      syncText = extractText(result);
    }

    const { costUsd } = await UsageService.logProviderUsage({
      taskId: syncId,
      userId: billingUserId,
      logicalModel: routingKey,
      result: {
        ...result,
        metadata: result.metadata,
      },
      providerOverride: resolved.provider as any,
      usageContext: openApiUsageCtx,
    });

    const finalMetadata: Record<string, unknown> = {
      ...(result.metadata || {}),
      model: result.metadata?.model ?? resolved.model,
      provider: result.metadata?.provider ?? resolved.provider,
      text: syncText,
      taskType: 'text',
      costUsd,
      ...(warpMode ? { mxmWarp: true, contract: warpContract } : {}),
    };

    const usageMeta = finalMetadata as Record<string, any>;
    const inferredScope = UsageService.inferScopePublic(routingKey, usageMeta);
    try {
      await BillingService.consumeForTask({
        taskId: syncId,
        userId: billingUserId!,
        provider: String(finalMetadata.provider || 'unknown'),
        modelKey: String(finalMetadata.model || resolved.model),
        scope: inferredScope,
        inputTokens: Number(usageMeta.usage?.prompt_tokens ?? usageMeta.usage?.input_tokens ?? 0),
        outputTokens: Number(usageMeta.usage?.completion_tokens ?? usageMeta.usage?.output_tokens ?? 0),
        totalTokens: Number(usageMeta.usage?.total_tokens ?? 0),
        imageCount: 0,
        audioSeconds: 0,
        videoSeconds: 0,
        requestCount: 1,
        providerCostUsd: costUsd,
        publishedSlug: openApi?.publishedSlug,
        publishedApiId: openApi?.publishedApiId,
        openApiCallerId: openApi?.callerUserId,
      });
    } catch (billingErr) {
      console.warn('[TaskV2/text] consumeForTask failed:', billingErr);
    }

    return {
      success: true,
      taskId: syncId,
      status: 'completed',
      scope,
      taskKey,
      subtype: subtype ?? null,
      syncResult: {
        text: syncText,
        metadata: finalMetadata,
      },
    };
  }

  const taskManager = taskExecutor.getTaskManager();
  const physicalModel = resolved.model;
  if (!physicalModel) {
    throw new ConfigurationError(
      `[TaskV2] Fatal: resolved.model is empty for scope=${scope}, taskKey=${taskKey}, subtype=${subtype}. ` +
        `resolved={${JSON.stringify(resolved)}}. 请检查该业务的模型路由是否已配置。`
    );
  }
  const promptPatch = buildDeferredAwarePromptPatch(
    deferMediaPrePipeline,
    paramsWithDefaults as Record<string, unknown>,
    finalPromptEnhanced,
  );
  const createParamsBody =
    scope === 'outline'
      ? {
          taskType: 'outline',
          prompt: promptPatch.topLevelPrompt,
          params: {
            ...paramsWithDefaults,
            writing_type: paramsAny.writing_type || 'outlines',
            ...promptPatch.innerPatch,
            logicalModel: physicalModel,
          },
        }
      : scope === 'writing'
        ? {
            taskType: 'generate',
            prompt: promptPatch.topLevelPrompt,
            params: {
              ...paramsWithDefaults,
              writing_type: paramsAny.writing_type || String(taskKey || 'articles'),
              ...promptPatch.innerPatch,
              logicalModel: physicalModel,
            },
          }
        : scope === 'graph'
          ? {
              taskType: 'graph',
              graphType: String(taskKey || ''),
              ...(subtype != null && String(subtype).trim() !== ''
                ? { graphBusinessSubtype: String(subtype).trim() }
                : {}),
              params: {
                ...paramsWithDefaults,
                ...graphParamsExtra,
                ...promptPatch.innerPatch,
                logicalModel: physicalModel,
                graphType: String(taskKey || ''),
              },
            }
          : scope === 'video'
            ? {
                taskType: 'video',
                videoTaskKey: taskKey,
                videoSubtype: subtype ?? null,
                prompt: promptPatch.topLevelPrompt,
                params: {
                  ...paramsWithDefaults,
                  ...promptPatch.innerPatch,
                  logicalModel: physicalModel,
                  videoTaskKey: taskKey,
                  videoSubtype: subtype ?? null,
                },
              }
            : scope === 'audio'
              ? {
                  taskType: 'audio',
                  prompt: promptPatch.topLevelPrompt,
                  ...(deferMediaPrePipeline
                    ? {}
                    : { parameters: buildAudioTtsParameters(paramsWithDefaults, finalPromptEnhanced) }),
                  params: {
                    ...paramsWithDefaults,
                    ...promptPatch.innerPatch,
                    logicalModel: physicalModel,
                  },
                }
              : scope === 'music'
                ? {
                    taskType: 'music',
                    prompt: promptPatch.topLevelPrompt,
                    ...(deferMediaPrePipeline
                      ? {}
                      : {
                          parameters: buildMusicGenerationParameters(
                            paramsWithDefaults,
                            finalPromptEnhanced,
                          ),
                        }),
                    params: {
                      ...paramsWithDefaults,
                      ...promptPatch.innerPatch,
                      logicalModel: physicalModel,
                    },
                  }
              : {
                taskType: scope,
                prompt: promptPatch.topLevelPrompt,
                params: {
                  ...paramsWithDefaults,
                  ...promptPatch.innerPatch,
                  logicalModel: physicalModel,
                },
              };

  const openApiMeta = openApi
    ? {
        billingUserId: openApi.billingUserId,
        openApiCallerId: openApi.callerUserId,
        publishedApiId: openApi.publishedApiId,
        publishedSlug: openApi.publishedSlug,
        ...(openApi.partnerAppId ? { partnerAppId: openApi.partnerAppId } : {}),
        ...(openApi.endUserId ? { endUserId: openApi.endUserId } : {}),
      }
    : {};

  const pipelineStateSnapshot = {
    contextFieldMeta: (ctx.state as { contextFieldMeta?: unknown }).contextFieldMeta,
    pipelineTrace: (ctx.state as { pipelineTrace?: unknown }).pipelineTrace,
    pipeline: (ctx.state as { pipeline?: unknown }).pipeline,
    pipelineNestedUsage: (ctx.state as { pipelineNestedUsage?: unknown }).pipelineNestedUsage,
    nestedTextLast: (ctx.state as { nestedTextLast?: unknown }).nestedTextLast,
    businessPipelinePre: !deferMediaPrePipeline,
    businessPipelinePreDeferred: deferMediaPrePipeline,
    ...(warpMode ? { executionMode: 'mxm-warp' as const } : {}),
    ...(scope === 'audio'
      ? {
          voiceOverPipeline: {
            ttsText: finalPromptEnhanced,
            nestedUsage: (ctx.state as { pipelineNestedUsage?: unknown }).pipelineNestedUsage,
          },
        }
      : {}),
    ...(scope === 'music'
      ? {
          musicPipeline: {
            prompt: finalPromptEnhanced,
            nestedUsage: (ctx.state as { pipelineNestedUsage?: unknown }).pipelineNestedUsage,
          },
        }
      : {}),
    ...(scope === 'graph' && deferBusinessPrePipeline
      ? {
          graphPipeline: {
            briefingPrompt: finalPromptEnhanced,
          },
        }
      : {}),
  };

  const createRes = await taskManager.createTask({
    type: scope,
    model: physicalModel,
    provider: resolved.provider as any,
    params: {
      ...createParamsBody,
      userId: billingUserId,
      callerUserId,
      ...openApiMeta,
      provider: resolved.provider,
      taskV2: { scope, taskKey, subtype: subtype ?? null },
      businessPipelineState: pipelineStateSnapshot,
      metadata: {
        ...((createParamsBody as { params?: { metadata?: Record<string, unknown> } }).params?.metadata ?? {}),
        ...((req.metadata && typeof req.metadata === 'object' ? req.metadata : {}) as Record<string, unknown>),
      },
    },
    userId: billingUserId,
    // graph（以及媒体类任务）默认落库前应转存到存储，避免 base64 进 DB 导致预览与性能问题
    storeToMinio: scope === 'graph' || scope === 'video' || scope === 'audio' || scope === 'music',
  });

  {
    const storage = (taskManager as any).storage;
    if (storage) {
      try {
        const snap = await taskManager.getTask(createRes.taskId);
        const existingMeta = (snap?.task?.metadata ?? {}) as Record<string, unknown>;
        const reqMeta =
          req.metadata && typeof req.metadata === 'object'
            ? (req.metadata as Record<string, unknown>)
            : {};
        await storage.update(createRes.taskId, {
          metadata: {
            ...existingMeta,
            ...reqMeta,
            taskV2: { scope, taskKey, subtype: subtype ?? null },
            businessPipelineState: pipelineStateSnapshot,
            contextFieldMeta: (ctx.state as { contextFieldMeta?: unknown }).contextFieldMeta,
          },
        });
      } catch (metaErr) {
        console.warn('[TaskV2] taskV2 metadata 回写失败:', metaErr);
      }
    }
  }

  if (batchCtx) {
    const storage = (taskManager as any).storage;
    if (storage) {
      try {
        const snap = await taskManager.getTask(createRes.taskId);
        const existingMeta = (snap?.task?.metadata ?? {}) as Record<string, unknown>;
        await storage.update(createRes.taskId, {
          metadata: {
            ...existingMeta,
            parentTaskId: batchCtx.parentTaskId,
            parallelIndex: batchCtx.parallelIndex,
            parallelTotal: batchCtx.parallelTotal,
            batchId: batchCtx.parentTaskId,
            parallelRetryCount: Number(existingMeta.parallelRetryCount ?? 0) || 0,
          },
        });
      } catch (metaErr) {
        console.warn('[TaskV2] 批量子任务 metadata 回写失败:', metaErr);
      }
    }
  }

  const executeParams: Record<string, any> = {
    ...(scope === 'outline'
      ? {
          taskType: 'outline',
          prompt: finalPromptEnhanced,
          params: {
            ...paramsWithDefaults,
            writing_type: paramsAny.writing_type || 'outlines',
            prompt: finalPromptEnhanced,
            useConfiguredPrompt: true,
            logicalModel: physicalModel,
          },
        }
      : scope === 'writing'
        ? {
            // 与 createParamsBody 一致：writing 执行器 switch 只认 outline/generate；
            // 内联路径 executor 会把本对象覆盖回 requestParams，写 'writing' 会导致执行失败
            taskType: 'generate',
            prompt: finalPromptEnhanced,
            params: {
              ...paramsWithDefaults,
              writing_type: paramsAny.writing_type || String(taskKey || 'articles'),
              prompt: finalPromptEnhanced,
              useConfiguredPrompt: true,
              logicalModel: physicalModel,
            },
          }
        : scope === 'graph'
          ? {
              taskType: 'graph',
              graphType: String(taskKey || ''),
              ...(subtype != null && String(subtype).trim() !== ''
                ? { graphBusinessSubtype: String(subtype).trim() }
                : {}),
              params: {
                ...paramsWithDefaults,
                ...graphParamsExtra,
                prompt: finalPromptEnhanced,
                useConfiguredPrompt: true,
                logicalModel: physicalModel,
                graphType: String(taskKey || ''),
              },
            }
          : scope === 'video'
            ? {
                taskType: 'video',
                videoTaskKey: taskKey,
                videoSubtype: subtype ?? null,
                prompt: finalPromptEnhanced,
                params: {
                  ...paramsWithDefaults,
                  prompt: finalPromptEnhanced,
                  useConfiguredPrompt: true,
                  logicalModel: physicalModel,
                  videoTaskKey: taskKey,
                  videoSubtype: subtype ?? null,
                },
              }
            : scope === 'audio'
              ? {
                  taskType: 'audio',
                  prompt: finalPromptEnhanced,
                  parameters: buildAudioTtsParameters(paramsWithDefaults, finalPromptEnhanced),
                  params: {
                    ...paramsWithDefaults,
                    prompt: finalPromptEnhanced,
                    useConfiguredPrompt: true,
                    logicalModel: physicalModel,
                  },
                }
              : scope === 'music'
                ? {
                    taskType: 'music',
                    prompt: finalPromptEnhanced,
                    parameters: buildMusicGenerationParameters(paramsWithDefaults, finalPromptEnhanced),
                    params: {
                      ...paramsWithDefaults,
                      prompt: finalPromptEnhanced,
                      useConfiguredPrompt: true,
                      logicalModel: physicalModel,
                    },
                  }
              : {
                taskType: scope,
                prompt: finalPromptEnhanced,
                params: {
                  ...paramsWithDefaults,
                  prompt: finalPromptEnhanced,
                  useConfiguredPrompt: true,
                  logicalModel: physicalModel,
                },
              }),
    userId,
    provider: resolved.provider,
    // 内联路径 executor 会用本对象覆盖 requestParams；缺这两项会导致
    // mxm-warp 检测（writing-task）与 deferred 前置管线（applyDeferredMediaPrePipeline）失效
    taskV2: { scope, taskKey, subtype: subtype ?? null },
    businessPipelineState: pipelineStateSnapshot,
  };

  const ephemeral = req.options?.ephemeral === true;
  const keepTask = req.options?.keepTask === true;
  if (ephemeral) {
    try {
      await taskExecutor.executeTask({
        taskId: createRes.taskId,
        modelName: physicalModel,
        provider: resolved.provider as any,
        params: executeParams,
        userId,
        storeToMinio: scope === 'graph' || scope === 'video' || scope === 'audio' || scope === 'music',
        awaitFullCompletion: true,
      });
    } catch (runErr) {
      if (!keepTask) {
        try {
          await taskManager.softDeleteTask(createRes.taskId);
        } catch {
          /* ignore */
        }
      }
      throw runErr;
    }

    const snap = await taskManager.getTask(createRes.taskId);
    const t = snap?.task;
    const failed = t?.status === 'failed' || t?.status === 'network_error';
    if (failed) {
      const errMsg = t?.progress?.error || (t as { error?: string }).error || '任务失败';
      if (!keepTask) {
        try {
          await taskManager.softDeleteTask(createRes.taskId);
        } catch {
          /* ignore */
        }
      }
      throw new Error(typeof errMsg === 'string' ? errMsg : String(errMsg));
    }

    const r = t?.result;
    const meta = (r?.metadata && typeof r.metadata === 'object' ? r.metadata : {}) as Record<string, unknown>;
    let outText: string | undefined;
    if (typeof meta.text === 'string' && meta.text.trim()) {
      outText = meta.text.trim();
    } else if (scope === 'outline' && meta.outline != null) {
      try {
        outText = JSON.stringify(meta.outline, null, 2);
      } catch {
        outText = String(meta.outline);
      }
    }

    // Prefer durable MinIO URLs (storageInfo.urls) over proxy paths to soft-deleted child taskIds.
    // Album parents soft-delete ephemeral children; proxy `/media/graph/{childId}` then 404s.
    const durableUrls = Array.isArray(r?.storageInfo?.urls)
      ? r!.storageInfo!.urls.filter((u): u is string => typeof u === 'string' && !!u.trim())
      : [];
    const proxyOrRawUrls = Array.isArray(r?.mediaUrls)
      ? r!.mediaUrls.filter((u): u is string => typeof u === 'string' && !!u.trim())
      : [];
    const syncMediaUrls = durableUrls.length > 0 ? durableUrls : proxyOrRawUrls;

    const syncResult: TaskRunV2Response['syncResult'] = {
      ...(outText ? { text: outText } : {}),
      ...(syncMediaUrls.length > 0 ? { mediaUrls: [...syncMediaUrls] } : {}),
      metadata: meta,
    };
    if (!syncResult.text && (!syncResult.mediaUrls || syncResult.mediaUrls.length === 0)) {
      syncResult.text = JSON.stringify(r ?? {}, null, 2);
    }

    if (!keepTask) {
      try {
        await taskManager.softDeleteTask(createRes.taskId);
      } catch {
        /* ignore */
      }
    }

    return {
      success: true,
      taskId: createRes.taskId,
      status: 'completed',
      scope,
      taskKey,
      subtype: subtype ?? null,
      syncResult,
    };
  }

  if (shouldDeferTaskExecution()) {
    // 保持 pending，供 worker 轮询；queued 由 TaskExecutor.executeTask 在真正开始执行时设置
    return {
      success: true,
      taskId: createRes.taskId,
      status: 'pending',
      scope,
      taskKey,
      subtype: subtype ?? null,
    };
  }

  if (shouldExecuteTasksInline()) {
    taskExecutor
      .executeTask({
        taskId: createRes.taskId,
        modelName: physicalModel,
        provider: resolved.provider as any,
        params: executeParams,
        userId,
        storeToMinio: scope === 'graph' || scope === 'video' || scope === 'audio' || scope === 'music',
      })
      .catch((e) => {
        console.error('[TaskV2] executeTask failed:', e);
      });
  }

  return {
    success: true,
    taskId: createRes.taskId,
    status: createRes.status,
    scope,
    taskKey,
    subtype: subtype ?? null,
  };
}

