/**
 * OpenReel ProjectFile 通用构建器 — 不含业务硬编码，由步骤 params + fieldMapping 驱动
 */
import { randomUUID } from 'node:crypto';
import type { VideoEditScript, MxmRenderMode } from './types';
import type { TimelineVisualSegment } from './timeline-segment-types';
import { buildOpenReelOverlaysFromSegments } from './timeline-overlay-builder';
import { normalizeMxmRenderMode } from './render-mode';
import {
  resolveRenderModeFromPlan,
  type RenderPlanInput,
} from './render-plan';
import {
  enrichTimelineVisualSegment,
  enrichVideoEditScriptAiPrompts,
  type PromptCoherenceContext,
} from './clip-prompt-coherence';
import { assignAlternatingImageMotion } from './image-motion-assign';
import {
  OPENING_CLOSING_STOCK_QUERY,
  isOpeningOrClosingBeat,
  normalizeStockQuery,
} from './stock-media-query';

export type TimelineBuildConfig = {
  title: string;
  totalDurationSeconds: number;
  aspectRatio?: string;
  renderPlan?: RenderPlanInput;
  editStyle?: string;
  supplement?: string;
  audioUrl?: string;
  /** AI 视频片段调用的 video 子业务（默认 resource/fragment → atlascloud seedance） */
  aiVideoTaskKey?: string;
  aiVideoSubtype?: string;
  /** 全片主题（写入 clip metadata，供 AI 片段生成） */
  globalTopic?: string;
  /** 副标题 / 本期角度（开场 overlay） */
  episodeSubtitle?: string;
  /** 节目名（开场角标 / 结尾关注） */
  showName?: string;
  /** UP主 / 主持人（开场 lower-third） */
  hostName?: string;
  segments: TimelineVisualSegment[];
  /** 句级字幕（可选，写入 timeline.subtitles） */
  subtitleSegments?: { text: string; startSeconds: number; endSeconds: number }[];
  promptTemplate?: string;
  styleHints?: Record<string, string>;
  defaultStyleHint?: string;
  videoTrackName?: string;
  audioTrackName?: string;
  projectNameFallback?: string;
};

function roundSec(n: number): number {
  return Math.round(n);
}

function aspectToSettings(aspectRatio?: string): { width: number; height: number } {
  switch (aspectRatio) {
    case '9:16':
      return { width: 1080, height: 1920 };
    case '1:1':
      return { width: 1080, height: 1080 };
    default:
      return { width: 1920, height: 1080 };
  }
}

export { resolveRenderModeFromPlan } from './render-plan';

function buildPromptCoherenceContext(config: TimelineBuildConfig): PromptCoherenceContext {
  return {
    globalTopic: config.globalTopic ?? config.title,
    editStyle: config.editStyle,
    aspectRatio: config.aspectRatio,
    supplement: config.supplement,
  };
}

