/**
 * audio + mxm-warp：在 worker 内跑五段（pre→input→enrich→skipOutput→post），
 * 再用 enrich 成稿调用 TTS（speech 路由）。
 * group/多人语音：若 post 已混音或 contract.business.lines 存在，则逐句 TTS→时间轴→成片，跳过单次 TTS。
 */
import { loadTaskDefinition } from './task-definition';
import { buildAudioTtsParameters, ensureTtsEdgePauses, normalizeAudioVoiceParams } from './audio-tts-params';
import type { TaskContext, TaskScope, TaskTemplate } from './types';
import {
  persistManualReviewPause,
  buildPersistedParamsForAwaitingReview,
  buildTaskMetadataForAwaitingReview,
} from './manual-review';
import { PAUSE_FOR_MANUAL_REVIEW } from './manual-review-types';

function resolveWarpTextModel(
  template: TaskTemplate,
  rowExtra: Record<string, unknown> | null
): { provider: string; model: string } {
  const fromExtra =
    (template.extra as Record<string, unknown> | undefined)?.warpTextModel ??
    rowExtra?.warpTextModel;
  if (fromExtra && typeof fromExtra === 'object' && !Array.isArray(fromExtra)) {
    const m = fromExtra as { provider?: string; model?: string };
    if (typeof m.model === 'string' && m.model.trim()) {
      return {
        provider: typeof m.provider === 'string' && m.provider.trim() ? m.provider.trim() : 'maxplan',
        model: m.model.trim(),
      };
    }
  }
  return { provider: 'maxplan', model: 'MiniMax-M3' };
}

function readContractLines(ctx: TaskContext): unknown[] | null {
  const contract = ctx.state.contract as Record<string, unknown> | undefined;
  const business = contract?.business as Record<string, unknown> | undefined;
  const lines = business?.lines;
  return Array.isArray(lines) && lines.length > 0 ? lines : null;
}

/** 若 post 未混音但已有 lines，则在此补跑 TTS→轴→混音 */
async function ensureDialogueMix(
  ctx: TaskContext,
  onProgress?: (update: { progress: number; message: string }) => Promise<void>
): Promise<TaskContext> {
  const existing = ctx.state.dialogueMix as { audioUrl?: string } | undefined;
  if (existing?.audioUrl) return ctx;

  const lines = readContractLines(ctx);
  if (!lines) return ctx;

  await import('./business-pipeline-steps');
  const { runDialogueLineTtsStep } = await import('./dialogue-line-tts-step');
  const { runResolveDialogueTimelineStep } = await import('./resolve-dialogue-timeline-step');
  const { runRenderAudioTimelineStep } = await import('./render-audio-timeline-step');

  if (onProgress) await onProgress({ progress: 78, message: '正在并发生成多段口播…' });
  let next = await runDialogueLineTtsStep(ctx, {
    step: 'dialogueLineTts',
    params: {
      linesFrom: 'contract.business.lines',
      castFrom: 'contract.business.cast',
      model: String(ctx.params.tts_model ?? 'speech-2.8-hd').trim() || 'speech-2.8-hd',
      concurrency: 2,
      maxItems: 120,
    },
  });

  if (onProgress) await onProgress({ progress: 88, message: '正在展开对话时间轴…' });
  next = await runResolveDialogueTimelineStep(next, {
    step: 'resolveDialogueTimeline',
    params: { linesFrom: 'contract.business.lines' },
  });

  if (onProgress) await onProgress({ progress: 92, message: '正在按时间轴混音成片…' });
  next = await runRenderAudioTimelineStep(next, {
    step: 'renderAudioTimeline',
    params: { linesFrom: 'contract.business.lines' },
  });

  return next;
}

