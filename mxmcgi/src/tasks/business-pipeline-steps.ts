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
import { assertAlbumSpecOutput } from '../core/graph/album/album-spec';
import { buildProseDeaiInstruction, normalizeManuscriptLanguage } from './mxm-warp/manuscript-language-directive';

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
  if (nestedKey === 'text/plan/album-spec') {
    assertAlbumSpecOutput(parsed, text);
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
  const {
    assertNestedTextInputMappingKeys,
    assertTextV2TaskKey,
    buildExpertFieldSpecs,
    parseTextV2TypeFromNestedKey,
    parseValidationResult,
  } = await import('./text-v2');
  const textType = parseTextV2TypeFromNestedKey(key);
  if (textType) {
    assertTextV2TaskKey(taskKey);
    assertNestedTextInputMappingKeys(key, step.inputMapping);
  }

  const mapping =
    step.inputMapping ??
    (textType
      ? {}
      : { prompt: '${state.coreArtifact.text}' });
  const nestedParams: Record<string, unknown> = {};
  for (const [field, tmpl] of Object.entries(mapping)) {
    nestedParams[field] = resolvePipelineMappingValue(tmpl, ctx);
  }

  // expert：节点 params.field_specs 优先；否则未绑定时按宿主 schema 自动生成（优先空字段）
  if (textType === 'expert') {
    const fromStep = (step.params as Record<string, unknown> | undefined)?.field_specs;
    if (Array.isArray(fromStep) && fromStep.length > 0) {
      nestedParams.field_specs = fromStep;
    } else if (nestedParams.field_specs == null || nestedParams.field_specs === '') {
      const hostSchema =
        (ctx.state._contractSchema as import('./types').JsonSchemaV2 | undefined) ??
        (ctx.state._formSchema as import('./types').JsonSchemaV2 | undefined);
      nestedParams.field_specs = buildExpertFieldSpecs({
        contract: (ctx.state.contract as Record<string, unknown> | undefined) ?? null,
        contractSchema: hostSchema ?? null,
        onlyEmpty: true,
      });
    }
  }
  if (textType === 'expert' && (nestedParams.contract == null || nestedParams.contract === '')) {
    nestedParams.contract = ctx.state.contract ?? {};
  }
  if (
    (textType === 'plan' || textType === 'validation') &&
    (nestedParams.contract == null || nestedParams.contract === '')
  ) {
    nestedParams.contract = ctx.state.contract ?? {};
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
  if (!textType && !nestedParams.prompt && typeof ctx.state.finalPrompt === 'string') {
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

  // validation 失败：写入 errors 并停在当前步骤
  if (textType === 'validation') {
    const vr = parseValidationResult(outText);
    if (!vr) {
      throw new Error(
        `nestedText「${key}」validation 输出无法解析为 { ok, errors[] }（taskId=${textTaskResult.taskId}）`
      );
    }
    if (!vr.ok) {
      const msg = vr.errors.length ? vr.errors.join('; ') : 'validation failed';
      throw new Error(`管道校验失败（${key}）：${msg}`);
    }
  }

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

  // expert：默认合并 JSON 进合同 business（可用 outputTarget=business 显式）
  const outputTarget = step.params?.outputTarget;
  if (textType === 'expert' && (outputTarget === 'business' || outputTarget == null || outputTarget === '')) {
    try {
      const parsed = parseNestedTextStructuredOutput(outText, key);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const contract =
          nextState.contract && typeof nextState.contract === 'object'
            ? { ...(nextState.contract as Record<string, unknown>) }
            : {};
        const business =
          contract.business && typeof contract.business === 'object'
            ? { ...(contract.business as Record<string, unknown>) }
            : {};
        nextState = {
          ...nextState,
          contract: {
            ...contract,
            business: { ...business, ...(parsed as Record<string, unknown>) },
          },
        };
      }
    } catch {
      /* 非 JSON 时跳过合并，仍保留 nestedTextLast */
    }
  }

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
      const fromShotTopic =
        parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? String((parsed as { global_topic?: unknown }).global_topic ?? '').trim()
          : '';
      const materialType = String(
        nestedParams.material_type ?? ctx.params.material_type ?? ''
      ).trim();
      parsed = enrichShotListRaw(parsed, {
        globalTopic:
          String(nestedParams.topic ?? ctx.params.topic ?? '').trim() ||
          fromShotTopic ||
          undefined,
        editStyle: String(nestedParams.edit_style ?? ctx.params.edit_style ?? '').trim() || undefined,
        aspectRatio: String(nestedParams.aspectRatio ?? ctx.params.aspectRatio ?? '').trim() || undefined,
        supplement: String(nestedParams.supplement ?? ctx.params.supplement ?? '').trim() || undefined,
        defaultAiOutputKind:
          materialType === 'image' || materialType === 'video' ? materialType : undefined,
      });
    }

    if (key === 'text/plan/album-spec') {
      const { normalizeAlbumSpec } = await import('../core/graph/album/album-spec');
      parsed = normalizeAlbumSpec(parsed, {
        maxItems: Number(nestedParams.max_items ?? ctx.params.max_items) || undefined,
      });
    }

    nextState = setNestedOutputStatePath(nextState, outputStatePath, parsed);
  }

  // 自动剪辑：用户未填主题/副标题/节目名/主持人时，用 LLM 识别结果回写 params
  let nextParams = ctx.params;
  if (
    (key === 'text/plan/video-cut-beat' || key === 'text/plan/video-shot-list') &&
    outputStatePath
  ) {
    const metaSrc =
      (outputStatePath
        .split('.')
        .filter(Boolean)
        .reduce<unknown>((acc, part) => {
          if (!acc || typeof acc !== 'object' || Array.isArray(acc)) return undefined;
          return (acc as Record<string, unknown>)[part];
        }, nextState) as Record<string, unknown> | undefined) ?? undefined;
    if (metaSrc && typeof metaSrc === 'object') {
      const fillIfEmpty = (field: string, value: unknown) => {
        const cur = String(nextParams[field] ?? '').trim();
        const next = typeof value === 'string' ? value.trim() : '';
        if (!cur && next) {
          nextParams = { ...nextParams, [field]: next };
        }
      };
      fillIfEmpty('topic', metaSrc.global_topic);
      if (key === 'text/plan/video-shot-list') {
        fillIfEmpty('subtitle', metaSrc.subtitle);
        fillIfEmpty('show_name', metaSrc.show_name);
        fillIfEmpty('host_name', metaSrc.host_name);
      }
    }
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

  if (key === 'text/plan/album-spec' && nextState.albumSpec) {
    return {
      ...ctx,
      params: {
        ...ctx.params,
        album_spec: nextState.albumSpec,
        album_item_count: Array.isArray((nextState.albumSpec as { items?: unknown[] }).items)
          ? (nextState.albumSpec as { items: unknown[] }).items.length
          : undefined,
      },
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
      params: { ...nextParams, prompt: cleanedOutText },
      state: nextState,
    };
  }

  // post 抛光等：同步覆盖 core/final，避免宿主仍读到成文初稿
  const overwriteCore =
    textType === 'transform' ||
    step.params?.outputTarget === 'artifact' ||
    step.params?.overwriteCoreArtifact === true;

  let polishedText = outText;
  if (overwriteCore && step.params?.deterministicPolish === true) {
    const { polishEditorialMarkdown } = await import('./mxm-warp/markdown-polish');
    const basic =
      ctx.state.contract &&
      typeof ctx.state.contract === 'object' &&
      (ctx.state.contract as { basic?: Record<string, unknown> }).basic
        ? ((ctx.state.contract as { basic?: Record<string, unknown> }).basic as Record<string, unknown>)
        : {};
    const lang = String(
      (ctx.params as Record<string, unknown>)?.language ?? basic.language ?? 'zh'
    ).trim();
    polishedText = polishEditorialMarkdown(outText, { language: lang });
  }

  const core = (ctx.state.coreArtifact as Record<string, unknown> | undefined) ?? { kind: 'text' };
  const finalArtifact = {
    ...core,
    kind: 'text' as const,
    text: polishedText,
    metadata: {
      ...((core.metadata as Record<string, unknown> | undefined) ?? {}),
      nestedTextTaskKey: key,
      nestedTaskId: textTaskResult.taskId,
      ...(polishedText !== outText ? { deterministicPolish: true } : {}),
    },
  };

  return {
    ...ctx,
    params: nextParams,
    state: {
      ...nextState,
      finalArtifact,
      coreArtifact: overwriteCore ? finalArtifact : (ctx.state.coreArtifact ?? finalArtifact),
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

/**
 * 平台通用润色步骤（post）：
 * - 默认从 `coreArtifact.text` 取文本；可用 `params.inputFrom` 或 `inputMapping.input` 覆盖
 * - 调用 text/transform/<subtype>（默认 prose-deai）做四语去 AI 感改写
 * - 把结果写回 `coreArtifact.text` 与 `finalArtifact.text`（用于落盘 + 后续 step 引用）
 * - 输入语言从 `params.languageFrom` 推断，默认 `coreArtifact.metadata.language` → `params.language` → `contract.basic.language` → `zh`
 *
 * 设计意图：替代「在 groupItemBatch 内部塞 polishTaskKey」的临时耦合；任何成稿业务
 * 只需在 pipeline.post[] 挂一行就能复用。
 */
export async function runPolishManuscriptStep(
  ctx: TaskContext,
  step: PipelineStep
): Promise<TaskContext> {
  const userId = ctx.userId;
  if (!userId) {
    throw new ConfigurationError('polishManuscript：缺少 userId');
  }
  const params = (step.params ?? {}) as Record<string, unknown>;

  const nestedKey = String(params.nestedTextTaskKey ?? 'text/transform/prose-deai').trim();
  if (!nestedKey.startsWith('text/transform/')) {
    throw new ConfigurationError(
      `polishManuscript 仅允许 text/transform/* 子业务，收到：${nestedKey || '空'}`
    );
  }
  const { taskKey, subtype } = parseNestedTextTaskKey(nestedKey);

  // 输入文本：inputMapping.input > inputFrom > coreArtifact.text
  const mapping = step.inputMapping ?? {};
  let inputText = '';
  const explicitInput = typeof mapping.input === 'string' ? mapping.input.trim() : '';
  if (explicitInput) {
    inputText = String(resolvePipelineMappingValue(explicitInput, ctx) ?? '');
  } else if (typeof params.inputFrom === 'string' && params.inputFrom.trim()) {
    inputText = String(resolvePipelineMappingValue(params.inputFrom.trim(), ctx) ?? '');
  } else {
    const core = ctx.state.coreArtifact as { text?: string } | undefined;
    inputText = String(core?.text ?? '');
  }
  if (!inputText.trim()) {
    // 空文本：不润色，原样返回（避免无意义调 LLM）
    return ctx;
  }

  // 语言：params.languageFrom > coreArtifact.metadata.language > params.language > contract.basic.language > zh
  const langFrom = String(params.languageFrom ?? '').trim();
  let lang = '';
  if (langFrom) {
    lang = String(resolvePipelineMappingValue(langFrom, ctx) ?? '').trim();
  }
  if (!lang) {
    const meta = (ctx.state.coreArtifact as { metadata?: Record<string, unknown> } | undefined)?.metadata;
    if (meta && typeof meta.language === 'string') lang = String(meta.language).trim();
  }
  if (!lang) {
    lang = String((ctx.params as Record<string, unknown>)?.language ?? '').trim();
  }
  if (!lang) {
    const contract = (ctx.state.contract as { basic?: Record<string, unknown> } | undefined)?.basic;
    if (contract && typeof contract.language === 'string') {
      lang = String(contract.language).trim();
    }
  }
  if (!lang) lang = 'zh';
  const language = normalizeManuscriptLanguage(lang);

  // 固定输入：input + instruction；用户可在 params 追加 instruction 覆盖（一般不需要）
  const customInstruction =
    typeof params.instruction === 'string' && params.instruction.trim()
      ? String(params.instruction).trim()
      : '';
  const instruction = customInstruction || buildProseDeaiInstruction(language);

  const depth = Number((ctx.params as Record<string, unknown>)._pipelineDepth ?? 0);
  if (depth >= MAX_PIPELINE_DEPTH) {
    throw new ConfigurationError('polishManuscript 嵌套深度超限');
  }

  const req: TaskRunV2Request = {
    scope: 'text',
    taskKey,
    subtype,
    params: {
      input: inputText,
      instruction,
      _pipelineDepth: depth + 1,
      metadata: {
        parentPipelineTaskId: ctx.taskId,
        nestedTextTaskKey: nestedKey,
        polishLanguage: language,
      },
    },
  };
  const { runTaskV2 } = await import('./task-engine');
  const polishRes = await runTaskV2(req, userId);
  if (!polishRes.success || !polishRes.syncResult) {
    throw new Error(
      `polishManuscript 失败：${nestedKey}（status=${polishRes.status}，taskId=${polishRes.taskId}）`
    );
  }
  const polished = String(polishRes.syncResult.text ?? '').trim();
  if (!polished) {
    throw new Error(`polishManuscript「${nestedKey}」未返回正文`);
  }

  // 确定性抛光：标点、近重复段、AI workshop 套话等
  let finalText = polished;
  if (params.deterministicPolish !== false) {
    try {
      const { polishEditorialMarkdown } = await import('./mxm-warp/markdown-polish');
      finalText = polishEditorialMarkdown(polished, { language }).trim();
      if (!finalText) finalText = polished;
    } catch (polishErr) {
      console.warn('[polishManuscript] deterministicPolish 跳过:', polishErr);
    }
  }

  const core = (ctx.state.coreArtifact as Record<string, unknown> | undefined) ?? { kind: 'text' };
  const coreMeta =
    (core.metadata as Record<string, unknown> | undefined) ?? {};
  const nextCore = {
    ...core,
    kind: 'text' as const,
    text: finalText,
    metadata: {
      ...coreMeta,
      polishManuscriptTaskKey: nestedKey,
      polishManuscriptNestedTaskId: polishRes.taskId,
      ...(language ? { polishLanguage: language } : {}),
    },
  };
  const finalArtifact = (ctx.state.finalArtifact as Record<string, unknown> | undefined) ?? nextCore;

  const nestedUsage = Array.isArray(ctx.state.pipelineNestedUsage)
    ? [...(ctx.state.pipelineNestedUsage as unknown[])]
    : [];
  nestedUsage.push({
    nestedTextTaskKey: nestedKey,
    taskId: polishRes.taskId,
    costUsd:
      typeof polishRes.syncResult.metadata?.costUsd === 'number'
        ? polishRes.syncResult.metadata.costUsd
        : undefined,
    usage: polishRes.syncResult.metadata?.usage,
  });

  return {
    ...ctx,
    state: {
      ...ctx.state,
      coreArtifact: nextCore,
      finalArtifact: { ...finalArtifact, kind: 'text', text: finalText },
      polishManuscriptLast: { key: nestedKey, taskId: polishRes.taskId, text: finalText },
      pipelineNestedUsage: nestedUsage,
    },
  };
}

function registerBusinessPipelineSteps(): void {
  // 行业日报：确定性回填 main_topic（副作用注册 pickMainTopic）
  void import('./mxm-warp/pick-main-topic-step');

  registerInputStep('resolveFolderCardAssets', async (ctx, step) => {
    const { resolveFolderCardAssets } = await import('../folder-cards/resolve-card-assets');
    const formSchema = (step.params?.formSchema ?? ctx.state._formSchema) as
      | import('./types').JsonSchemaV2
      | undefined;
    return resolveFolderCardAssets(ctx, formSchema);
  });

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

  registerInputStep('polishManuscript', async (ctx, step) => runPolishManuscriptStep(ctx, step));
  registerOutputStep('polishManuscript', async (ctx, step) => runPolishManuscriptStep(ctx, step));

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

  registerInputStep('validateAlbumSpec', async (ctx, step) => {
    const { runValidateAlbumSpecStep } = await import('../core/graph/album/validate-album-spec-step');
    return runValidateAlbumSpecStep(ctx, step);
  });
  registerOutputStep('validateAlbumSpec', async (ctx, step) => {
    const { runValidateAlbumSpecStep } = await import('../core/graph/album/validate-album-spec-step');
    return runValidateAlbumSpecStep(ctx, step);
  });

  registerOutputStep('albumImageBatch', async (ctx, step) => {
    const { runAlbumImageBatchStep } = await import('../core/graph/album/album-image-batch-step');
    return runAlbumImageBatchStep(ctx, step);
  });

  registerOutputStep('groupFanout', async (ctx, step) => {
    const { runGroupFanoutStep } = await import('./group-fanout-step');
    return runGroupFanoutStep(ctx, step);
  });

  registerInputStep('groupItemBatch', async (ctx, step) => {
    const { runGroupItemBatchStep } = await import('./group-item-batch-step');
    return runGroupItemBatchStep(ctx, step);
  });
  registerOutputStep('groupItemBatch', async (ctx, step) => {
    const { runGroupItemBatchStep } = await import('./group-item-batch-step');
    return runGroupItemBatchStep(ctx, step);
  });

  registerInputStep('assembleGroupText', async (ctx, step) => {
    const { runAssembleGroupTextStep } = await import('./assemble-group-text-step');
    return runAssembleGroupTextStep(ctx, step);
  });
  registerOutputStep('assembleGroupText', async (ctx, step) => {
    const { runAssembleGroupTextStep } = await import('./assemble-group-text-step');
    return runAssembleGroupTextStep(ctx, step);
  });

  const manualReviewRunner: import('./types').PipelineRunner = async (ctx, step) => {
    const { extractReviewDraftFromContext, enrichVideoTimelineReviewDraft } = await import('./manual-review');
    const phase = (step.params?.phase as 'pre' | 'post' | undefined) ?? 'pre';
    const stepIndex = Number(step.params?._stepIndex ?? 0);
    // interactiveCard：params 已含必填字段时跳过闸门（C 端 pre 引导后创建）
    if (step.step === 'interactiveCard' && interactiveCardFieldsAlreadyFilled(ctx, step)) {
      return ctx;
    }
    let effective = step;
    if (step.step === 'interactiveCard') {
      const kind =
        typeof step.params?.kind === 'string' && step.params.kind.trim()
          ? step.params.kind
          : 'interactive-card';
      effective = {
        ...step,
        step: 'manualReview',
        params: { ...(step.params ?? {}), kind, phase },
      };
    }
    let draft = await extractReviewDraftFromContext(ctx, effective, phase, stepIndex);
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
  registerInputStep('interactiveCard', manualReviewRunner);
  registerOutputStep('interactiveCard', manualReviewRunner);
}

/** pre 交互卡：必填字段已在 params 中则无需再暂停 */
function interactiveCardFieldsAlreadyFilled(
  ctx: import('./types').TaskContext,
  step: import('./types').PipelineStep
): boolean {
  const fields = step.params?.fields;
  if (!Array.isArray(fields) || fields.length === 0) return false;
  const params = ctx.params as Record<string, unknown>;
  for (const raw of fields) {
    if (!raw || typeof raw !== 'object') continue;
    const f = raw as { name?: string; required?: boolean };
    if (!f.name || f.required === false) continue;
    const v = params[f.name];
    if (v == null || String(v).trim() === '') return false;
    if (f.name === 'industry' && String(v) === '其他') {
      if (!String(params.industry_custom ?? '').trim()) return false;
    }
    const mode = String(v);
    if (
      f.name === 'date_mode' &&
      (mode === 'custom' || mode === '指定日期') &&
      !/^\d{4}-\d{2}-\d{2}$/.test(String(params.report_date ?? '').trim())
    ) {
      return false;
    }
  }
  return true;
}

registerBusinessPipelineSteps();
