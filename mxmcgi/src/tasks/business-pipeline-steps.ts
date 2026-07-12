import type { PipelineStep, TaskContext } from './types';
import { ConfigurationError } from './errors';
import type { TaskRunV2Request } from './types';
import {
  parseNestedTextTaskKey,
  parseNestedVideoTaskKey,
  resolvePipelineMappingValue,
} from './business-pipeline';
import { registerInputStep, registerOutputStep } from './pipeline-registry';
import { resolveContextFields } from './context-field-resolver';
import { parseLlmStructuredOutput, assertShotListOutput, assertCutBeatOutput } from './parse-llm-json';
import { stripTtsStageMarkers } from './strip-tts-stage-markers';

const MAX_PIPELINE_DEPTH = 1;

function setNestedOutputStatePath(
  state: Record<string, unknown>,
  outputStatePath: string,
  value: unknown
): Record<string, unknown> {
  const parts = outputStatePath.split('.').filter(Boolean);
  if (parts.length === 0) return state;
  const next = { ...state };
  let cur: Record<string, unknown> = next;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const existing = cur[key];
    const branch =
      existing && typeof existing === 'object' && !Array.isArray(existing)
        ? { ...(existing as Record<string, unknown>) }
        : {};
    cur[key] = branch;
    cur = branch;
  }
  cur[parts[parts.length - 1]] = value;
  return next;
}

function parseNestedTextStructuredOutput(text: string, nestedKey?: string): unknown {
  const label = nestedKey ? `nestedText「${nestedKey}」` : 'LLM 输出';
  const parsed = parseLlmStructuredOutput(text, label);
  if (nestedKey === 'text/plan/video-shot-list') {
    assertShotListOutput(parsed, text);
  }
  if (nestedKey === 'text/plan/video-cut-beat') {
    assertCutBeatOutput(parsed, text);
  }
  return parsed;
}

function parseVoiceoverSubsFromCtx(ctx: TaskContext): import('../core/video-edit/timeline-segment-types').VoiceoverSubtitleLike[] {
  const raw = ctx.params.voiceover_subtitles_json;
  if (!raw) return [];
  let data: unknown = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw) as unknown;
    } catch {
      return [];
    }
  }
  const arr = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { segments?: unknown }).segments)
      ? (data as { segments: unknown[] }).segments
      : [];
  const out: import('../core/video-edit/timeline-segment-types').VoiceoverSubtitleLike[] = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const text = String((item as { text?: unknown }).text ?? '').trim();
    const startSeconds = Number((item as { startSeconds?: unknown }).startSeconds);
    const endSeconds = Number((item as { endSeconds?: unknown }).endSeconds);
    if (!text || !Number.isFinite(startSeconds) || !Number.isFinite(endSeconds)) continue;
    out.push({ text, startSeconds, endSeconds });
  }
  return out;
}

function readAudioDurationSeconds(ctx: TaskContext): number {
  const fromParams = ctx.params.audio_duration_seconds;
  if (typeof fromParams === 'number' && fromParams > 0) return fromParams;
  if (typeof fromParams === 'string' && Number(fromParams) > 0) return Number(fromParams);
  const voiceoverAudio = ctx.state.voiceoverAudio as { durationSeconds?: number } | undefined;
  return typeof voiceoverAudio?.durationSeconds === 'number' ? voiceoverAudio.durationSeconds : 0;
}

function assertNestedTextOutputComplete(
  nestedKey: string,
  outText: string,
  meta: Record<string, unknown> | undefined,
  inputFields: Record<string, unknown>
): void {
  const usage = meta?.usage as { completion_tokens?: number } | undefined;
  const finishReason = meta?.finish_reason;
  const completionTokens = Number(usage?.completion_tokens ?? 0);
  const trimmed = outText.trim();

  if (finishReason === 'length') {
    throw new ConfigurationError(
      `nestedText「${nestedKey}」输出因 max_tokens 上限被截断（completion_tokens=${completionTokens}）。请在 Admin 提高 generateParams.maxTokens（M3 建议 131072）。`
    );
  }

  const scriptDraft =
    typeof inputFields.script_draft === 'string' ? inputFields.script_draft.trim() : '';
  if (
    nestedKey.includes('tts-markup') &&
    scriptDraft.length > 400 &&
    trimmed.length < Math.min(scriptDraft.length * 0.25, 600)
  ) {
    throw new ConfigurationError(
      `nestedText「${nestedKey}」输出过短（${trimmed.length} 字，初稿约 ${scriptDraft.length} 字）。` +
        `MiniMax-M3 等推理模型可能将 token 预算用于 thinking，导致正文被截断；请提高 maxTokens 或换用非推理模型。`
    );
  }
}