export function buildVideoEditProjectFile(config: TimelineBuildConfig): VideoEditScript {
  const duration = roundSec(Math.max(1, config.totalDurationSeconds));
  const windows = config.segments.filter((s) => s.endSeconds > s.startSeconds);
  if (!windows.length) {
    windows.push({ startSeconds: 0, endSeconds: duration, text: config.title });
  }

  const { width, height } = aspectToSettings(config.aspectRatio);
  const now = Date.now();
  const projectId = randomUUID();
  const videoTrackId = 'track-video-main';
  const audioTrackId = 'track-audio-main';

  const promptCtx = buildPromptCoherenceContext(config);

  const normalizedWindows = windows.map((w, i) => {
    const resolved =
      w.mxmRenderMode ?? resolveRenderModeFromPlan(config.renderPlan, i, windows.length);
    const mode = normalizeMxmRenderMode(resolved);
    const base = { ...w, mxmRenderMode: mode as MxmRenderMode };
    return mode === 'ai-video-gen' ? enrichTimelineVisualSegment(base, promptCtx) : base;
  });

  const visualClips = normalizedWindows.map((w, i) => {
    const clipDuration = roundSec(w.endSeconds - w.startSeconds);
    const mode = w.mxmRenderMode ?? 'static-image';
    const intDuration = Math.max(1, clipDuration);
    const metadata: Record<string, unknown> = {
      mxmRenderMode: mode,
      mxmDuration: intDuration,
      mxmRatio: (config.aspectRatio as '16:9' | '9:16' | '1:1') ?? '16:9',
    };
    if (w.mxmBeatRole) metadata.mxmBeatRole = w.mxmBeatRole;

    if (mode === 'ai-video-gen') {
      const aiOutputKind = w.mxmAiOutputKind ?? 'video';
      metadata.mxmAiOutputKind = aiOutputKind;
      if (aiOutputKind === 'image') {
        if (w.mxmImagePrompt?.trim()) metadata.mxmImagePrompt = w.mxmImagePrompt.trim();
        // 兼容：旧段只写了 mxmPrompt
        else if (w.mxmPrompt?.trim()) metadata.mxmImagePrompt = w.mxmPrompt.trim();
      } else {
        if (w.mxmVideoPrompt?.trim()) metadata.mxmVideoPrompt = w.mxmVideoPrompt.trim();
        else if (w.mxmPrompt?.trim()) metadata.mxmVideoPrompt = w.mxmPrompt.trim();
      }
      metadata.mxmVideoMode = w.mxmVideoMode ?? 'text-to-video';
      metadata.mxmVideoTaskKey = w.mxmVideoTaskKey ?? config.aiVideoTaskKey ?? 'generator';
      metadata.mxmVideoSubtype = w.mxmVideoSubtype ?? config.aiVideoSubtype ?? 'fragment';
      metadata.mxmResolution = '720p';
      metadata.mxmGenerateAudio = false;
      metadata.mxmGlobalTopic = config.globalTopic ?? config.title;
      metadata.mxmEditStyle = config.editStyle;
      metadata.mxmVoiceoverText = w.mxmVoiceoverText;
      metadata.mxmFragmentRole = w.mxmFragmentRole ?? 'broll';
      metadata.mxmVisualStyle = w.mxmVisualStyle;
      metadata.mxmMotionIntensity = w.mxmMotionIntensity;
      metadata.mxmBackgroundMode = w.mxmBackgroundMode;
      if (w.text?.trim()) metadata.mxmSegmentBrief = w.text.trim();
      if (aiOutputKind === 'image') {
        metadata.mxmGraphTaskKey = w.mxmGraphTaskKey ?? 'design';
        metadata.mxmGraphSubtype = w.mxmGraphSubtype ?? 'content-illustration';
        metadata.mxmImageMotionEnabled = w.mxmImageMotionEnabled ?? true;
        // 未指定时留给 assignAlternatingImageMotion，避免全片默认 zoom-in
        metadata.mxmImageMotion =
          w.mxmImageMotion && w.mxmImageMotion !== 'none' ? w.mxmImageMotion : undefined;
      }
    } else {
      metadata.mxmAutoStockImage = true;
      metadata.mxmAutoStockVideo = false;
      metadata.mxmImageFit = 'cover';
      metadata.mxmImageMotionEnabled = w.mxmImageMotionEnabled ?? true;
      metadata.mxmImageMotion =
        w.mxmImageMotion && w.mxmImageMotion !== 'none' ? w.mxmImageMotion : undefined;
      const stockKeywords = (w.keywords ?? [])
        .map((k) => k.trim())
        .filter(Boolean);
      if (stockKeywords.length) metadata.mxmStockKeywords = stockKeywords;
      // 入库前收紧：只要英文实体词；中文原句不透传（避免图库无效检索）
      // 开场/结尾固定 empty background（叠字用空镜）
      const stockQuery = isOpeningOrClosingBeat({
        mxmBeatRole: w.mxmBeatRole,
        mxmFragmentRole: w.mxmFragmentRole,
      })
        ? OPENING_CLOSING_STOCK_QUERY
        : normalizeStockQuery(w.mxmStockSearchQuery?.trim() ?? '') ||
          normalizeStockQuery(stockKeywords.join(' ')) ||
          undefined;
      if (stockQuery) metadata.mxmStockSearchQuery = stockQuery;
      if (w.mxmGsapSceneBrief) {
        metadata.mxmGsapSceneBrief = w.mxmGsapSceneBrief;
      }
    }

    if (w.mxmSourceImageUrl) {
      metadata.mxmSourceImageUrl = w.mxmSourceImageUrl;
    }

    return {
      id: `clip-vis-${i + 1}`,
      trackId: videoTrackId,
      mediaId: '',
      startTime: roundSec(w.startSeconds),
      duration: intDuration,
      type: 'video' as const,
      metadata,
    };
  });

  const overlayPack = buildOpenReelOverlaysFromSegments(normalizedWindows, {
    projectWidth: width,
    projectHeight: height,
    editStyle: config.editStyle,
    title: config.globalTopic ?? config.title,
    subtitle: config.episodeSubtitle,
    showName: config.showName,
    hostName: config.hostName,
  });

  const tracks: VideoEditScript['project']['timeline']['tracks'] = [
    {
      id: videoTrackId,
      type: 'video',
      name: config.videoTrackName ?? '片段',
      clips: visualClips,
      transitions: overlayPack.transitions,
      locked: false,
      hidden: false,
      muted: false,
      solo: false,
    },
  ];

  if (overlayPack.textTrack) {
    tracks.push(overlayPack.textTrack);
  }

  const audioUrl = config.audioUrl?.trim();
  if (audioUrl) {
    const mediaId = audioUrl.startsWith('tts:') ? audioUrl : `tts:${audioUrl}`;
    tracks.push({
      id: audioTrackId,
      type: 'audio',
      name: config.audioTrackName ?? '口播',
      clips: [
        {
          id: 'clip-audio-main',
          trackId: audioTrackId,
          mediaId,
          startTime: 0,
          duration,
          type: 'audio' as const,
        },
      ],
      transitions: [],
      locked: false,
      hidden: false,
      muted: false,
      solo: false,
    });
  }

  const subtitles = (config.subtitleSegments ?? []).map((s, i) => ({
    id: `sub-${i + 1}`,
    text: s.text,
    startTime: roundSec(s.startSeconds),
    endTime: roundSec(s.endSeconds),
  }));

  const baseScript: VideoEditScript = {
    version: '1.0.0',
    project: {
      id: projectId,
      name: config.title.trim() || config.projectNameFallback || '视频剪辑',
      createdAt: now,
      modifiedAt: now,
      settings: {
        width,
        height,
        frameRate: 30,
        sampleRate: 48000,
        channels: 2,
        mxmEditStyle: config.editStyle,
        mxmGlobalTopic: config.globalTopic ?? config.title,
      },
      mediaLibrary: { items: [] },
      timeline: {
        duration,
        tracks,
        subtitles,
      },
      textClips: overlayPack.textClips.length ? overlayPack.textClips : undefined,
    },
  };

  // 初建时间轴强制按设计序列重排动效（忽略解析/LLM 留下的统一 pan-left）
  return assignAlternatingImageMotion(enrichVideoEditScriptAiPrompts(baseScript, promptCtx), {
    respectExisting: false,
  });
}
