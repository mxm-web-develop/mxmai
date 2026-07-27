/**
 * 异步 Task V2：提交时快速建任务，完整前置管线（检索 / 敏感词 / nestedText / manualReview 等）在 worker 内执行
 */
import { loadTaskDefinition } from './task-definition';
import { renderPromptFromTemplate } from './prompt-template';
import { mergeEffectivePipeline } from './business-pipeline-defaults';
import { buildAudioTtsParameters, normalizeAudioVoiceParams } from './audio-tts-params';
import { buildMusicGenerationParameters, normalizeMusicFormParams } from './music-generation-params';
import type { TaskContext, TaskScope, TaskTemplate } from './types';
import { ConfigurationError } from './errors';
import {
  markPrePipelineComplete,
  persistManualReviewPause,
  runPrePipelineWithCheckpoints,
} from './manual-review';
import { PAUSE_FOR_MANUAL_REVIEW } from './manual-review-types';

export type DeferredPrePipelineTaskType =
  | 'outline'
  | 'writing'
  | 'graph'
  | 'video'
  | 'audio'
  | 'music';

function resolveFinalPromptEnhanced(finalPrompt: string, state: Record<string, unknown>): string {
  const promptForModel = state.promptForModel;
  if (typeof promptForModel === 'string' && promptForModel.trim()) {
    return promptForModel.trim();
  }
  const fp = state.finalPrompt;
  if (typeof fp === 'string' && fp.trim()) {
    return fp.trim();
  }
  return finalPrompt;
}

function isDeferredNestedTextStep(step: { step?: string; params?: Record<string, unknown> }): boolean {
  return (
    step.step === 'nestedText' &&
    (step.params?.graphPreFormat === true || step.params?.afterPromptRender === true)
  );
}

function hasDeferredPrePromptSteps(
  scope: string,
  template: TaskTemplate,
  rowExtra?: Record<string, unknown> | null
): boolean {
  const normalizedPre = template.pipeline?.pre ?? [];
  if (normalizedPre.some(isDeferredNestedTextStep)) return true;
  const { pre } = mergeEffectivePipeline(scope, template, rowExtra ?? (template.extra as Record<string, unknown>) ?? null);
  return pre.some(isDeferredNestedTextStep);
}

/** 异步 scope 提交时不跑前置，由 worker 执行（text 同步 scope 除外） */
export function shouldDeferBusinessPrePipeline(scope: string): boolean {
  return scope !== 'text';
}

/** @deprecated 使用 shouldDeferBusinessPrePipeline */
export function shouldDeferBusinessPrePromptPipeline(
  scope: string,
  template: TaskTemplate,
  rowExtra?: Record<string, unknown> | null
): boolean {
  void template;
  void rowExtra;
  return shouldDeferBusinessPrePipeline(scope);
}

