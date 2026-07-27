/**
 * 前置/后置管线步骤：buildVideoEditTimeline
 * 全部输入来自 step.params + step.fieldMapping（Admin 可配置，无业务硬编码）
 */
import type { PipelineStep, TaskContext } from './types';
import { interpolatePipelineTemplate } from './business-pipeline';
import { buildVideoEditProjectFile } from '../core/video-edit/timeline-builder-core';
import { normalizeRenderPlanInput } from '../core/video-edit/render-plan';
import {
  resolveTimelineVisualSegments,
  resolveCutRhythmBounds,
  voiceoverSegmentsToWindows,
  type SegmentStrategyId,
} from '../core/video-edit/timeline-segment-resolvers';
import type { VoiceoverSubtitleLike } from '../core/video-edit/timeline-segment-types';

const LEGACY_STRATEGY_ALIASES: Record<string, SegmentStrategyId> = {
  buildSciencePopTimeline: 'voiceover-subtitles',
};

function readTemplate(ctx: TaskContext, tmpl: string | undefined): string {
  if (!tmpl?.trim()) return '';
  return interpolatePipelineTemplate(tmpl, ctx).trim();
}

function readNumber(ctx: TaskContext, tmpl: string | undefined, fallbackField?: string): number {
  const fromTmpl = tmpl ? readTemplate(ctx, tmpl) : '';
  if (fromTmpl && Number(fromTmpl) > 0) return Number(fromTmpl);
  if (fallbackField) {
    const raw = ctx.params[fallbackField];
    if (typeof raw === 'number' && raw > 0) return raw;
    if (typeof raw === 'string' && raw.trim() && Number(raw) > 0) return Number(raw);
  }
  const voiceoverAudio = ctx.state.voiceoverAudio as { durationSeconds?: number } | undefined;
  if (typeof voiceoverAudio?.durationSeconds === 'number' && voiceoverAudio.durationSeconds > 0) {
    return voiceoverAudio.durationSeconds;
  }
  return 0;
}

function parseVoiceoverSegmentsForRhythm(raw: unknown): VoiceoverSubtitleLike[] {
  const tryParse = (value: unknown): VoiceoverSubtitleLike[] => {
    if (!value) return [];
    let data = value;
    if (typeof value === 'string' && value.trim()) {
      try {
        data = JSON.parse(value) as unknown;
      } catch {
        return [];
      }
    }
    const arr = Array.isArray(data)
      ? data
      : data && typeof data === 'object' && Array.isArray((data as { segments?: unknown }).segments)
        ? (data as { segments: unknown[] }).segments
        : [];
    const out: VoiceoverSubtitleLike[] = [];
    for (const item of arr) {
      if (!item || typeof item !== 'object') continue;
      const text = String((item as { text?: unknown }).text ?? '').trim();
      const startSeconds = Number((item as { startSeconds?: unknown }).startSeconds);
      const endSeconds = Number((item as { endSeconds?: unknown }).endSeconds);
      if (!text || !Number.isFinite(startSeconds) || !Number.isFinite(endSeconds)) continue;
      out.push({ text, startSeconds, endSeconds });
    }
    return out;
  };

  const fromRaw = tryParse(raw);
  return fromRaw;
}

function readRawFromContext(ctx: TaskContext, tmpl: string | undefined, statePath?: string): unknown {
  if (tmpl?.trim()) {
    const interpolated = interpolatePipelineTemplate(tmpl, ctx);
    if (interpolated.trim().startsWith('[') || interpolated.trim().startsWith('{')) {
      try {
        return JSON.parse(interpolated) as unknown;
      } catch {
        return interpolated;
      }
    }
    if (interpolated.trim()) return interpolated;
  }
  if (statePath?.trim()) {
    const parts = statePath.split('.').filter(Boolean);
    let cur: unknown = ctx.state;
    for (const p of parts) {
      if (cur == null || typeof cur !== 'object') return undefined;
      cur = (cur as Record<string, unknown>)[p];
    }
    return cur;
  }
  return undefined;
}

function parseSubtitleSegments(raw: unknown): VoiceoverSubtitleLike[] {
  if (!raw) return [];
  let data: unknown = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (data && typeof data === 'object' && Array.isArray((data as { segments?: unknown }).segments)) {
    data = (data as { segments: unknown[] }).segments;
  }
  if (!Array.isArray(data)) return [];
  const out: VoiceoverSubtitleLike[] = [];
  for (const item of data) {
    if (!item || typeof item !== 'object') continue;
    const text = String((item as { text?: unknown }).text ?? '').trim();
    const startSeconds = Number((item as { startSeconds?: unknown }).startSeconds);
    const endSeconds = Number((item as { endSeconds?: unknown }).endSeconds);
    if (!text || !Number.isFinite(startSeconds) || !Number.isFinite(endSeconds)) continue;
    out.push({ text, startSeconds, endSeconds });
  }
  return out;
}

