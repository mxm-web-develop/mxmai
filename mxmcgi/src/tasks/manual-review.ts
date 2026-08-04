/**
 * 多闸门人工审核 — 草稿提取、审核通过写回、checkpoint 执行
 */
import { interpolatePipelineTemplate } from './business-pipeline';
import { mergeEffectivePipeline } from './business-pipeline-defaults';
import { buildAudioTtsParameters } from './audio-tts-params';
import { buildMusicGenerationParameters } from './music-generation-params';
import {
  appendSkippedPipelineTrace,
  shouldRunPipelineStep,
} from './pipeline-step-when';
import type { CoreArtifact, PipelineStep, TaskContext, TaskTemplate } from './types';
import type {
  ManualReviewGateInfo,
  ManualReviewKind,
  ManualReviewPhase,
  ReviewCheckpoint,
  ReviewDraftPayload,
} from './manual-review-types';
import {
  PAUSE_FOR_MANUAL_REVIEW,
  isManualReviewStep,
  parseManualReviewStepParams,
  resolveGateId,
} from './manual-review-types';
import {
  DEFAULT_AI_VIDEO_GENERATOR,
  listVideoGeneratorBusinesses,
  resolveGeneratorRoute,
} from '../core/video/video-business-category';
import {
  DEFAULT_AI_IMAGE_GENERATOR,
  listGraphImageGeneratorBusinesses,
} from '../core/graph/graph-image-business';
import { normalizeClientAccessibleMediaUrl } from '../core/audio/voiceover-audio-source';
import { isVideoTimelineRenderPipelineStep } from './nested-video-render';
import { setManualReviewDraft } from './manual-review-store';
import { syncDialogueLinesFromScript } from './sync-dialogue-lines-from-script';
import {
  extractTopicChipsFromContractState,
  fieldsWantTopicChips,
} from './mxm-warp/topic-chips-from-websource';

export type PipelineRunOutcome =
  | { kind: 'done'; ctx: TaskContext; finalPrompt?: string }
  | {
      kind: 'paused';
      ctx: TaskContext;
      gate: ManualReviewGateInfo;
      draft: ReviewDraftPayload;
      checkpoint: ReviewCheckpoint;
      finalPrompt?: string;
    }
  | {
      kind: 'awaitingNestedVideo';
      ctx: TaskContext;
      renderTaskId: string;
      checkpoint: ReviewCheckpoint;
    };

function isDeferredNestedTextStep(step: PipelineStep): boolean {
  return (
    step.step === 'nestedText' &&
    (step.params?.graphPreFormat === true || step.params?.afterPromptRender === true)
  );
}

const DIALOGUE_FORMAT_LABELS: Record<string, string> = {
  alternate_read: '交替朗读',
  topic_discuss: '话题讨论',
  host_sidekick: '主讲陪聊',
  audio_drama: '演绎有声剧',
};

function isInteractiveFieldValueEmpty(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === 'string') return !v.trim();
  if (typeof v === 'number') return !Number.isFinite(v);
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

/** 用 params / 合同 / content_scan / plans 预填交互卡字段 default，供第二张卡展示推荐 */
function enrichInteractiveCardFieldsWithDefaults(
  fields: unknown,
  taskParams: Record<string, unknown>,
  contract:
    | { basic?: Record<string, unknown>; business?: Record<string, unknown> }
    | undefined,
  scan: Record<string, unknown> | null
): unknown {
  if (!Array.isArray(fields)) return fields;
  const basic = contract?.basic ?? {};
  const business = contract?.business ?? {};
  const plansRaw = Array.isArray(business.plans)
    ? business.plans
    : Array.isArray(taskParams.plans)
      ? taskParams.plans
      : [];
  const planRows = plansRaw
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object' && !Array.isArray(p))
    .map((p) => {
      const id = String(p.id ?? '').trim();
      if (!id) return null;
      const label = String(p.label ?? '').trim() || id;
      const pages = Number(p.page_count);
      const dens = String(p.density ?? '').trim();
      const densZh = dens === 'sparse' ? '疏' : dens === 'dense' ? '密' : dens === 'balanced' ? '中' : '';
      const chip =
        /\d+\s*页/.test(label) || !Number.isFinite(pages)
          ? label
          : `${label}·${Math.round(pages)}页${densZh ? `·${densZh}` : ''}`;
      return { id, chip };
    })
    .filter((x): x is { id: string; chip: string } => !!x);

  return fields.map((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
    const f = { ...(raw as Record<string, unknown>) };
    const name = String(f.name ?? '').trim();
    if (!name) return f;
    let value = taskParams[name];
    if (isInteractiveFieldValueEmpty(value)) value = basic[name];
    if (isInteractiveFieldValueEmpty(value)) value = business[name];
    if (isInteractiveFieldValueEmpty(value) && scan) {
      if (name === 'dialogue_format') value = scan.suggested_format ?? scan.dialogue_format;
      if (name === 'speaker_count') value = scan.suggested_speakers ?? scan.speaker_count;
      if (name === 'broadcast_style') {
        value = scan.suggested_broadcast_style ?? scan.broadcast_style;
      }
    }
    if (name === 'plan_id' && planRows.length > 0) {
      f.enum = planRows.map((p) => p.id);
      f['x-enum-labels'] = planRows.map((p) => p.chip);
      f['x-ui-type'] = 'chips';
      f.required = true;
      if (isInteractiveFieldValueEmpty(value)) value = planRows[0]!.id;
    }
    if (!isInteractiveFieldValueEmpty(value) && f.default == null && f.defaultObject == null) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        f.defaultObject = value as Record<string, unknown>;
      } else {
        f.default = value as string | number | boolean;
      }
    }
    return f;
  });
}

function pickInteractiveCardInitialValues(
  fields: unknown,
  taskParams: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!Array.isArray(fields)) return out;
  for (const raw of fields) {
    if (!raw || typeof raw !== 'object') continue;
    const f = raw as Record<string, unknown>;
    const name = String(f.name ?? '').trim();
    if (!name) continue;
    if (f.default != null) out[name] = f.default;
    else if (f.defaultObject != null) out[name] = f.defaultObject;
    else if (!isInteractiveFieldValueEmpty(taskParams[name])) out[name] = taskParams[name];
  }
  return out;
}

function appendContentScanHint(
  baseHint: string | undefined,
  scan: Record<string, unknown> | null
): string | undefined {
  if (!scan) return baseHint;
  const format = String(scan.suggested_format ?? scan.dialogue_format ?? '').trim();
  const speakers = scan.suggested_speakers ?? scan.speaker_count;
  const reason = String(scan.reason ?? '').trim();
  const formatLabel = DIALOGUE_FORMAT_LABELS[format] ?? format;
  const parts: string[] = [];
  if (formatLabel && speakers != null && String(speakers).trim()) {
    parts.push(`根据文稿，建议「${formatLabel} / ${speakers} 人」。`);
  }
  if (reason) parts.push(reason);
  if (baseHint?.trim()) parts.push(baseHint.trim());
  return parts.length ? parts.join(' ') : baseHint;
}