/** 占位 prompt 未经 nestedText 改写时不应直接 TTS（含 Markdown 会导致 MiniMax 只合成极短音频） */
export function isVoiceOverPlaceholderPrompt(text: string): boolean {
  const t = text.trim();
  return t.includes('（正文由 text/transform 管线生成') || (t.startsWith('【源文本】') && /^#+\s/m.test(t));
}

function mergeContextFieldMetaIntoCtx(ctx: TaskContext): TaskContext {
  const contextFieldMeta = ctx.state.contextFieldMeta as Record<string, unknown> | undefined;
  const contextFieldRaw = ctx.state.contextFieldRaw as Record<string, unknown> | undefined;
  if (!contextFieldMeta || Object.keys(contextFieldMeta).length === 0) return ctx;
  return {
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

function deferredPreProgressMessage(taskType: DeferredPrePipelineTaskType, phase: 'pre' | 'format'): string {
  if (phase === 'pre') {
    if (taskType === 'writing' || taskType === 'outline') return '正在检索知识库与联网资料…';
    return '正在执行前置步骤…';
  }
  if (taskType === 'audio') return '口播稿撰写中…';
  if (taskType === 'music') return '歌词草稿生成中…';
  if (taskType === 'graph') return '提示词格式化中…';
  return '正在格式化提示词…';
}

function deferredPreReviewMessage(gateLabel?: string): string {
  if (gateLabel) return `${gateLabel}，等待人工审核…`;
  return '前置内容已生成，等待人工审核…';
}

/** 提交阶段若误把 rendered template 写入 params.prompt，从模板段还原用户话题 */
export function restoreUserTopicIfPromptContaminated(params: Record<string, unknown>): Record<string, unknown> {
  const prompt = typeof params.prompt === 'string' ? params.prompt.trim() : '';
  if (!prompt || !prompt.startsWith('【角色】')) return params;
  const match = prompt.match(/【用户话题[^】]*】\s*\n([^\n]+)/);
  const topic = match?.[1]?.trim();
  if (!topic || topic.startsWith('【角色】') || topic.length > 800) return params;
  return { ...params, prompt: topic };
}

function buildInnerParamsWithPrompt(
  normalized: Record<string, unknown>,
  finalPromptEnhanced: string,
  params: Record<string, any>,
  extras?: Record<string, unknown>
): Record<string, unknown> {
  const innerParams = (params.params ?? params) as Record<string, unknown>;
  return {
    ...normalized,
    ...extras,
    prompt: finalPromptEnhanced,
    useConfiguredPrompt: true,
    logicalModel: (innerParams.logicalModel as string | undefined) ?? params.logicalModel,
  };
}

export async function applyDeferredMediaPrePipeline(args: {
  taskId: string;
  taskType: DeferredPrePipelineTaskType;
  params: Record<string, any>;
  userId?: string;
  onProgress?: (update: { progress: number; message: string }) => Promise<void>;
}): Promise<Record<string, any>> {
  const { taskId, taskType, params, userId, onProgress } = args;
  const pipelineState = (params.businessPipelineState ?? {}) as Record<string, unknown>;

  if (pipelineState.businessPipelinePreDone === true) {
    return params;
  }
  if (pipelineState.businessPipelinePreDeferred !== true) {
    return params;
  }

  const taskV2 = (params.taskV2 ?? {}) as {
    scope?: string;
    taskKey?: string;
    subtype?: string | null;
  };
  if (!taskV2.scope || !taskV2.taskKey) {
    return params;
  }

  const { row, template, formSchema } = await loadTaskDefinition({
    scope: taskV2.scope as TaskScope,
    taskKey: taskV2.taskKey,
    subtype: taskV2.subtype ?? null,
  });

  const rowExtra = (row.extra ?? null) as Record<string, unknown> | null;

  // mxm-warp：五段在 writing/text 执行器内跑，跳过旧版 deferred pre（避免 pre 双跑）
  {
    const { isMxmWarpExecution } = await import('./mxm-warp/warp-runner');
    if (
      isMxmWarpExecution(template, rowExtra) ||
      pipelineState.executionMode === 'mxm-warp'
    ) {
      console.info('[DeferredBusinessPrePipeline] 跳过（mxm-warp）', { taskId, taskType });
      return {
        ...params,
        businessPipelineState: {
          ...pipelineState,
          executionMode: 'mxm-warp',
          businessPipelinePreDone: true,
          businessPipelinePreDeferred: false,
        },
      };
    }
  }

  const expectsNestedText = hasDeferredPrePromptSteps(taskV2.scope, template, rowExtra);

  console.info('[DeferredBusinessPrePipeline] 开始前置管线', {
    taskId,
    taskType,
    scope: taskV2.scope,
    expectsNestedText,
    checkpoint: pipelineState.reviewCheckpoint,
  });

  const innerParams = restoreUserTopicIfPromptContaminated(
    (params.params ?? params) as Record<string, unknown>,
  );
  const normalized =
    taskType === 'audio'
      ? normalizeAudioVoiceParams(innerParams)
      : taskType === 'music'
        ? normalizeMusicFormParams(innerParams)
        : { ...innerParams };

  let ctx: TaskContext = {
    scope: taskV2.scope as TaskScope,
    taskKey: taskV2.taskKey,
    subtype: taskV2.subtype ?? null,
    userId,
    taskId,
    params: normalized,
    state: { ...pipelineState },
  };

  if (onProgress) {
    await onProgress({
      progress: taskType === 'graph' ? 12 : 10,
      message: deferredPreProgressMessage(taskType, 'pre'),
    });
  }

  const renderFinalPrompt = (): string => {
    const { finalPrompt } = renderPromptFromTemplate({
      prompt: template.prompt,
      paramsSchema: template.formSchema ?? formSchema,
      params: ctx.params,
      contextVars: {
        userId: userId ?? '',
        taskId,
        uuid: '',
        timestamp: Date.now(),
        date: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
        subtype: taskV2.subtype ?? '',
      },
    });
    return finalPrompt;
  };

  if (expectsNestedText && onProgress) {
    await onProgress({
      progress: taskType === 'video' ? 22 : 18,
      message: deferredPreProgressMessage(taskType, 'format'),
    });
  }

  const { getVideoEditPreStepProgress, transcribeProgressMessage } = await import('./video-edit-pre-progress');

  const persistPreCheckpoint = async (stepCtx: import('./types').TaskContext) => {
    const { mergeParamsWithPipelineState } = await import('../task/pipeline-retry');
    const { taskExecutor } = await import('../task/task-executor');
    const merged = mergeParamsWithPipelineState(params, {
      ...pipelineState,
      ...stepCtx.state,
      businessPipelinePreDeferred: true,
      businessPipelinePreDone: false,
      pipelineRetryEligible: true,
    });
    await taskExecutor.getTaskManager().updateTaskRequestParams(taskId, merged);
  };

  const outcome = await runPrePipelineWithCheckpoints({
    ctx,
    template,
    scope: taskV2.scope,
    rowExtra,
    renderFinalPrompt,
    onStepCheckpoint: persistPreCheckpoint,
    onPreStepStart:
      taskType === 'video' && onProgress
        ? async (step) => {
            const { progress, message } = getVideoEditPreStepProgress(step);
            await onProgress({ progress, message });
          }
        : undefined,
    onPreStepComplete:
      taskType === 'video' && onProgress
        ? async (step, _index, stepCtx) => {
            if (step.step !== 'transcribeVoiceoverAudio') return;
            const meta = stepCtx.state.voiceoverAsrMeta as { skipped?: boolean; reason?: string } | undefined;
            if (!meta?.skipped) return;
            const { progress, message } = transcribeProgressMessage(meta.reason);
            await onProgress({ progress, message });
          }
        : undefined,
  });

  ctx = mergeContextFieldMetaIntoCtx(outcome.ctx);

  if (outcome.kind === 'paused') {
    if (onProgress) {
      await onProgress({
        progress: 35,
        message: deferredPreReviewMessage(outcome.gate.label),
      });
    }
    const base = await persistManualReviewPause({
      taskId,
      gate: outcome.gate,
      draft: outcome.draft,
      execParams: params,
      taskType,
      finalPrompt: outcome.finalPrompt,
    });
    const innerWithPrompt = buildInnerParamsWithPrompt(
      ctx.params as Record<string, unknown>,
      outcome.finalPrompt ?? '',
      params
    );
    return {
      ...base,
      params: innerWithPrompt,
      [PAUSE_FOR_MANUAL_REVIEW]: true as const,
    };
  }

  const finalPrompt = outcome.finalPrompt ?? renderFinalPrompt();
  const finalPromptEnhanced = resolveFinalPromptEnhanced(finalPrompt, ctx.state as Record<string, unknown>);

  if (expectsNestedText) {
    const trace = (ctx.state.pipelineTrace as { step?: string; skipped?: boolean }[] | undefined) ?? [];
    const nestedEntries = trace.filter((e) => e.step === 'nestedText');
    const nestedRan = nestedEntries.some((e) => !e.skipped);
    const nestedSkipped = nestedEntries.some((e) => e.skipped === true);
    if (!nestedRan && !nestedSkipped) {
      throw new ConfigurationError(
        `[DeferredBusinessPrePipeline] 前置 nestedText 未执行（taskId=${taskId}）。请检查 Admin 执行管线与 text 子业务路由。`
      );
    }
  }

  if (taskType === 'audio' && isVoiceOverPlaceholderPrompt(finalPromptEnhanced)) {
    throw new ConfigurationError(
      '[DeferredBusinessPrePipeline] 口播前置改写未生效，仍为占位/Markdown 源文本，已阻止直接 TTS。'
    );
  }

  const nextPipelineState = {
    ...pipelineState,
    ...ctx.state,
    contextFieldMeta: ctx.state.contextFieldMeta,
    businessPipelinePreDone: true,
    businessPipelinePreDeferred: false,
    businessPipelineAwaitingReview: false,
    pipelineNestedUsage: ctx.state.pipelineNestedUsage,
    pipelineTrace: ctx.state.pipelineTrace,
    reviewCheckpoint: undefined,
    currentReviewGate: undefined,
  };

  const graphType = String(params.graphType ?? taskV2.taskKey ?? '');
  const graphBusinessSubtype =
    typeof params.graphBusinessSubtype === 'string' && params.graphBusinessSubtype.trim()
      ? String(params.graphBusinessSubtype).trim()
      : taskV2.subtype != null && String(taskV2.subtype).trim()
        ? String(taskV2.subtype).trim()
        : undefined;

  const graphInnerExtras =
    taskType === 'graph'
      ? {
          graphPipelineFormatted: true,
          graphType,
        }
      : {};

  const innerWithPrompt = buildInnerParamsWithPrompt(
    ctx.params as Record<string, unknown>,
    finalPromptEnhanced,
    params,
    graphInnerExtras
  );

  if (taskType === 'audio') {
    return markPrePipelineComplete({
      ...params,
      taskType: 'audio',
      prompt: finalPromptEnhanced,
      parameters: buildAudioTtsParameters(ctx.params as Record<string, unknown>, finalPromptEnhanced),
      params: innerWithPrompt,
      businessPipelineState: {
        ...nextPipelineState,
        voiceOverPipeline: {
          ttsText: finalPromptEnhanced,
          nestedUsage: ctx.state.pipelineNestedUsage,
        },
      },
    });
  }

  if (taskType === 'music') {
    const lyricsRaw = (ctx.params as Record<string, unknown>).lyrics;
    const lyrics = typeof lyricsRaw === 'string' ? lyricsRaw.trim() : '';
    return markPrePipelineComplete({
      ...params,
      taskType: 'music',
      prompt: finalPromptEnhanced,
      parameters: buildMusicGenerationParameters(ctx.params as Record<string, unknown>, finalPromptEnhanced),
      params: innerWithPrompt,
      businessPipelineState: {
        ...nextPipelineState,
        musicPipeline: {
          prompt: finalPromptEnhanced,
          ...(lyrics ? { lyrics } : {}),
          nestedUsage: ctx.state.pipelineNestedUsage,
        },
      },
    });
  }

  if (taskType === 'graph') {
    return markPrePipelineComplete({
      ...params,
      taskType: 'graph',
      graphType,
      ...(graphBusinessSubtype ? { graphBusinessSubtype } : {}),
      prompt: finalPromptEnhanced,
      params: innerWithPrompt,
      businessPipelineState: {
        ...nextPipelineState,
        graphPipeline: {
          prompt: finalPromptEnhanced,
          nestedUsage: ctx.state.pipelineNestedUsage,
        },
      },
    });
  }

  if (taskType === 'video') {
    return markPrePipelineComplete({
      ...params,
      taskType: 'video',
      videoTaskKey: params.videoTaskKey ?? taskV2.taskKey,
      videoSubtype: params.videoSubtype ?? taskV2.subtype ?? null,
      prompt: finalPromptEnhanced,
      params: innerWithPrompt,
      businessPipelineState: nextPipelineState,
    });
  }

  return markPrePipelineComplete({
    ...params,
    taskType: taskType === 'outline' ? 'outline' : 'generate',
    prompt: finalPromptEnhanced,
    params: innerWithPrompt,
    businessPipelineState: nextPipelineState,
  });
}