function resolveStrategy(step: PipelineStep): SegmentStrategyId {
  const raw =
    (typeof step.params?.segmentStrategy === 'string' && step.params.segmentStrategy.trim()) ||
    (step.step === 'buildSciencePopTimeline' ? 'voiceover-subtitles' : '');
  const mapped = LEGACY_STRATEGY_ALIASES[raw] ?? raw;
  const allowed: SegmentStrategyId[] = [
    'voiceover-subtitles',
    'fixed-chunk',
    'shot-list',
    'image-sequence',
    'document-sections',
  ];
  if (allowed.includes(mapped as SegmentStrategyId)) return mapped as SegmentStrategyId;
  throw new Error(
    `buildVideoEditTimeline: 无效 segmentStrategy「${raw}」，可选：${allowed.join(', ')}`
  );
}

export async function runBuildVideoEditTimelineStep(
  ctx: TaskContext,
  step: PipelineStep
): Promise<TaskContext> {
  const fieldMapping = (step.fieldMapping ?? step.params?.fieldMapping ?? {}) as Record<
    string,
    string
  >;

  const strategy = resolveStrategy(step);
  const durationSeconds = readNumber(
    ctx,
    fieldMapping.duration ?? (step.params?.durationFrom as string | undefined),
    typeof step.params?.durationField === 'string' ? step.params.durationField : 'audio_duration_seconds'
  );

  if (durationSeconds <= 0) {
    throw new Error(
      'buildVideoEditTimeline: 缺少有效总时长（请在 fieldMapping.duration 绑定 params 或先 resolveVoiceoverAudio）'
    );
  }

  const segmentsRaw = readRawFromContext(
    ctx,
    fieldMapping.segments ?? (step.params?.segmentsFrom as string | undefined),
    typeof step.params?.segmentsStatePath === 'string' ? step.params.segmentsStatePath : undefined
  );

  const chunkSeconds =
    typeof step.params?.chunkSeconds === 'number'
      ? step.params.chunkSeconds
      : Number(step.params?.chunkSeconds) || 8;

  const cutRhythm =
    readTemplate(ctx, fieldMapping.cutRhythm ?? (step.params?.cutRhythmFrom as string | undefined)) ||
    (typeof step.params?.defaultCutRhythm === 'string' ? step.params.defaultCutRhythm : undefined);

  const voiceoverSubsForRhythm = (() => {
    const fromParam = parseVoiceoverSegmentsForRhythm(ctx.params.voiceover_subtitles_json);
    if (fromParam.length) return fromParam;
    return parseVoiceoverSegmentsForRhythm(segmentsRaw);
  })();

  const rhythmFromParams = resolveCutRhythmBounds({
    cutRhythm: cutRhythm || undefined,
    minCutSeconds:
      typeof step.params?.minCutSeconds === 'number'
        ? step.params.minCutSeconds
        : Number(step.params?.minCutSeconds) || undefined,
    maxCutSeconds:
      typeof step.params?.maxCutSeconds === 'number'
        ? step.params.maxCutSeconds
        : Number(step.params?.maxCutSeconds) || undefined,
    voiceoverSegments: voiceoverSubsForRhythm,
    totalDurationSeconds: durationSeconds,
  });

  let topicTitle = readTemplate(ctx, fieldMapping.title ?? fieldMapping.topic ?? '${params.topic}');
  const editStyleVal = readTemplate(ctx, fieldMapping.editStyle ?? '${params.edit_style}') || undefined;

  let globalTopicFromShot = '';
  let episodeSubtitle = readTemplate(ctx, fieldMapping.subtitle ?? '${params.subtitle}') || '';
  let showName =
    readTemplate(ctx, fieldMapping.showName ?? fieldMapping.show_name ?? '${params.show_name}') ||
    '';
  let hostName =
    readTemplate(ctx, fieldMapping.hostName ?? fieldMapping.host_name ?? '${params.host_name}') ||
    '';
  try {
    const shotParsed =
      typeof segmentsRaw === 'string' ? JSON.parse(segmentsRaw) : segmentsRaw;
    if (shotParsed && typeof shotParsed === 'object') {
      const shot = shotParsed as {
        global_topic?: unknown;
        subtitle?: unknown;
        show_name?: unknown;
        host_name?: unknown;
      };
      globalTopicFromShot = String(shot.global_topic ?? '').trim();
      if (!episodeSubtitle) episodeSubtitle = String(shot.subtitle ?? '').trim();
      if (!showName) showName = String(shot.show_name ?? '').trim();
      if (!hostName) hostName = String(shot.host_name ?? '').trim();
    }
  } catch {
    /* ignore */
  }
  if (!topicTitle && globalTopicFromShot) topicTitle = globalTopicFromShot;

  let segmentsForResolve = segmentsRaw;
  if (strategy === 'shot-list' && segmentsRaw) {
    const { enrichShotListRaw } = await import('../core/video-edit/clip-prompt-coherence');
    const materialType = (
      readTemplate(ctx, fieldMapping.materialType ?? '${params.material_type}') || ''
    ).trim();
    segmentsForResolve = enrichShotListRaw(segmentsRaw, {
      globalTopic: topicTitle || undefined,
      editStyle: editStyleVal,
      aspectRatio: readTemplate(ctx, fieldMapping.aspectRatio ?? '${params.aspectRatio}') || undefined,
      supplement: readTemplate(ctx, fieldMapping.supplement ?? '${params.supplement}') || undefined,
      defaultAiOutputKind:
        materialType === 'image' || materialType === 'video' ? materialType : undefined,
    });
  }

  const visualSegmentsRaw = resolveTimelineVisualSegments({
    strategy,
    totalDurationSeconds: durationSeconds,
    segmentsRaw: segmentsForResolve,
    chunkSeconds,
    cutRhythm: cutRhythm || undefined,
    minCutSeconds: rhythmFromParams?.minCutSeconds,
    maxCutSeconds: rhythmFromParams?.maxCutSeconds,
  });

  let globalTopic = topicTitle || globalTopicFromShot;

  let visualSegments = visualSegmentsRaw;

  const styleHints =
    step.params?.styleHints && typeof step.params.styleHints === 'object'
      ? (step.params.styleHints as Record<string, string>)
      : undefined;

  const subtitleSegments =
    strategy === 'voiceover-subtitles'
      ? parseSubtitleSegments(segmentsRaw)
      : parseSubtitleSegments(
          readRawFromContext(
            ctx,
            fieldMapping.subtitles ?? (step.params?.subtitlesFrom as string | undefined),
            typeof step.params?.subtitlesStatePath === 'string'
              ? step.params.subtitlesStatePath
              : 'voiceoverSubtitles.segments'
          )
        );

  const script = buildVideoEditProjectFile({
    title: topicTitle,
    totalDurationSeconds: durationSeconds,
    aspectRatio: readTemplate(ctx, fieldMapping.aspectRatio ?? '${params.aspectRatio}') || undefined,
    renderPlan: normalizeRenderPlanInput(ctx.params.render_plan),
    editStyle: editStyleVal,
    globalTopic,
    episodeSubtitle: episodeSubtitle || undefined,
    showName: showName || undefined,
    hostName: hostName || undefined,
    supplement: readTemplate(ctx, fieldMapping.supplement ?? '${params.supplement}') || undefined,
    audioUrl:
      readTemplate(ctx, fieldMapping.audioUrl ?? fieldMapping.voiceoverAudioUrl ?? '${params.voiceover_audio_url}') ||
      undefined,
    segments: visualSegments,
    subtitleSegments: subtitleSegments.length ? subtitleSegments : undefined,
    promptTemplate:
      typeof step.params?.promptTemplate === 'string' ? step.params.promptTemplate : undefined,
    styleHints,
    defaultStyleHint:
      typeof step.params?.defaultStyleHint === 'string' ? step.params.defaultStyleHint : undefined,
    videoTrackName:
      typeof step.params?.videoTrackName === 'string' ? step.params.videoTrackName : undefined,
    audioTrackName:
      typeof step.params?.audioTrackName === 'string' ? step.params.audioTrackName : undefined,
    projectNameFallback:
      typeof step.params?.projectNameFallback === 'string'
        ? step.params.projectNameFallback
        : '视频剪辑',
    aiVideoTaskKey:
      typeof step.params?.aiVideoTaskKey === 'string' ? step.params.aiVideoTaskKey : undefined,
    aiVideoSubtype:
      typeof step.params?.aiVideoSubtype === 'string' ? step.params.aiVideoSubtype : undefined,
  });

  const jsonText = JSON.stringify(script);
  const builtBy = step.step === 'buildSciencePopTimeline' ? 'buildSciencePopTimeline' : 'buildVideoEditTimeline';

  const finalArtifact = {
    kind: 'text' as const,
    text: jsonText,
      metadata: {
      editorKind: 'openreel-timeline',
      builtBy,
      segmentStrategy: strategy,
      cutRhythm: cutRhythm || undefined,
      clipCount: script.project.timeline.tracks.find((t) => t.type === 'video')?.clips.length ?? 0,
      durationSeconds: script.project.timeline.duration,
    },
  };

  const outputStatePath =
    typeof step.params?.outputStatePath === 'string' && step.params.outputStatePath.trim()
      ? step.params.outputStatePath.trim()
      : 'finalArtifact';

  const nextState: Record<string, unknown> = {
    ...ctx.state,
    videoEditTimeline: {
      segmentStrategy: strategy,
      clipCount: finalArtifact.metadata.clipCount,
      durationSeconds: finalArtifact.metadata.durationSeconds,
    },
  };

  if (outputStatePath === 'finalArtifact' || outputStatePath === 'coreArtifact') {
    nextState[outputStatePath] = finalArtifact;
    if (outputStatePath === 'finalArtifact') {
      nextState.coreArtifact = finalArtifact;
    }
  } else {
    nextState[outputStatePath] = finalArtifact;
    nextState.finalArtifact = finalArtifact;
    nextState.coreArtifact = finalArtifact;
  }

  return { ...ctx, state: nextState };
}

/** @deprecated 使用 buildVideoEditTimeline + segmentStrategy=voiceover-subtitles */
export async function runBuildSciencePopTimelineStep(
  ctx: TaskContext,
  step: PipelineStep
): Promise<TaskContext> {
  return runBuildVideoEditTimelineStep(ctx, step);
}

// re-export for tests
export { voiceoverSegmentsToWindows };
