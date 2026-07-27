/**
 * 第一次分镜审核：为 AI 视频/配图片段补齐 prompt，并保持全片风格连贯
 */
import type { MxmClipMetadata, VideoEditScript } from './types';
import type { TimelineVisualSegment } from './timeline-segment-types';
import {
  mapEditStyleToBackgroundMode,
  mapEditStyleToMotionIntensity,
  mapEditStyleToVisualStyle,
} from './fragment-pipeline-params';
import { assignAlternatingImageMotion } from './image-motion-assign';
import { hasAiImagePrompt, hasAiVideoPrompt } from './ai-prompt-fields';

export type PromptCoherenceContext = {
  globalTopic?: string;
  editStyle?: string;
  aspectRatio?: string;
  supplement?: string;
  coreMessage?: string;
  /** 用户「素材类型」：强制 ai-video-gen 段默认 mxmAiOutputKind */
  defaultAiOutputKind?: 'video' | 'image';
};

const EDIT_STYLE_ENGLISH_HINTS: Record<string, string> = {
  'science-minimal':
    'minimal science explainer aesthetic, dark clean background, soft rim lighting, muted blue-gray palette',
  documentary:
    'documentary cinematography, natural lighting, realistic textures, authentic B-roll footage',
  'motion-infographic':
    'modern motion infographic style, bold shapes, data-driven visuals, dynamic readable composition',
  classroom: 'bright educational style, clean layout, friendly approachable visuals',
};

const EDIT_STYLE_IMAGE_LABEL: Record<string, string> = {
  'science-minimal': '极简科普信息图',
  documentary: '纪实风格配图',
  'motion-infographic': '动感数据信息图',
  classroom: '课堂教学插图',
};

function styleHint(editStyle?: string): string {
  const key = editStyle?.trim();
  if (key && EDIT_STYLE_ENGLISH_HINTS[key]) return EDIT_STYLE_ENGLISH_HINTS[key]!;
  return 'professional cohesive video style';
}

function aspectPhrase(aspectRatio?: string): string {
  switch (aspectRatio) {
    case '9:16':
      return 'vertical 9:16 frame';
    case '1:1':
      return 'square 1:1 frame';
    default:
      return 'widescreen 16:9 frame';
  }
}