function defaultEditable(kind: ManualReviewKind): boolean {
  return (
    kind === 'text' ||
    kind === 'json' ||
    kind === 'video-timeline' ||
    kind === 'interactive-card' ||
    kind === 'basic-form' ||
    kind === 'writing-chat'
  );
}

function readReviewValue(path: string, ctx: TaskContext, review?: ReviewDraftPayload): string {
  if (path.startsWith('review.')) {
    const key = path.slice('review.'.length);
    if (review) {
      if (key === 'text' && typeof review.text === 'string') return review.text;
      if (key === 'json') return review.json != null ? JSON.stringify(review.json) : '';
      if (key === 'metadata' && review.metadata != null) {
        return typeof review.metadata === 'object'
          ? JSON.stringify(review.metadata)
          : String(review.metadata);
      }
    }
    return '';
  }
  return interpolatePipelineTemplate(`\${${path}}`, ctx);
}

function normalizeDraftFromPath(draftFrom: string): string {
  const trimmed = draftFrom.trim();
  if (trimmed.startsWith('${') && trimmed.endsWith('}')) {
    return trimmed.slice(2, -1).trim();
  }
  return trimmed;
}

function readStatePathValue(ctx: TaskContext, path: string): unknown {
  if (!path.startsWith('state.')) return undefined;
  const rest = path.slice('state.'.length);
  const dot = rest.indexOf('.');
  if (dot === -1) return ctx.state[rest];
  const head = rest.slice(0, dot);
  const tail = rest.slice(dot + 1);
  let cur: unknown = ctx.state[head];
  for (const seg of tail.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

function normalizeVideoEditScriptValue(raw: unknown): unknown {
  if (raw == null) return raw;
  if (typeof raw === 'string') return tryParseJson(raw);
  return raw;
}

function isVideoEditProjectFile(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const pf = raw as { project?: { timeline?: { tracks?: unknown } } };
  return Array.isArray(pf.project?.timeline?.tracks);
}

function resolveDraftSourceValue(draftFrom: string | undefined, ctx: TaskContext): unknown {
  if (!draftFrom?.trim()) {
    const fp = ctx.state.finalPrompt ?? ctx.state.promptForModel;
    if (typeof fp === 'string') return fp;
    const core = ctx.state.coreArtifact as CoreArtifact | undefined;
    if (core?.text) return core.text;
    if (core?.mediaUrls?.length) return core.mediaUrls;
    return '';
  }
  const path = normalizeDraftFromPath(draftFrom);
  if (path === 'state.videoEditScriptJson') {
    const direct = normalizeVideoEditScriptValue(readStatePathValue(ctx, path));
    if (direct != null && direct !== '') return direct;
  }
  const tmpl = draftFrom.includes('${') ? draftFrom : `\${${draftFrom}}`;
  const raw = interpolatePipelineTemplate(tmpl, ctx);
  if (raw.startsWith('[') || raw.startsWith('{')) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

/**
 * writing-chat 审核草稿：调用 summary taskKey（text 子业务）把原始 JSON 整理为人话版 Markdown。
 * 失败时回退到 `text` 字段（不阻塞审核），并把失败原因记到 metadata。
 */
export async function summarizeReviewDraft(
  ctx: TaskContext,
  step: PipelineStep,
  base: ReviewDraftPayload,
  source: unknown
): Promise<ReviewDraftPayload> {
  const params = parseManualReviewStepParams(step);
  if (!params.summaryTaskKey) {
    return {
      ...base,
      summary: '',
      metadata: {
        ...(base.metadata ?? {}),
        summaryError: 'missing summaryTaskKey',
      },
    };
  }
  if (source == null) {
    return { ...base, summary: '' };
  }
  try {
    const { parseNestedTextTaskKey } = await import('./business-pipeline');
    const { runTaskV2 } = await import('./task-engine');
    const { buildExpertFieldSpecs } = await import('./text-v2');
    const { taskKey, subtype } = parseNestedTextTaskKey(params.summaryTaskKey);
    const sourceStr =
      typeof source === 'string' ? source : JSON.stringify(source, null, 2);
    const userId = ctx.userId;
    const stepParams = (step.params ?? {}) as Record<string, unknown>;
    const fromStep = stepParams.field_specs;
    const fieldSpecs = Array.isArray(fromStep)
      ? fromStep
      : buildExpertFieldSpecs({
          contract: (ctx.state.contract as Record<string, unknown> | undefined) ?? null,
          contractSchema:
            ((ctx.state._contractSchema ?? ctx.state._formSchema) as
              | import('./types').JsonSchemaV2
              | undefined) ?? null,
          onlyEmpty: false,
        });
    const gate = {
      gateId: base.gateId,
      phase: base.phase,
      label: base.label,
      hint: base.hint,
    };
    const instruction =
      params.summaryInstruction ??
      '请把以上合同整理为面向读者的人工审核摘要（Markdown）。结构：1) 本次审核对象（≤1 句）；2) 各变体/路线一句话概述（角度、风格、检索词、证据是否充分）；3) 给用户的简短确认要点（≤5 条 bullet）；4) 可直接调整的字段提示。不要逐字复述 JSON，不要列出全部字段，不要解释后台状态（如"暂无数据""证据不足"）。直接用人话。';

    // text v2：expert 钉死只有 contract/field_specs；摘要应走 transform（input/instruction）
    const summaryParams =
      taskKey === 'transform'
        ? {
            input: JSON.stringify(
              {
                contract: ctx.state.contract ?? {},
                source: sourceStr,
                gate,
                field_specs: fieldSpecs,
              },
              null,
              2
            ),
            instruction,
          }
        : {
            // 兼容旧 expert summaryTaskKey：只能塞进 contract + field_specs
            contract: {
              ...((ctx.state.contract && typeof ctx.state.contract === 'object'
                ? ctx.state.contract
                : {}) as Record<string, unknown>),
              __reviewMeta: { source: sourceStr, gate, instruction },
            },
            field_specs: fieldSpecs,
          };

    const req = {
      scope: 'text' as const,
      taskKey,
      subtype: subtype ?? null,
      params: summaryParams,
      options: { ephemeral: true },
    };
    const result = await runTaskV2(req, userId);
    const text =
      (result.success && (result as unknown as { syncResult?: { text?: string } }).syncResult?.text) ||
      '';
    return {
      ...base,
      summary: (typeof text === 'string' ? text : '').trim(),
      metadata: {
        ...(base.metadata ?? {}),
        summaryTaskKey: params.summaryTaskKey,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[manual-review] summarizeReviewDraft failed:', msg);
    return {
      ...base,
      summary: '',
      metadata: {
        ...(base.metadata ?? {}),
        summaryTaskKey: params.summaryTaskKey,
        summaryError: msg,
      },
    };
  }
}

/** video-timeline 审核草稿：注入 generator 业务目录与默认路由 */
export async function enrichVideoTimelineReviewDraft(
  draft: ReviewDraftPayload,
  taskParams?: Record<string, unknown>
): Promise<ReviewDraftPayload> {
  if (draft.kind !== 'video-timeline') return draft;
  const generators = await listVideoGeneratorBusinesses();
  const graphGenerators = await listGraphImageGeneratorBusinesses();
  const defaultRoute = resolveGeneratorRoute(
    DEFAULT_AI_VIDEO_GENERATOR.taskKey,
    DEFAULT_AI_VIDEO_GENERATOR.subtype
  );

  const timelinePhase = draft.metadata?.timelinePhase;
  let json = draft.json;
  if (timelinePhase === 'plan' && json && typeof json === 'object') {
    const { enrichVideoEditScriptAiPrompts } = await import(
      '../core/video-edit/clip-prompt-coherence'
    );
    json = enrichVideoEditScriptAiPrompts(json as import('../core/video-edit/types').VideoEditScript, {
      globalTopic: typeof taskParams?.topic === 'string' ? taskParams.topic : undefined,
      editStyle: typeof taskParams?.edit_style === 'string' ? taskParams.edit_style : undefined,
      aspectRatio: typeof taskParams?.aspectRatio === 'string' ? taskParams.aspectRatio : undefined,
      supplement: typeof taskParams?.supplement === 'string' ? taskParams.supplement : undefined,
    });
  }

  return {
    ...draft,
    json,
    metadata: {
      ...(draft.metadata ?? {}),
      videoGeneratorOptions: generators,
      graphGeneratorOptions: graphGenerators,
      defaultVideoGenerator: defaultRoute,
      defaultGraphGenerator: {
        taskKey: DEFAULT_AI_IMAGE_GENERATOR.taskKey,
        subtype: DEFAULT_AI_IMAGE_GENERATOR.subtype,
      },
      editStyle: typeof taskParams?.edit_style === 'string' ? taskParams.edit_style : undefined,
      globalTopic: typeof taskParams?.topic === 'string' ? taskParams.topic : undefined,
    },
  };
}

export async function extractReviewDraftFromContext(
  ctx: TaskContext,
  step: PipelineStep,
  phase: ManualReviewPhase,
  stepIndex: number
): Promise<ReviewDraftPayload> {
  const params = parseManualReviewStepParams(step);
  const gateId = resolveGateId(step, phase, stepIndex);
  const kind = params.kind ?? 'text';
  const editable = params.editable ?? defaultEditable(kind);
  const source = resolveDraftSourceValue(params.draftFrom, ctx);

  const base: ReviewDraftPayload = {
    version: 1,
    gateId,
    phase,
    kind,
    editable,
    label: params.label,
    hint: params.hint,
  };

  if (kind === 'json') {
    const json = typeof source === 'string' ? tryParseJson(source) : source;
    const reviewSurface = params.reviewSurface;
    return {
      ...base,
      json,
      ...(reviewSurface
        ? { metadata: { ...(base.metadata ?? {}), reviewSurface } }
        : {}),
    };
  }
  if (kind === 'writing-chat') {
    const json = typeof source === 'string' ? tryParseJson(source) : source;
    const {
      buildWritingChatInteractiveFields,
      buildDeterministicWritingChatSummary,
    } = await import('./writing-chat-review-fields');
    const interactiveCardFields = buildWritingChatInteractiveFields(json, step, gateId);
    const fallbackSummary = buildDeterministicWritingChatSummary(json, {
      label: params.label,
      hint: params.hint,
    });
    // 交互卡字段进闸前同步备好；LLM 摘要仅增强气泡，失败不挡进闸
    const seeded: ReviewDraftPayload = {
      ...base,
      json,
      interactiveCardFields,
      summary: fallbackSummary,
      metadata: {
        ...(base.metadata ?? {}),
        reviewSurface: params.reviewSurface,
        ui: 'writing-chat',
        fields: interactiveCardFields,
      },
    };
    const summarized = await summarizeReviewDraft(ctx, step, seeded, source);
    return {
      ...summarized,
      interactiveCardFields,
      summary: String(summarized.summary ?? '').trim() || fallbackSummary,
      metadata: {
        ...(summarized.metadata ?? {}),
        reviewSurface: params.reviewSurface,
        ui: 'writing-chat',
        fields: interactiveCardFields,
      },
    };
  }
  if (kind === 'interactive-card' || kind === 'basic-form') {
    const fields = (step.params as Record<string, unknown> | undefined)?.fields;
    // pre.webSearch → sources.websource；后续交互卡若含话题字段则注入 chips（热点 + 前端自定义输入）
    const wantChips = kind === 'basic-form' || fieldsWantTopicChips(fields);
    const topicChips = wantChips
      ? extractTopicChipsFromContractState(ctx.state.contract as Record<string, unknown> | undefined)
      : undefined;
    const taskParams = (ctx.params ?? {}) as Record<string, unknown>;
    const contract = ctx.state.contract as
      | { basic?: Record<string, unknown>; business?: Record<string, unknown> }
      | undefined;
    const scan =
      contract?.business?.content_scan && typeof contract.business.content_scan === 'object'
        ? (contract.business.content_scan as Record<string, unknown>)
        : taskParams.content_scan && typeof taskParams.content_scan === 'object'
          ? (taskParams.content_scan as Record<string, unknown>)
          : null;
    const enrichedFields = enrichInteractiveCardFieldsWithDefaults(
      fields,
      taskParams,
      contract,
      scan
    );
    const hintWithScan = appendContentScanHint(params.hint, scan);
    return {
      ...base,
      hint: hintWithScan ?? base.hint,
      json: source && typeof source === 'object' ? source : { ...taskParams },
      metadata: {
        ...(base.metadata ?? {}),
        ui: kind,
        fields: enrichedFields ?? null,
        topicChips: topicChips ?? [],
        skippable: (step.params as Record<string, unknown> | undefined)?.skippable === true,
        optionsFrom: wantChips ? 'sources.websource' : undefined,
        initialValues: pickInteractiveCardInitialValues(enrichedFields, taskParams),
      },
    };
  }
  if (kind === 'video-timeline') {
    // OpenReel ProjectFile JSON + mxm* 扩展
    let json: unknown = typeof source === 'string' ? tryParseJson(source) : source;
    if (typeof json === 'string') json = tryParseJson(json);
    const timelinePhase = params.timelinePhase ?? 'plan';
    const voiceoverAudio = ctx.state.voiceoverAudio as
      | { url?: string; durationSeconds?: number }
      | undefined;
    const voiceoverSubtitles = ctx.state.voiceoverSubtitles;
    const taskParams = ctx.params as Record<string, unknown>;
    const rawVoiceoverUrl =
      voiceoverAudio?.url ??
      (typeof taskParams.voiceover_audio_url === 'string'
        ? taskParams.voiceover_audio_url
        : undefined);
    return {
      ...base,
      json,
      metadata: {
        ...(base.metadata ?? {}),
        editorKind: 'openreel-timeline',
        schemaVersion: '1.0.0',
        timelinePhase,
        capabilities: ['render-mode-switch', 'track-drag', 'keyframe-edit', 'transform-edit'],
        voiceoverAudioUrl: rawVoiceoverUrl
          ? normalizeClientAccessibleMediaUrl(rawVoiceoverUrl)
          : undefined,
        audioDurationSeconds:
          voiceoverAudio?.durationSeconds ??
          (typeof taskParams.audio_duration_seconds === 'number'
            ? taskParams.audio_duration_seconds
            : undefined),
        voiceoverSubtitles: voiceoverSubtitles ?? undefined,
      },
    };
  }
  if (kind === 'image' || kind === 'media' || kind === 'composite') {
    const urls = normalizeMediaUrls(source, ctx);
    return { ...base, mediaUrls: urls, editable: false };
  }
  let text = typeof source === 'string' ? source : source != null ? JSON.stringify(source) : '';
  // 多人语音：script_draft 空时从 lines 拼【角色】可读稿；并附带指导时间轴数据
  if (params.syncDialogueLines === true) {
    const contract = ctx.state.contract as Record<string, unknown> | undefined;
    const business = (contract?.business as Record<string, unknown> | undefined) ?? {};
    const basic = (contract?.basic as Record<string, unknown> | undefined) ?? {};
    const lines = Array.isArray(business.lines)
      ? (business.lines as Array<Record<string, unknown>>)
      : [];
    const cast = Array.isArray(business.cast)
      ? (business.cast as Array<Record<string, unknown>>)
      : [];
    if (!String(text).trim() && lines.length > 0) {
      const { formatDialogueScriptFromLines } = await import('./sync-dialogue-lines-from-script');
      text = formatDialogueScriptFromLines(lines, cast);
    }
    if (lines.length > 0) {
      return {
        ...base,
        text: text.trim(),
        metadata: {
          ...(base.metadata ?? {}),
          ui: 'dialogue-guidance-timeline',
          dialogueReview: {
            lines,
            cast,
            broadcast_style:
              String(basic.broadcast_style ?? ctx.params.broadcast_style ?? '').trim() ||
              undefined,
            guidanceNote:
              '本时间轴为剪辑指导（预估语速 + 相对 cue），与最终 TTS 成片时长会有偏差。',
          },
        },
      };
    }
  }
  return { ...base, text: text.trim() };
}

/** 从 sources.websource 抽短标题（已迁至 topic-chips-from-websource） */

function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function normalizeMediaUrls(source: unknown, ctx: TaskContext): string[] {
  if (Array.isArray(source)) {
    return source.filter((u): u is string => typeof u === 'string' && u.trim().length > 0);
  }
  if (typeof source === 'string' && source.trim()) {
    if (source.startsWith('[')) {
      try {
        const parsed = JSON.parse(source) as unknown;
        if (Array.isArray(parsed)) {
          return parsed.filter((u): u is string => typeof u === 'string' && u.trim().length > 0);
        }
      } catch {
        /* fall through */
      }
    }
    return [source.trim()];
  }
  const core = ctx.state.coreArtifact as CoreArtifact | undefined;
  const fa = ctx.state.finalArtifact as CoreArtifact | undefined;
  return [...(core?.mediaUrls ?? []), ...(fa?.mediaUrls ?? [])].filter(Boolean);
}

export function countManualReviewGates(steps: PipelineStep[]): number {
  return steps.filter(isManualReviewStep).length;
}

export function buildManualReviewGateInfo(
  step: PipelineStep,
  phase: ManualReviewPhase,
  stepIndex: number,
  allSteps: PipelineStep[]
): ManualReviewGateInfo {
  const params = parseManualReviewStepParams(step);
  const gates = allSteps.map((s, i) => (isManualReviewStep(s) ? i : -1)).filter((i) => i >= 0);
  const gateOrdinal = gates.indexOf(stepIndex);
  return {
    gateId: resolveGateId(step, phase, stepIndex),
    phase,
    stepIndex,
    label: params.label,
    hint: params.hint,
    kind: params.kind ?? 'text',
    index: gateOrdinal >= 0 ? gateOrdinal + 1 : undefined,
    totalGates: gates.length || undefined,
  };
}

async function runSinglePreStep(
  ctx: TaskContext,
  step: PipelineStep,
  template: TaskTemplate
): Promise<TaskContext> {
  if (step.step === 'resolveContextFields') {
    const { resolveContextFields } = await import('./context-field-resolver');
    const phase = (step.params?.phase as 'pre' | 'post' | undefined) ?? 'pre';
    const kinds = step.params?.kinds as ('kbRecall' | 'webSearch')[] | undefined;
    return resolveContextFields(ctx, template.formSchema, { phase, kinds });
  }
  const { runInputPipeline } = await import('./pipeline-registry');
  return runInputPipeline(ctx, [step]);
}

async function runSinglePostStep(
  ctx: TaskContext,
  step: PipelineStep,
  template: TaskTemplate
): Promise<TaskContext> {
  if (step.step === 'resolveContextFields') {
    const { resolveContextFields } = await import('./context-field-resolver');
    const phase = (step.params?.phase as 'pre' | 'post' | undefined) ?? 'post';
    const kinds = step.params?.kinds as ('kbRecall' | 'webSearch')[] | undefined;
    return resolveContextFields(ctx, template.formSchema, { phase, kinds });
  }
  if (step.step === 'nestedText') {
    const { runNestedTextStep } = await import('./business-pipeline-steps');
    return runNestedTextStep(ctx, step);
  }
  if (step.step === 'nestedVideo') {
    throw new Error('nestedVideo 由 runPostPipelineWithCheckpoints 异步调度，不应经 runSinglePostStep 直接执行');
  }
  if (step.step === 'videoTimelineRender') {
    throw new Error('videoTimelineRender 由 runPostPipelineWithCheckpoints 异步调度，不应经 runSinglePostStep 直接执行');
  }
  if (step.step === 'videoTimelineRender') {
    throw new Error('videoTimelineRender 由 runPostPipelineWithCheckpoints 异步调度，不应经 runSinglePostStep 直接执行');
  }
  const { runOutputPipeline } = await import('./pipeline-registry');
  return runOutputPipeline(ctx, [step]);
}

function appendPipelineTrace(
  ctx: TaskContext,
  step: PipelineStep,
  phase: ManualReviewPhase,
  started: number
): TaskContext {
  const trace = Array.isArray(ctx.state.pipelineTrace)
    ? [...(ctx.state.pipelineTrace as import('./types').PipelineTraceEntry[])]
    : [];
  trace.push({
    step: step.step,
    durationMs: Date.now() - started,
    phase,
  });
  return { ...ctx, state: { ...ctx.state, pipelineTrace: trace } };
}

export async function runPrePipelineWithCheckpoints(args: {
  ctx: TaskContext;
  template: TaskTemplate;
  scope: string;
  rowExtra?: Record<string, unknown> | null;
  renderFinalPrompt: () => string;
  onPreStepStart?: (step: PipelineStep, index: number) => Promise<void>;
  onPreStepComplete?: (step: PipelineStep, index: number, ctx: TaskContext) => Promise<void>;
  /** 每完成一步（非 manualReview）持久化断点，供失败重试续跑 */
  onStepCheckpoint?: (ctx: TaskContext, checkpoint: ReviewCheckpoint) => Promise<void>;
}): Promise<PipelineRunOutcome> {
  const { template, scope, rowExtra, renderFinalPrompt, onPreStepStart, onPreStepComplete, onStepCheckpoint } =
    args;
  const { pre } = mergeEffectivePipeline(scope, template, rowExtra ?? null);
  let ctx = { ...args.ctx, state: { ...args.ctx.state, _formSchema: template.formSchema } };

  const existingCheckpoint = ctx.state.reviewCheckpoint as ReviewCheckpoint | undefined;
  const startIndex =
    existingCheckpoint?.phase === 'pre' ? Math.max(0, existingCheckpoint.stepIndex) : 0;
  const completedGateIds = [...(existingCheckpoint?.completedGateIds ?? [])];

  let renderedPrompt: string | undefined =
    typeof ctx.state.finalPrompt === 'string' && ctx.state.finalPrompt.trim()
      ? ctx.state.finalPrompt.trim()
      : undefined;

  for (let i = startIndex; i < pre.length; i++) {
    const step = pre[i]!;

    if (!shouldRunPipelineStep(ctx, step)) {
      ctx = appendSkippedPipelineTrace(ctx, step, 'pre');
      continue;
    }

    if (isManualReviewStep(step)) {
      const gateId = resolveGateId(step, 'pre', i);
      if (completedGateIds.includes(gateId)) continue;

      if (isDeferredNestedTextStep(step)) {
        throw new Error('manualReview 不能与 deferred nestedText 混用同一步骤');
      }

      const draft = await extractReviewDraftFromContext(ctx, step, 'pre', i);
      const gate = buildManualReviewGateInfo(step, 'pre', i, pre);
      const checkpoint: ReviewCheckpoint = { phase: 'pre', stepIndex: i, completedGateIds };

      ctx = {
        ...ctx,
        state: {
          ...ctx.state,
          reviewCheckpoint: checkpoint,
          currentReviewGate: gate,
          businessPipelineAwaitingReview: true,
          prePipelineReviewText: draft.text,
        },
      };
      return { kind: 'paused', ctx, gate, draft, checkpoint, finalPrompt: renderedPrompt };
    }

    if (onPreStepStart) {
      await onPreStepStart(step, i);
    }

    const started = Date.now();
    if (isDeferredNestedTextStep(step)) {
      if (!renderedPrompt) {
        renderedPrompt = renderFinalPrompt();
        ctx = { ...ctx, state: { ...ctx.state, finalPrompt: renderedPrompt } };
      }
      const { runNestedTextStep } = await import('./business-pipeline-steps');
      ctx = await runNestedTextStep(ctx, step);
    } else {
      ctx = await runSinglePreStep(ctx, step, template);
    }
    if (onPreStepComplete) {
      await onPreStepComplete(step, i, ctx);
    }
    ctx = appendPipelineTrace(ctx, step, 'pre', started);

    const stepCheckpoint: ReviewCheckpoint = {
      phase: 'pre',
      stepIndex: i + 1,
      completedGateIds: [...completedGateIds],
    };
    ctx = {
      ...ctx,
      state: { ...ctx.state, reviewCheckpoint: stepCheckpoint },
    };
    if (onStepCheckpoint) {
      await onStepCheckpoint(ctx, stepCheckpoint);
    }
  }

  if (!renderedPrompt) {
    renderedPrompt = renderFinalPrompt();
    ctx = { ...ctx, state: { ...ctx.state, finalPrompt: renderedPrompt } };
  }

  return { kind: 'done', ctx, finalPrompt: renderedPrompt };
}

export async function runPostPipelineWithCheckpoints(args: {
  ctx: TaskContext;
  template: TaskTemplate;
  scope: string;
  rowExtra?: Record<string, unknown> | null;
  onStepCheckpoint?: (ctx: TaskContext, checkpoint: ReviewCheckpoint) => Promise<void>;
}): Promise<PipelineRunOutcome> {
  const { template, scope, rowExtra, onStepCheckpoint } = args;
  const { post } = mergeEffectivePipeline(scope, template, rowExtra ?? null);
  if (!post.length) {
    return { kind: 'done', ctx: args.ctx };
  }

  let ctx = args.ctx;
  if (!ctx.state.coreArtifact && !ctx.state.finalArtifact) {
    return { kind: 'done', ctx };
  }
  if (!ctx.state.finalArtifact) {
    ctx = { ...ctx, state: { ...ctx.state, finalArtifact: ctx.state.coreArtifact } };
  }

  const existingCheckpoint = ctx.state.reviewCheckpoint as ReviewCheckpoint | undefined;
  const startIndex =
    existingCheckpoint?.phase === 'post' ? Math.max(0, existingCheckpoint.stepIndex) : 0;
  const completedGateIds = [...(existingCheckpoint?.completedGateIds ?? [])];

  for (let i = startIndex; i < post.length; i++) {
    const step = post[i]!;

    if (!shouldRunPipelineStep(ctx, step)) {
      ctx = appendSkippedPipelineTrace(ctx, step, 'post');
      continue;
    }

    if (isManualReviewStep(step)) {
      const gateId = resolveGateId(step, 'post', i);
      if (completedGateIds.includes(gateId)) continue;

      const reviewParams = parseManualReviewStepParams(step);
      if (reviewParams.timelinePhase === 'rendered' && !ctx.state.videoEditRenderTaskId) {
        throw new Error(
          '成片审核前缺少逐段渲染（videoTimelineRender）。请确认业务 pipeline 在两次 manualReview 之间包含时间轴渲染步骤，并重新 seed 业务配置。'
        );
      }

      const draft = await extractReviewDraftFromContext(ctx, step, 'post', i);
      const gate = buildManualReviewGateInfo(step, 'post', i, post);
      const checkpoint: ReviewCheckpoint = { phase: 'post', stepIndex: i, completedGateIds };

      ctx = {
        ...ctx,
        state: {
          ...ctx.state,
          reviewCheckpoint: checkpoint,
          currentReviewGate: gate,
          businessPipelineAwaitingReview: true,
        },
      };
      return { kind: 'paused', ctx, gate, draft, checkpoint };
    }

    if (isVideoTimelineRenderPipelineStep(step)) {
      const renderTaskId = String(ctx.state.videoEditRenderTaskId ?? '').trim();
      const renderPending = ctx.state.nestedVideoRenderPending === true;
      const renderStepRaw = ctx.state.videoEditRenderStepIndex;
      const renderStepIndex =
        typeof renderStepRaw === 'number'
          ? renderStepRaw
          : typeof renderStepRaw === 'string' && renderStepRaw.trim()
            ? Number(renderStepRaw)
            : undefined;
      // 同一管线可有多次 videoTimelineRender（先逐段、后拼成片）。
      // 仅当子任务归属当前 stepIndex 时才复用/合并，否则会把第一次成片误当成最终拼片并跳过 concatFinal。
      const ownedByThisStep =
        !!renderTaskId &&
        (renderStepIndex === i ||
          (renderStepIndex === undefined && renderPending));
      const checkpoint: ReviewCheckpoint = { phase: 'post', stepIndex: i, completedGateIds };

      if (ownedByThisStep && (renderPending || renderTaskId)) {
        const { taskExecutor } = await import('../task/task-executor');
        const snap = await taskExecutor.getTaskManager().getTask(renderTaskId);
        const child = snap?.task;
        const status = child?.status;

        if (status === 'completed' && child) {
          const { applyNestedVideoRenderResult } = await import('./nested-video-render');
          const started = Date.now();
          ctx = applyNestedVideoRenderResult(ctx, child);
          ctx = appendPipelineTrace(ctx, step, 'post', started);
          const stepCheckpoint: ReviewCheckpoint = {
            phase: 'post',
            stepIndex: i + 1,
            completedGateIds: [...completedGateIds],
          };
          ctx = {
            ...ctx,
            state: {
              ...ctx.state,
              reviewCheckpoint: stepCheckpoint,
              // 保留 renderTaskId 供「成片审核」校验；stepIndex 标明归属，下一步渲染不会误复用
              videoEditRenderStepIndex: i,
              nestedVideoRenderPending: false,
            },
          };
          if (onStepCheckpoint) await onStepCheckpoint(ctx, stepCheckpoint);
          continue;
        }
        if (status === 'failed' || status === 'cancelled') {
          const err =
            child?.progress?.error ??
            (child as { error?: string } | undefined)?.error ??
            status;
          throw new Error(`videoTimelineRender 渲染子任务失败: ${renderTaskId}（${err}）`);
        }

        ctx = {
          ...ctx,
          state: {
            ...ctx.state,
            videoEditRenderStepIndex: i,
            nestedVideoRenderPending: true,
          },
        };
        return { kind: 'awaitingNestedVideo', ctx, renderTaskId, checkpoint };
      }

      const { startNestedVideoRenderAsync } = await import('./nested-video-render');
      ctx = await startNestedVideoRenderAsync(ctx, step, { stepIndex: i });
      ctx = {
        ...ctx,
        state: {
          ...ctx.state,
          reviewCheckpoint: checkpoint,
          videoEditRenderStepIndex: i,
        },
      };
      return {
        kind: 'awaitingNestedVideo',
        ctx,
        renderTaskId: String(ctx.state.videoEditRenderTaskId),
        checkpoint,
      };
    }

    const started = Date.now();
    ctx = await runSinglePostStep(ctx, step, template);
    ctx = appendPipelineTrace(ctx, step, 'post', started);

    const stepCheckpoint: ReviewCheckpoint = {
      phase: 'post',
      stepIndex: i + 1,
      completedGateIds: [...completedGateIds],
    };
    ctx = { ...ctx, state: { ...ctx.state, reviewCheckpoint: stepCheckpoint } };
    if (onStepCheckpoint) {
      await onStepCheckpoint(ctx, stepCheckpoint);
    }
  }

  return { kind: 'done', ctx };
}

export async function persistNestedVideoRenderPause(args: {
  taskId: string;
  renderTaskId: string;
  execParams: Record<string, any>;
  checkpoint: ReviewCheckpoint;
  pipelineState: Record<string, unknown>;
}): Promise<Record<string, any>> {
  const { taskId, renderTaskId, execParams, checkpoint, pipelineState } = args;
  const stepIndex =
    typeof pipelineState.videoEditRenderStepIndex === 'number'
      ? pipelineState.videoEditRenderStepIndex
      : checkpoint.stepIndex;
  return {
    ...execParams,
    businessPipelineState: {
      ...pipelineState,
      reviewCheckpoint: checkpoint,
      videoEditRenderTaskId: renderTaskId,
      videoEditRenderStepIndex: stepIndex,
      nestedVideoRenderPending: true,
      businessPipelinePostDeferred: true,
      businessPipelineAwaitingReview: false,
      businessPipelinePreDone: true,
      businessPipelinePreDeferred: false,
    },
  };
}

/**
 * @deprecated 自 2026-07 起不再向 root metadata 写入这两个键，请统一走 businessPipelineState。
 * 历史行为保留供回滚，本函数不再被 task-executor 调用。
 */
export function buildTaskMetadataForNestedVideoRender(
  taskMeta: Record<string, unknown>,
  renderTaskId: string
): Record<string, unknown> {
  return {
    ...taskMeta,
    videoEditRenderTaskId: renderTaskId,
    nestedVideoRenderPending: true,
  };
}

export async function persistManualReviewPause(args: {
  taskId: string;
  gate: ManualReviewGateInfo;
  draft: ReviewDraftPayload;
  execParams: Record<string, any>;
  taskType: string;
  finalPrompt?: string;
}): Promise<Record<string, any>> {
  const { taskId, gate, draft: rawDraft, execParams, taskType, finalPrompt } = args;
  const draft =
    rawDraft.kind === 'video-timeline'
      ? await enrichVideoTimelineReviewDraft(rawDraft, execParams as Record<string, unknown>)
      : rawDraft;
  await setManualReviewDraft(taskId, gate.gateId, draft);

  const existingCheckpoint = (
    (execParams.businessPipelineState ?? {}) as Record<string, unknown>
  ).reviewCheckpoint as ReviewCheckpoint | undefined;

  const pipelineState: Record<string, unknown> = {
    ...((execParams.businessPipelineState ?? {}) as Record<string, unknown>),
    reviewCheckpoint: {
      phase: gate.phase,
      stepIndex: gate.stepIndex,
      completedGateIds: [...(existingCheckpoint?.completedGateIds ?? [])],
    },
    currentReviewGate: gate,
    businessPipelineAwaitingReview: true,
    businessPipelinePreDone: gate.phase === 'post',
    businessPipelinePreDeferred: gate.phase === 'pre',
    prePipelineReviewText: draft.text,
    /** 持久化完整审核草稿（Redis 过期后可从 DB 恢复） */
    pendingReviewDraft: {
      version: 1 as const,
      gateId: gate.gateId,
      phase: gate.phase,
      kind: draft.kind,
      text: draft.text,
      json: draft.json,
      mediaUrls: draft.mediaUrls,
      metadata: draft.metadata,
      editable: draft.editable,
      label: draft.label ?? gate.label,
      hint: draft.hint ?? gate.hint,
      summary: draft.summary,
      interactiveCardFields: draft.interactiveCardFields,
    },
  };

  if (gate.phase === 'pre' && finalPrompt) {
    pipelineState.finalPrompt = finalPrompt;
    pipelineState.promptForModel = finalPrompt;
    if (taskType === 'audio') {
      pipelineState.voiceOverPipeline = { ttsText: finalPrompt };
    } else if (taskType === 'music') {
      pipelineState.musicPipeline = { prompt: finalPrompt };
    } else if (taskType === 'graph') {
      pipelineState.graphPipeline = { prompt: finalPrompt };
    }
  }

  return {
    ...execParams,
    ...(finalPrompt ? { prompt: finalPrompt } : {}),
    businessPipelineState: pipelineState,
    [PAUSE_FOR_MANUAL_REVIEW]: true,
    __manualReviewGate: gate,
    __manualReviewDraft: draft,
  };
}

export function buildPersistedParamsForAwaitingReview(
  execParams: Record<string, any>
): Record<string, any> {
  const next = { ...execParams } as Record<string, any>;
  delete next.__pauseForManualReview;
  delete next.__manualReviewGate;
  delete next.__manualReviewDraft;
  delete next.prompt;
  if (next.parameters) delete next.parameters;

  const inner = { ...(next.params ?? {}) } as Record<string, unknown>;
  delete inner.prompt;
  next.params = inner;

  const bps = { ...((next.businessPipelineState ?? {}) as Record<string, unknown>) };
  delete bps.finalPrompt;
  delete bps.promptForModel;
  delete bps.voiceOverPipeline;
  delete bps.musicPipeline;
  delete bps.graphPipeline;
  next.businessPipelineState = {
    ...bps,
    businessPipelinePreDone: bps.reviewCheckpoint
      ? (bps.reviewCheckpoint as ReviewCheckpoint).phase === 'post'
      : false,
    businessPipelinePreDeferred: (bps.reviewCheckpoint as ReviewCheckpoint | undefined)?.phase !== 'post',
    businessPipelineAwaitingReview: true,
  };
  return next;
}

export function buildTaskMetadataForAwaitingReview(
  existing: Record<string, unknown>,
  gate: ManualReviewGateInfo
): Record<string, unknown> {
  return {
    ...existing,
    manualReviewGate: gate,
  };
}

function applyMappingToCtx(
  ctx: TaskContext,
  mapping: Record<string, string> | undefined,
  review: ReviewDraftPayload
): TaskContext {
  if (!mapping || !Object.keys(mapping).length) {
    if (review.text) {
      return {
        ...ctx,
        params: { ...ctx.params, prompt: review.text },
        state: { ...ctx.state, finalPrompt: review.text, promptForModel: review.text },
      };
    }
    return ctx;
  }

  let next = { ...ctx, params: { ...ctx.params }, state: { ...ctx.state } };
  for (const [target, tmpl] of Object.entries(mapping)) {
    const tmplPath = tmpl.replace(/^\$\{|\}$/g, '').trim();
    // review.json / review.metadata 保留对象，避免 stringify 后丢失结构
    let value: unknown;
    if (tmplPath === 'review.json' && review?.json != null) {
      value = review.json;
    } else if (tmplPath === 'review.metadata' && review?.metadata != null) {
      value = review.metadata;
    } else {
      value = readReviewValue(tmplPath, next, review);
    }
    if (target === 'prompt' || target.startsWith('params.')) {
      const key = target.startsWith('params.') ? target.slice('params.'.length) : 'prompt';
      next = { ...next, params: { ...next.params, [key]: value } };
      if (key === 'prompt' && typeof value === 'string') {
        const prevCore = next.state.coreArtifact as
          | { kind?: string; text?: string; metadata?: Record<string, unknown> }
          | undefined;
        next = {
          ...next,
          state: {
            ...next.state,
            finalPrompt: value,
            promptForModel: value,
            prePipelineReviewText: value,
            // enrich 末审改稿后，skipOutputLlm / TTS 读 coreArtifact
            coreArtifact: {
              kind: 'text',
              text: value,
              metadata: { ...(prevCore?.metadata ?? {}), manualReviewEdited: true },
            },
          },
        };
      }
    } else if (target.startsWith('state.')) {
      const key = target.slice('state.'.length);
      next = { ...next, state: { ...next.state, [key]: value } };
    }
  }
  return next;
}

export function applyApprovedManualReview(
  params: Record<string, any>,
  review: ReviewDraftPayload,
  step: PipelineStep | null,
  taskType: string
): Record<string, any> {
  const reviewText = (review.text ?? '').trim();
  const reviewJson = review.json;
  if (review.kind === 'text' && !reviewText) {
    throw new Error('reviewText 不能为空');
  }
  if (
    (review.kind === 'json' ||
      review.kind === 'interactive-card' ||
      review.kind === 'basic-form') &&
    reviewJson == null &&
    !reviewText
  ) {
    throw new Error('reviewJson 不能为空');
  }
  if (review.kind === 'video-timeline' && reviewJson == null) {
    throw new Error('video-timeline reviewJson 不能为空（必须含 OpenReel ProjectFile JSON）');
  }

  const innerParams = { ...((params.params ?? params) as Record<string, unknown>) };
  // 根级 requestParams 优先，但需合并内层快照（pendingPostResult 等可能只在内层）
  const bps = mergeBusinessPipelineState(params, innerParams);
  const pendingPostResult = bps.pendingPostResult;
  const checkpoint = bps.reviewCheckpoint as ReviewCheckpoint | undefined;
  const gate = bps.currentReviewGate as ManualReviewGateInfo | undefined;
  const gateId = gate?.gateId ?? review.gateId;
  const phase = gate?.phase ?? review.phase;

  const completedGateIds = [...(checkpoint?.completedGateIds ?? [])];
  if (!completedGateIds.includes(gateId)) completedGateIds.push(gateId);

  const stepParams = step ? parseManualReviewStepParams(step) : null;
  let ctx: TaskContext = {
    scope: (innerParams.taskV2 as { scope?: string } | undefined)?.scope ?? 'text',
    taskKey: (innerParams.taskV2 as { taskKey?: string } | undefined)?.taskKey ?? '',
    subtype: null,
    taskId: params.taskId as string | undefined,
    params: innerParams,
    state: { ...bps, prePipelineReviewText: reviewText || undefined },
  };
  ctx = applyMappingToCtx(ctx, stepParams?.applyMapping, review);

  // 多人语音：审核改【角色】台词本后回写 contract.business.lines（保留 cue）
  if (stepParams?.syncDialogueLines === true && reviewText) {
    const contract = (ctx.state.contract ?? {}) as Record<string, unknown>;
    const business = {
      ...((contract.business as Record<string, unknown> | undefined) ?? {}),
    };
    const prevLines = Array.isArray(business.lines)
      ? (business.lines as Array<Record<string, unknown>>)
      : [];
    const cast = Array.isArray(business.cast)
      ? (business.cast as Array<Record<string, unknown>>)
      : [];
    business.lines = syncDialogueLinesFromScript({
      script: reviewText,
      lines: prevLines,
      cast,
    });
    business.script_draft = reviewText;
    ctx = {
      ...ctx,
      params: { ...ctx.params, script_draft: reviewText },
      state: {
        ...ctx.state,
        contract: { ...contract, business },
        coreArtifact: {
          kind: 'text',
          text: reviewText,
          metadata: { mxmWarp: true, dialogueScript: true },
        },
      },
    };
  }

  // 交互卡 / 分步 basic：将 review.json 平面合并进 params（显式 mapping 优先）
  if (
    (review.kind === 'interactive-card' || review.kind === 'basic-form') &&
    reviewJson &&
    typeof reviewJson === 'object' &&
    !Array.isArray(reviewJson)
  ) {
    ctx = {
      ...ctx,
      params: { ...ctx.params, ...(reviewJson as Record<string, unknown>) },
    };
  }

  // video-timeline 审核：确保用户编辑后的 ProjectFile 写入 pipeline state（供 nestedVideo / 二次审核）
  if (reviewJson != null && (review.kind === 'video-timeline' || isVideoEditProjectFile(reviewJson))) {
    ctx = { ...ctx, state: { ...ctx.state, videoEditScriptJson: reviewJson } };
    const scriptText = JSON.stringify(reviewJson);
    const prevArtifact = ctx.state.finalArtifact as CoreArtifact | undefined;
    ctx = {
      ...ctx,
      state: {
        ...ctx.state,
        finalArtifact: {
          kind: 'text',
          ...(prevArtifact ?? {}),
          text: scriptText,
        },
      },
    };
  }

  const nextCheckpoint: ReviewCheckpoint = {
    phase,
    stepIndex: (checkpoint?.stepIndex ?? gate?.stepIndex ?? 0) + 1,
    completedGateIds,
  };

  const pipelineState: Record<string, unknown> = {
    ...bps,
    ...ctx.state,
    reviewCheckpoint: nextCheckpoint,
    currentReviewGate: undefined,
    businessPipelineAwaitingReview: false,
    businessPipelinePreDeferred: phase === 'pre',
    businessPipelinePreDone: phase === 'post',
    pipelineNestedUsage: bps.pipelineNestedUsage,
    pipelineTrace: bps.pipelineTrace,
    ...(pendingPostResult != null ? { pendingPostResult } : {}),
  };

  const promptText =
    reviewText ||
    (typeof ctx.state.finalPrompt === 'string' ? ctx.state.finalPrompt : '') ||
    (typeof ctx.params.prompt === 'string' ? ctx.params.prompt : '');

  if (phase === 'pre') {
    if (taskType === 'audio') {
      return {
        ...params,
        taskType: 'audio',
        prompt: promptText,
        parameters: buildAudioTtsParameters(innerParams, promptText),
        params: { ...innerParams, prompt: promptText, useConfiguredPrompt: true },
        businessPipelineState: {
          ...pipelineState,
          businessPipelinePreDone: false,
          businessPipelinePreDeferred: true,
        },
      };
    }
    if (taskType === 'music') {
      return {
        ...params,
        taskType: 'music',
        prompt: promptText,
        parameters: buildMusicGenerationParameters(innerParams, promptText),
        params: { ...innerParams, prompt: promptText, useConfiguredPrompt: true },
        businessPipelineState: {
          ...pipelineState,
          businessPipelinePreDone: false,
          businessPipelinePreDeferred: true,
        },
      };
    }
    return {
      ...params,
      prompt: promptText,
      params: { ...innerParams, prompt: promptText, useConfiguredPrompt: true },
      businessPipelineState: pipelineState,
    };
  }

  // post phase approve — resume post pipeline from next step
  const mergedPipelineState = {
    ...pipelineState,
    businessPipelinePostDeferred: true,
  };
  return {
    ...params,
    params: {
      ...innerParams,
      ...(ctx.params as Record<string, unknown>),
      businessPipelineState: mergedPipelineState,
    },
    businessPipelineState: mergedPipelineState,
  };
}

export function markPrePipelineComplete(params: Record<string, any>): Record<string, any> {
  const bps = { ...((params.businessPipelineState ?? {}) as Record<string, unknown>) };
  return {
    ...params,
    businessPipelineState: {
      ...bps,
      businessPipelinePreDone: true,
      businessPipelinePreDeferred: false,
      businessPipelineAwaitingReview: false,
      reviewCheckpoint: undefined,
      currentReviewGate: undefined,
    },
  };
}

export function resolveManualReviewStepFromTemplate(
  template: TaskTemplate,
  scope: string,
  gate: ManualReviewGateInfo,
  rowExtra?: Record<string, unknown> | null
): PipelineStep | null {
  const { pre, post } = mergeEffectivePipeline(scope, template, rowExtra ?? null);
  // mxm-warp：gate 可能在 enrich；合并 pre+enrich+post 查找
  const warpPipe = (template.pipeline ?? {}) as {
    pre?: PipelineStep[];
    enrich?: PipelineStep[];
    post?: PipelineStep[];
  };
  const all = [
    ...(warpPipe.pre ?? pre ?? []),
    ...(warpPipe.enrich ?? []),
    ...(warpPipe.post ?? post ?? []),
  ];
  const byId = all.find((s) => {
    if (!s || (s.step !== 'manualReview' && s.step !== 'interactiveCard')) return false;
    const id = typeof s.params?.id === 'string' ? s.params.id : '';
    return id === gate.gateId;
  });
  if (byId) return byId;
  const steps = gate.phase === 'pre' ? pre : post;
  const step = steps[gate.stepIndex];
  if (step && (isManualReviewStep(step) || step.step === 'interactiveCard')) return step;
  return null;
}

export function resolveGateIdFromTaskMetadata(metadata: Record<string, unknown>): string | undefined {
  const gate = metadata.manualReviewGate as ManualReviewGateInfo | undefined;
  return gate?.gateId;
}

/**
 * 合并任务各处的 businessPipelineState（内层 params / 根级 requestParams / metadata）。
 * 根级 requestParams 最新（审核通过写回），优先于内层快照。
 */
export function mergeBusinessPipelineState(
  taskParams: Record<string, unknown>,
  nestedParams?: Record<string, unknown>,
  taskMeta?: Record<string, unknown>
): Record<string, unknown> {
  const inner = (nestedParams?.businessPipelineState ?? {}) as Record<string, unknown>;
  const root = (taskParams.businessPipelineState ?? {}) as Record<string, unknown>;
  const meta = (taskMeta?.businessPipelineState ?? {}) as Record<string, unknown>;
  return { ...inner, ...meta, ...root };
}

export { reconstructReviewDraftFromTask } from './manual-review-draft-reconstruct';

export function scrubPersistedReviewArtifacts(params: Record<string, any>): Record<string, any> {
  const next = { ...params } as Record<string, any>;
  const bps = { ...((next.businessPipelineState ?? {}) as Record<string, unknown>) };
  delete bps.prePipelineReviewText;
  delete bps.pendingReviewDraft;
  delete bps.businessPipelineAwaitingReview;
  delete bps.reviewCheckpoint;
  delete bps.currentReviewGate;
  delete bps.finalPrompt;
  delete bps.promptForModel;
  delete bps.voiceOverPipeline;
  delete bps.musicPipeline;
  delete bps.graphPipeline;
  next.businessPipelineState = bps;
  delete next.prompt;
  delete next.parameters;
  if (next.params && typeof next.params === 'object') {
    const inner = { ...(next.params as Record<string, unknown>) };
    delete inner.prompt;
    next.params = inner;
  }
  return next;
}

export function scrubTaskMetadataReviewFlags(metadata: Record<string, unknown>): Record<string, unknown> {
  const next = { ...metadata };
  delete next.manualReviewGate;
  delete next.businessPipelineState;
  delete next.nestedVideoRenderPending;
  delete next.videoEditRenderTaskId;
  delete next.videoEditRenderStepIndex;
  return next;
}