export async function applyAudioMxmWarpPipeline(args: {
  taskId: string;
  params: Record<string, any>;
  userId?: string;
  onProgress?: (update: { progress: number; message: string }) => Promise<void>;
}): Promise<Record<string, any> | null> {
  const { taskId, params, userId, onProgress } = args;
  const pipelineState = (params.businessPipelineState ?? {}) as Record<string, unknown>;
  const taskV2 = (params.taskV2 ?? {}) as {
    scope?: string;
    taskKey?: string;
    subtype?: string | null;
  };
  if (!taskV2.scope || !taskV2.taskKey || taskV2.scope !== 'audio') {
    return null;
  }

  const { row, template } = await loadTaskDefinition({
    scope: taskV2.scope as TaskScope,
    taskKey: taskV2.taskKey,
    subtype: taskV2.subtype ?? null,
  });
  const rowExtra = (row.extra ?? null) as Record<string, unknown> | null;
  const { detectMxmWarp, executeMxmWarpTask, contractSnapshotFromCtx } = await import(
    './mxm-warp/execute-warp-task'
  );
  if (
    !detectMxmWarp(template, rowExtra) &&
    pipelineState.executionMode !== 'mxm-warp'
  ) {
    return null;
  }

  const resumeAt: 'start' | 'output' =
    pipelineState.mxmWarpResumeAt === 'output' && !pipelineState.warpCursor ? 'output' : 'start';

  if (onProgress) {
    await onProgress({
      progress: resumeAt === 'output' ? 70 : 12,
      message:
        resumeAt === 'output'
          ? '审核通过，准备合成口播…'
          : pipelineState.warpCursor
            ? '继续口播流程…'
            : '口播稿撰写中…',
    });
  }

  const innerParams = normalizeAudioVoiceParams(
    ((params.params ?? params) as Record<string, unknown>) || {}
  );
  const { provider, model: modelKey } = resolveWarpTextModel(template, rowExtra);
  // 口播物理模型（speech-*）；勿与 Warp 文本模型（如 MiniMax-M3）混淆
  const ttsModel =
    String(
      innerParams.tts_model ??
        params.tts_model ??
        (template.extra as { tts_model?: string } | undefined)?.tts_model ??
        rowExtra?.tts_model ??
        ''
    ).trim() || 'speech-2.8-hd';

  const warpCtx: TaskContext = {
    scope: taskV2.scope,
    taskKey: taskV2.taskKey,
    subtype: taskV2.subtype ?? null,
    userId,
    taskId,
    params: {
      ...innerParams,
      model: modelKey,
      logicalModel: modelKey,
      tts_model: ttsModel,
      provider,
      // 默认开句级字幕；业务可显式 subtitle_enable=false 关闭
      subtitle_enable: innerParams.subtitle_enable !== false,
    },
    state: {
      ...pipelineState,
      executionMode: 'mxm-warp',
      ...(pipelineState.warpCursor ? { mxmWarpResumeAt: undefined } : {}),
    },
  };

  const { ctx: afterWarp, text, paused } = await executeMxmWarpTask({
    ctx: warpCtx,
    template,
    modelScope: 'text',
    modelKey,
    provider,
    resumeAt,
    onProgress: onProgress
      ? async (u) => {
          await onProgress({ progress: u.progress, message: u.message });
        }
      : undefined,
  });

  if (paused) {
    const nextResume =
      paused.gate.kind === 'interactive-card' || paused.gate.kind === 'basic-form'
        ? 'start'
        : 'output';
    const execParams = {
      ...params,
      businessPipelineState: {
        ...pipelineState,
        ...afterWarp.state,
        executionMode: 'mxm-warp',
        mxmWarpResumeAt: nextResume,
        contract: contractSnapshotFromCtx(afterWarp) ?? afterWarp.state.contract,
      },
    };
    const pausedParams = await persistManualReviewPause({
      taskId,
      gate: paused.gate,
      draft: paused.draft,
      execParams: execParams as Record<string, any>,
      taskType: 'audio',
      finalPrompt: text || undefined,
    });
    return {
      ...buildPersistedParamsForAwaitingReview(pausedParams),
      [PAUSE_FOR_MANUAL_REVIEW]: true as const,
      __manualReviewGate: paused.gate,
      __manualReviewDraft: paused.draft,
      __pauseForManualReview: true,
    };
  }

  // 多人语音 / 对话组：逐句 TTS + 时间轴混音
  let mixCtx = afterWarp;
  if (readContractLines(afterWarp) || afterWarp.state.dialogueMix) {
    mixCtx = await ensureDialogueMix(afterWarp, onProgress);
    const mix = mixCtx.state.dialogueMix as { audioUrl?: string; totalDurationMs?: number } | undefined;
    const audioUrl = mix?.audioUrl || String(mixCtx.params.dialogue_mix_audio_url ?? '').trim();
    if (!audioUrl) {
      throw new Error('mxm-warp audio group：对话混音未产出 audioUrl');
    }
    const durationSeconds =
      typeof mixCtx.params.audio_duration_seconds === 'number'
        ? mixCtx.params.audio_duration_seconds
        : mix?.totalDurationMs
          ? Math.round((mix.totalDurationMs / 1000) * 100) / 100
          : undefined;

    return {
      ...params,
      __preRenderedAudio: true,
      mediaUrls: [audioUrl],
      params: {
        ...innerParams,
        ...mixCtx.params,
        dialogue_mix_audio_url: audioUrl,
        audio_url: audioUrl,
        ...(durationSeconds != null ? { audio_duration_seconds: durationSeconds } : {}),
      },
      businessPipelineState: {
        ...pipelineState,
        ...mixCtx.state,
        executionMode: 'mxm-warp',
        businessPipelinePreDone: true,
        businessPipelinePreDeferred: false,
        contract: contractSnapshotFromCtx(mixCtx) ?? mixCtx.state.contract,
        dialogueMix: mixCtx.state.dialogueMix,
        dialogueTimeline: mixCtx.state.dialogueTimeline,
      },
      metadata: {
        dialogueMix: true,
        duration: durationSeconds,
        audio_seconds: durationSeconds,
        storage_bucket: (mixCtx.state.dialogueMix as { bucket?: string } | undefined)?.bucket,
        storage_key: (mixCtx.state.dialogueMix as { key?: string } | undefined)?.key,
      },
    };
  }

  const ttsText = ensureTtsEdgePauses(text.trim());
  if (!ttsText) {
    throw new Error('mxm-warp audio：enrich 未产出口播合成文本');
  }

  const mergedParams = normalizeAudioVoiceParams({
    ...innerParams,
    ...afterWarp.params,
    prompt: ttsText,
  });
  const parameters = buildAudioTtsParameters(mergedParams, ttsText);

  if (onProgress) {
    await onProgress({ progress: 78, message: '正在合成语音…' });
  }

  return {
    ...params,
    params: {
      ...mergedParams,
      prompt: ttsText,
      useConfiguredPrompt: true,
      parameters,
    },
    prompt: ttsText,
    parameters,
    businessPipelineState: {
      ...pipelineState,
      ...afterWarp.state,
      executionMode: 'mxm-warp',
      businessPipelinePreDone: true,
      businessPipelinePreDeferred: false,
      contract: contractSnapshotFromCtx(afterWarp) ?? afterWarp.state.contract,
      finalPrompt: ttsText,
      promptForModel: ttsText,
      voiceOverPipeline: { ttsText },
    },
  };
}

export { buildTaskMetadataForAwaitingReview };