/** Seedance 英文 B-roll prompt */
export function buildDefaultVideoSeedancePrompt(
  segmentText: string,
  voiceoverText: string | undefined,
  ctx: PromptCoherenceContext
): string {
  const topic = ctx.globalTopic?.trim() || 'video topic';
  const desc = segmentText.trim() || voiceoverText?.trim() || topic;
  const vo = voiceoverText?.trim();
  const voHint =
    vo && vo !== desc ? ` Narration context (do not render as text): ${vo.slice(0, 160)}.` : '';
  const supplement = ctx.supplement?.trim() ? ` ${ctx.supplement.trim()}.` : '';

  return [
    `${styleHint(ctx.editStyle)}, ${aspectPhrase(ctx.aspectRatio)}.`,
    `Video about "${topic}".`,
    `Scene: ${desc}.`,
    voHint,
    'Consistent visual language across the entire video:',
    `${mapEditStyleToVisualStyle(ctx.editStyle)} look,`,
    `${mapEditStyleToMotionIntensity(ctx.editStyle)} camera motion,`,
    `${mapEditStyleToBackgroundMode(ctx.editStyle)} background.`,
    `No burned-in subtitles or large on-screen text.${supplement}`,
  ]
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Graph 配图 prompt（中文，映射 core_content） */
export function buildDefaultGraphImagePrompt(
  segmentText: string,
  voiceoverText: string | undefined,
  ctx: PromptCoherenceContext
): string {
  const topic = ctx.globalTopic?.trim() || '视频主题';
  const desc = segmentText.trim() || voiceoverText?.trim() || topic;
  const styleLabel =
    EDIT_STYLE_IMAGE_LABEL[ctx.editStyle?.trim() ?? ''] ?? '视频内嵌配图';

  return `${styleLabel}，全片主题「${topic}」。本段画面：${desc}。风格与全片其他镜头保持统一，扁平清晰、适合 Ken Burns 动效，无大面积文字堆砌。`;
}

export function applyCoherentStyleFields(
  meta: Partial<MxmClipMetadata>,
  ctx: PromptCoherenceContext
): Partial<MxmClipMetadata> {
  const editStyle = ctx.editStyle;
  return {
    mxmGlobalTopic: meta.mxmGlobalTopic ?? ctx.globalTopic,
    mxmEditStyle: meta.mxmEditStyle ?? editStyle,
    mxmVisualStyle: meta.mxmVisualStyle ?? mapEditStyleToVisualStyle(editStyle),
    mxmMotionIntensity: meta.mxmMotionIntensity ?? mapEditStyleToMotionIntensity(editStyle),
    mxmBackgroundMode: meta.mxmBackgroundMode ?? mapEditStyleToBackgroundMode(editStyle),
  };
}

/** 补齐单个分镜段的 AI prompt 与风格字段 */
export function enrichTimelineVisualSegment(
  seg: TimelineVisualSegment,
  ctx: PromptCoherenceContext
): TimelineVisualSegment {
  if (seg.mxmRenderMode !== 'ai-video-gen') return seg;

  const aiOutputKind = seg.mxmAiOutputKind ?? 'video';
  const segmentText = seg.text?.trim() || seg.mxmVoiceoverText?.trim() || '';

  const next: TimelineVisualSegment = {
    ...seg,
    mxmAiOutputKind: aiOutputKind,
    mxmVisualStyle: seg.mxmVisualStyle ?? mapEditStyleToVisualStyle(ctx.editStyle),
    mxmMotionIntensity: seg.mxmMotionIntensity ?? mapEditStyleToMotionIntensity(ctx.editStyle),
    mxmBackgroundMode: seg.mxmBackgroundMode ?? mapEditStyleToBackgroundMode(ctx.editStyle),
  };

  if (aiOutputKind === 'image') {
    if (!hasAiImagePrompt(seg)) {
      next.mxmImagePrompt = buildDefaultGraphImagePrompt(segmentText, seg.mxmVoiceoverText, ctx);
    } else if (!seg.mxmImagePrompt?.trim() && seg.mxmPrompt?.trim()) {
      next.mxmImagePrompt = seg.mxmPrompt.trim();
    }
  } else if (!hasAiVideoPrompt(seg)) {
    next.mxmVideoPrompt = buildDefaultVideoSeedancePrompt(segmentText, seg.mxmVoiceoverText, ctx);
  } else if (!seg.mxmVideoPrompt?.trim() && seg.mxmPrompt?.trim()) {
    next.mxmVideoPrompt = seg.mxmPrompt.trim();
  }

  return next;
}

/** shot-list JSON 后处理：补齐缺失 video/image prompt 与统一 mxmVisualStyle */
export function enrichShotListRaw(
  shotListRaw: unknown,
  ctx: PromptCoherenceContext
): unknown {
  if (!shotListRaw || typeof shotListRaw !== 'object' || Array.isArray(shotListRaw)) {
    return shotListRaw;
  }

  const shot = shotListRaw as Record<string, unknown>;
  const segments = shot.segments;
  if (!Array.isArray(segments)) return shotListRaw;

  const globalTopic = String(shot.global_topic ?? '').trim() || ctx.globalTopic;
  const enrichedCtx: PromptCoherenceContext = {
    ...ctx,
    globalTopic: globalTopic || ctx.globalTopic,
    coreMessage: String(shot.core_message ?? '').trim() || ctx.coreMessage,
  };

  const coherentVisual = mapEditStyleToVisualStyle(ctx.editStyle);

  const nextSegments = segments.map((seg) => {
    if (!seg || typeof seg !== 'object') return seg;
    const s = seg as Record<string, unknown>;
    if (String(s.mxmRenderMode ?? '').trim() !== 'ai-video-gen') return seg;

    const aiKind =
      ctx.defaultAiOutputKind === 'image' || ctx.defaultAiOutputKind === 'video'
        ? ctx.defaultAiOutputKind
        : String(s.mxmAiOutputKind ?? 'video').trim() === 'image'
          ? 'image'
          : 'video';
    const text = String(s.text ?? '').trim();
    const vo = String(s.voiceover_text ?? '').trim() || undefined;
    const legacy = String(s.mxmPrompt ?? '').trim() || undefined;

    const enriched = enrichTimelineVisualSegment(
      {
        startSeconds: 0,
        endSeconds: 1,
        text,
        mxmRenderMode: 'ai-video-gen',
        mxmAiOutputKind: aiKind,
        mxmVoiceoverText: vo,
        mxmVideoPrompt: String(s.mxmVideoPrompt ?? '').trim() || undefined,
        mxmImagePrompt: String(s.mxmImagePrompt ?? '').trim() || undefined,
        mxmPrompt: legacy,
      },
      enrichedCtx
    );

    return {
      ...s,
      mxmAiOutputKind: aiKind,
      mxmVideoPrompt: enriched.mxmVideoPrompt,
      mxmImagePrompt: enriched.mxmImagePrompt,
      mxmVisualStyle: s.mxmVisualStyle ?? coherentVisual,
      mxmMotionIntensity:
        s.mxmMotionIntensity ?? mapEditStyleToMotionIntensity(ctx.editStyle),
      mxmBackgroundMode:
        s.mxmBackgroundMode ?? mapEditStyleToBackgroundMode(ctx.editStyle),
    };
  });

  return {
    ...shot,
    global_topic: globalTopic ?? shot.global_topic,
    segments: nextSegments,
  };
}

/** OpenReel ProjectFile 后处理：确保第一次审核前每段 AI 均有 prompt */
export function enrichVideoEditScriptAiPrompts(
  script: VideoEditScript,
  ctx: PromptCoherenceContext
): VideoEditScript {
  const next = structuredClone(script) as VideoEditScript;
  const settings = next.project.settings as Record<string, unknown>;
  const globalTopic =
    String(settings.mxmGlobalTopic ?? '').trim() ||
    ctx.globalTopic?.trim() ||
    next.project.name?.trim();
  const editStyle = String(settings.mxmEditStyle ?? ctx.editStyle ?? '').trim() || ctx.editStyle;
  const aspectRatio =
    ctx.aspectRatio ??
    (settings.width === 1080 && settings.height === 1920
      ? '9:16'
      : settings.width === 1080 && settings.height === 1080
        ? '1:1'
        : '16:9');

  const enrichedCtx: PromptCoherenceContext = {
    ...ctx,
    globalTopic,
    editStyle,
    aspectRatio,
  };

  for (const track of next.project.timeline.tracks) {
    if (track.type !== 'video') continue;
    for (const clip of track.clips) {
      const meta = (clip.metadata ?? {}) as MxmClipMetadata;
      if (meta.mxmRenderMode !== 'ai-video-gen') continue;

      const aiOutputKind = meta.mxmAiOutputKind ?? 'video';
      Object.assign(meta, applyCoherentStyleFields(meta, enrichedCtx));
      meta.mxmAiOutputKind = aiOutputKind;

      if (aiOutputKind === 'image') {
        meta.mxmImageMotionEnabled = meta.mxmImageMotionEnabled ?? true;
        // 不在此处写死 zoom-in，交给 assignAlternatingImageMotion
        meta.mxmGraphTaskKey = meta.mxmGraphTaskKey ?? 'design';
        meta.mxmGraphSubtype = meta.mxmGraphSubtype ?? 'content-illustration';
      }

      const segmentText =
        meta.mxmSegmentBrief?.trim() ||
        meta.mxmVoiceoverText?.trim() ||
        globalTopic ||
        '';

      if (aiOutputKind === 'image') {
        if (!hasAiImagePrompt(meta)) {
          meta.mxmImagePrompt = buildDefaultGraphImagePrompt(
            segmentText,
            meta.mxmVoiceoverText,
            enrichedCtx
          );
        } else if (!meta.mxmImagePrompt?.trim() && meta.mxmPrompt?.trim()) {
          meta.mxmImagePrompt = meta.mxmPrompt.trim();
        }
      } else if (!hasAiVideoPrompt(meta)) {
        meta.mxmVideoPrompt = buildDefaultVideoSeedancePrompt(
          segmentText,
          meta.mxmVoiceoverText,
          enrichedCtx
        );
      } else if (!meta.mxmVideoPrompt?.trim() && meta.mxmPrompt?.trim()) {
        meta.mxmVideoPrompt = meta.mxmPrompt.trim();
      }

      clip.metadata = meta;
    }
  }

  if (globalTopic && !settings.mxmGlobalTopic) {
    settings.mxmGlobalTopic = globalTopic;
  }
  if (editStyle && !settings.mxmEditStyle) {
    settings.mxmEditStyle = editStyle;
  }

  return assignAlternatingImageMotion(next);
}