export async function runNestedTextStep(ctx: TaskContext, step: PipelineStep): Promise<TaskContext> {
  const key = step.nestedTextTaskKey?.trim();
  if (!key) {
    throw new ConfigurationError('nestedText 步骤缺少 nestedTextTaskKey');
  }
  if (!key.startsWith('text/')) {
    throw new ConfigurationError(`nestedText 仅允许 text scope 子业务，收到：${key}`);
  }

  const depth = Number((ctx.params as Record<string, unknown>)._pipelineDepth ?? 0);
  if (depth >= MAX_PIPELINE_DEPTH) {
    throw new ConfigurationError('nestedText 嵌套深度超限');
  }

  const { taskKey, subtype } = parseNestedTextTaskKey(key);
  const mapping = step.inputMapping ?? { prompt: '${state.coreArtifact.text}' };
  const nestedParams: Record<string, unknown> = {};
  for (const [field, tmpl] of Object.entries(mapping)) {
    nestedParams[field] = resolvePipelineMappingValue(tmpl, ctx);
  }
  const voiceoverAudio = ctx.state.voiceoverAudio as { durationSeconds?: number } | undefined;
  if (
    (nestedParams.audio_duration_seconds === '' ||
      nestedParams.audio_duration_seconds == null) &&
    typeof voiceoverAudio?.durationSeconds === 'number' &&
    voiceoverAudio.durationSeconds > 0
  ) {
    nestedParams.audio_duration_seconds = voiceoverAudio.durationSeconds;
  }
  if (!nestedParams.prompt && typeof ctx.state.finalPrompt === 'string') {
    nestedParams.prompt = ctx.state.finalPrompt;
  }

  if (key === 'text/plan/video-shot-list') {
    const { normalizeRenderPlanInput } = await import('../core/video-edit/render-plan');
    nestedParams.render_plan = normalizeRenderPlanInput(
      nestedParams.render_plan ?? ctx.params.render_plan
    );
    const cutBeatPlan = ctx.state.cutBeatPlan;
    if (cutBeatPlan && !nestedParams.cut_beats_json) {
      nestedParams.cut_beats_json = JSON.stringify(cutBeatPlan);
    }
  }

  if (key === 'text/plan/video-cut-beat') {
    const rhythmWindows = ctx.state.rhythmWindows;
    if (rhythmWindows && !nestedParams.rhythm_windows_json) {
      nestedParams.rhythm_windows_json = JSON.stringify(rhythmWindows);
    }
  }

  const userId = ctx.userId;
  if (!userId) {
    throw new ConfigurationError('nestedText 需要 userId');
  }

  const req: TaskRunV2Request = {
    scope: 'text',
    taskKey,
    subtype,
    params: {
      ...nestedParams,
      _pipelineDepth: depth + 1,
      metadata: { parentPipelineTaskId: ctx.taskId, nestedTextTaskKey: key },
    },
  };

  const { runTaskV2 } = await import('./task-engine');
  const textTaskResult = await runTaskV2(req, userId);
  if (!textTaskResult.success || !textTaskResult.syncResult) {
    throw new Error(
      `nestedText 调用失败：${key}（taskId=${textTaskResult.taskId}，status=${textTaskResult.status}）`
    );
  }

  const outText = textTaskResult.syncResult.text ?? '';
  const syncMeta = (textTaskResult.syncResult.metadata ?? {}) as Record<string, unknown>;
  assertNestedTextOutputComplete(key, outText, syncMeta, nestedParams);
  const costUsd =
    typeof textTaskResult.syncResult.metadata?.costUsd === 'number'
      ? textTaskResult.syncResult.metadata.costUsd
      : undefined;

  const nestedUsage = Array.isArray(ctx.state.pipelineNestedUsage)
    ? [...(ctx.state.pipelineNestedUsage as unknown[])]
    : [];
  nestedUsage.push({
    nestedTextTaskKey: key,
    taskId: textTaskResult.taskId,
    costUsd,
    usage: textTaskResult.syncResult.metadata?.usage,
  });

  const graphPreFormat = step.params?.graphPreFormat === true;
  const outputStatePath =
    typeof step.params?.outputStatePath === 'string' ? step.params.outputStatePath.trim() : '';
  let nextState: Record<string, unknown> = {
    ...ctx.state,
    pipelineNestedUsage: nestedUsage,
    nestedTextLast: { key, taskId: textTaskResult.taskId, text: outText },
  };

  if (outputStatePath) {
    let parsed = parseNestedTextStructuredOutput(outText, key);

    if (key === 'text/plan/video-cut-beat') {
      const { normalizeCutBeatPlan } = await import('../core/video-edit/cut-beat-plan');
      const rhythmPlan = ctx.state.rhythmWindows as import('../core/video-edit/plan-cut-windows').RhythmWindowsPlan;
      if (!rhythmPlan?.windows?.length) {
        throw new ConfigurationError('video-cut-beat 需要先执行 planVideoCutWindows（state.rhythmWindows）');
      }
      const topic = String(nestedParams.topic ?? ctx.params.topic ?? '').trim();
      parsed = normalizeCutBeatPlan(
        parsed,
        rhythmPlan,
        parseVoiceoverSubsFromCtx(ctx),
        readAudioDurationSeconds(ctx),
        topic || undefined
      );
    }

    if (key === 'text/plan/video-shot-list' && ctx.state.cutBeatPlan) {
      const { mergeBeatPlanWithShotList } = await import('../core/video-edit/cut-beat-plan');
      parsed = mergeBeatPlanWithShotList(
        ctx.state.cutBeatPlan as import('../core/video-edit/cut-beat-plan').CutBeatPlan,
        parsed
      );
    }

    if (key === 'text/plan/video-shot-list') {
      const { enrichShotListRaw } = await import('../core/video-edit/clip-prompt-coherence');
      parsed = enrichShotListRaw(parsed, {
        globalTopic: String(nestedParams.topic ?? ctx.params.topic ?? '').trim() || undefined,
        editStyle: String(nestedParams.edit_style ?? ctx.params.edit_style ?? '').trim() || undefined,
        aspectRatio: String(nestedParams.aspectRatio ?? ctx.params.aspectRatio ?? '').trim() || undefined,
        supplement: String(nestedParams.supplement ?? ctx.params.supplement ?? '').trim() || undefined,
      });
    }

    nextState = setNestedOutputStatePath(nextState, outputStatePath, parsed);
  }

  // 输出目标为歌词：写入 params.lyrics（供 music_generation 使用），不覆盖 finalPrompt/prompt，
  // 这样音乐模板渲染出的曲风描述仍作为 prompt，避免 provider 触发 lyrics_optimizer 自动写词
  if (step.params?.outputTarget === 'lyrics') {
    nextState.lyricsDraft = outText;
    return {
      ...ctx,
      params: { ...ctx.params, lyrics: outText },
      state: nextState,
    };
  }

  if (graphPreFormat || step.params?.afterPromptRender === true) {
    // 防御性兜底：audio 路径剥除 [开场]/[主稿]/[结束] 等段落小标题，避免 LLM 未严格遵循 prompt
    // 时仍把标记词送进 MiniMax TTS 被念出。video / graph / text 路径不受影响。
    const cleanedOutText = ctx.scope === 'audio' ? stripTtsStageMarkers(outText) : outText;
    nextState.promptForModel = cleanedOutText;
    nextState.finalPrompt = cleanedOutText;
    return {
      ...ctx,
      params: { ...ctx.params, prompt: cleanedOutText },
      state: nextState,
    };
  }

  const core = (ctx.state.coreArtifact as Record<string, unknown> | undefined) ?? { kind: 'text' };
  const finalArtifact = {
    ...core,
    kind: 'text' as const,
    text: outText,
    metadata: {
      ...((core.metadata as Record<string, unknown> | undefined) ?? {}),
      nestedTextTaskKey: key,
      nestedTaskId: textTaskResult.taskId,
    },
  };

  return {
    ...ctx,
    state: {
      ...nextState,
      finalArtifact,
      coreArtifact: ctx.state.coreArtifact ?? finalArtifact,
    },
  };
}

export async function runNestedVideoStep(_ctx: TaskContext, _step: PipelineStep): Promise<TaskContext> {
  throw new ConfigurationError(
    'videoTimelineRender / nestedVideo 已改为异步 checkpoint 模式，请经 runPostPipelineWithCheckpoints 执行'
  );
}

export async function runVideoTimelineRenderStep(_ctx: TaskContext, _step: PipelineStep): Promise<TaskContext> {
  return runNestedVideoStep(_ctx, _step);
}

function registerBusinessPipelineSteps(): void {
  registerInputStep('resolveContextFields', async (ctx, step) => {
    const phase = (step.params?.phase as 'pre' | 'post' | undefined) ?? 'pre';
    const kinds = step.params?.kinds as ('kbRecall' | 'webSearch')[] | undefined;
    const formSchema = (step.params?.formSchema ?? ctx.state._formSchema) as import('./types').JsonSchemaV2 | undefined;
    if (!formSchema) {
      const fs = ctx.state._formSchema;
      if (fs && typeof fs === 'object') {
        return resolveContextFields(ctx, fs as import('./types').JsonSchemaV2, { phase, kinds });
      }
      return ctx;
    }
    return resolveContextFields(ctx, formSchema, { phase, kinds });
  });

  registerOutputStep('resolveContextFields', async (ctx, step) => {
    const phase = (step.params?.phase as 'pre' | 'post' | undefined) ?? 'post';
    const kinds = step.params?.kinds as ('kbRecall' | 'webSearch')[] | undefined;
    const formSchema = (step.params?.formSchema ?? ctx.state._formSchema) as import('./types').JsonSchemaV2 | undefined;
    if (!formSchema) {
      const fs = ctx.state._formSchema;
      if (fs && typeof fs === 'object') {
        return resolveContextFields(ctx, fs as import('./types').JsonSchemaV2, { phase, kinds });
      }
      return ctx;
    }
    return resolveContextFields(ctx, formSchema, { phase, kinds });
  });

  registerInputStep('nestedText', async (ctx, step) => runNestedTextStep(ctx, step));
  registerOutputStep('nestedText', async (ctx, step) => runNestedTextStep(ctx, step));

  registerInputStep('resolveVoiceoverAudio', async (ctx, step) => {
    const { runResolveVoiceoverAudioStep } = await import('./voiceover-audio-resolver');
    return runResolveVoiceoverAudioStep(ctx, step);
  });
  registerOutputStep('resolveVoiceoverAudio', async (ctx, step) => {
    const { runResolveVoiceoverAudioStep } = await import('./voiceover-audio-resolver');
    return runResolveVoiceoverAudioStep(ctx, step);
  });

  registerInputStep('transcribeVoiceoverAudio', async (ctx, step) => {
    const { runTranscribeVoiceoverAudioStep } = await import('../core/audio/voiceover-asr-step');
    return runTranscribeVoiceoverAudioStep(ctx, step);
  });
  registerOutputStep('transcribeVoiceoverAudio', async (ctx, step) => {
    const { runTranscribeVoiceoverAudioStep } = await import('../core/audio/voiceover-asr-step');
    return runTranscribeVoiceoverAudioStep(ctx, step);
  });

  registerInputStep('buildVideoEditTimeline', async (ctx, step) => {
    const { runBuildVideoEditTimelineStep } = await import('./build-video-edit-timeline-step');
    return runBuildVideoEditTimelineStep(ctx, step);
  });
  registerOutputStep('buildVideoEditTimeline', async (ctx, step) => {
    const { runBuildVideoEditTimelineStep } = await import('./build-video-edit-timeline-step');
    return runBuildVideoEditTimelineStep(ctx, step);
  });

  registerInputStep('planVideoCutWindows', async (ctx, step) => {
    const { runPlanVideoCutWindowsStep } = await import('./plan-video-cut-windows-step');
    return runPlanVideoCutWindowsStep(ctx, step);
  });
  registerOutputStep('planVideoCutWindows', async (ctx, step) => {
    const { runPlanVideoCutWindowsStep } = await import('./plan-video-cut-windows-step');
    return runPlanVideoCutWindowsStep(ctx, step);
  });

  /** @deprecated 别名 → buildVideoEditTimeline（segmentStrategy=voiceover-subtitles） */
  registerInputStep('buildSciencePopTimeline', async (ctx, step) => {
    const { runBuildVideoEditTimelineStep } = await import('./build-video-edit-timeline-step');
    return runBuildVideoEditTimelineStep(ctx, step);
  });
  registerOutputStep('buildSciencePopTimeline', async (ctx, step) => {
    const { runBuildVideoEditTimelineStep } = await import('./build-video-edit-timeline-step');
    return runBuildVideoEditTimelineStep(ctx, step);
  });

  registerOutputStep('nestedVideo', async (ctx, step) => runNestedVideoStep(ctx, step));
  registerOutputStep('videoTimelineRender', async (ctx, step) => runVideoTimelineRenderStep(ctx, step));

  registerOutputStep('renderDocumentPdf', async (ctx, step) => {
    const { runRenderDocumentPdfStep } = await import('../core/document-render/render-document-pdf-step');
    return runRenderDocumentPdfStep(ctx, step);
  });

  const manualReviewRunner: import('./types').PipelineRunner = async (ctx, step) => {
    const { extractReviewDraftFromContext, enrichVideoTimelineReviewDraft } = await import('./manual-review');
    const phase = (step.params?.phase as 'pre' | 'post' | undefined) ?? 'pre';
    const stepIndex = Number(step.params?._stepIndex ?? 0);
    let draft = extractReviewDraftFromContext(ctx, step, phase, stepIndex);
    if (draft.kind === 'video-timeline') {
      draft = await enrichVideoTimelineReviewDraft(draft, ctx.params as Record<string, unknown>);
    }
    return {
      ...ctx,
      state: {
        ...ctx.state,
        prePipelineReviewText: draft.text,
        __pendingManualReviewDraft: draft,
      },
    };
  };

  registerInputStep('manualReview', manualReviewRunner);
  registerOutputStep('manualReview', manualReviewRunner);
}

registerBusinessPipelineSteps();
