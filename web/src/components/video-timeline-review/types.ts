/** 与 mxmcgi video-edit/types 对齐的轻量前端类型 */

import type { TextClip } from '@mxmai/mxm-editor-core/text/types';

export type { TextClip };

export type OverlayTextAnimationPreset =
  | 'none'
  | 'fade'
  | 'slide-up'
  | 'slide-down'
  | 'slide-left'
  | 'slide-right'
  | 'pop'
  | 'typewriter'
  | 'bounce';

export const OVERLAY_ANIMATION_LABEL_KEY: Record<OverlayTextAnimationPreset, string> = {
  none: 'video.overlay.animationPreset.none',
  fade: 'video.overlay.animationPreset.fade',
  'slide-up': 'video.overlay.animationPreset.slideUp',
  'slide-down': 'video.overlay.animationPreset.slideDown',
  'slide-left': 'video.overlay.animationPreset.slideLeft',
  'slide-right': 'video.overlay.animationPreset.slideRight',
  pop: 'video.overlay.animationPreset.pop',
  typewriter: 'video.overlay.animationPreset.typewriter',
  bounce: 'video.overlay.animationPreset.bounce',
};

export const OVERLAY_ANIMATION_OPTIONS: OverlayTextAnimationPreset[] = [
  'fade',
  'slide-up',
  'slide-down',
  'slide-left',
  'slide-right',
  'pop',
  'bounce',
  'typewriter',
  'none',
];

export type MxmRenderMode = 'ai-video-gen' | 'static-image' | 'gsap-html-animation';

/** 分镜/审核 UI 可选的两种画面类型 */
export const ACTIVE_RENDER_MODES: MxmRenderMode[] = ['static-image', 'ai-video-gen'];

export type MxmVideoMode = 'text-to-video' | 'image-to-video' | 'reference-to-video';

/** 静态图在画面中的适配方式（对应 CSS object-fit） */
export type MxmImageFit = 'cover' | 'contain' | 'fill' | 'none';

/** 静态图 Ken Burns 动效（仅图片） */
export type MxmImageMotion =
  | 'none'
  | 'zoom-in'
  | 'zoom-out'
  | 'pan-left'
  | 'pan-right'
  | 'pan-up'
  | 'pan-down';

export interface MxmClipMetadata {
  mxmRenderMode?: MxmRenderMode;
  /** Seedance 生视频专用 */
  mxmVideoPrompt?: string;
  /** gpt-image / nano-banana 等生图核心内容 */
  mxmImagePrompt?: string;
  /** @deprecated 兼容旧数据；优先用 mxmVideoPrompt / mxmImagePrompt */
  mxmPrompt?: string;
  mxmDuration?: number;
  mxmRatio?: '16:9' | '9:16' | '1:1';
  mxmSourceImageUrl?: string;
  mxmSourceAssetId?: string;
  /** 用户手动选用的视频素材 URL */
  mxmSourceVideoUrl?: string;
  mxmImageFit?: MxmImageFit;
  /** 是否启用 Ken Burns 动效（默认 false） */
  mxmImageMotionEnabled?: boolean;
  mxmImageMotion?: MxmImageMotion;
  /** 无手动插图时自动从图库配图（默认 true） */
  mxmAutoStockImage?: boolean;
  /** 无手动插图时自动从视频素材库配视频（默认 false；开启时优先于配图） */
  mxmAutoStockVideo?: boolean;
  /** 自动配图/配视频的检索词 */
  mxmStockSearchQuery?: string;
  /** 本段英文关键词（含核心实体/专名），供检索归一化与结果相关性重排 */
  mxmStockKeywords?: string[];
  mxmHtmlContent?: string;
  mxmGsapTimeline?: string;
  mxmGsapEase?: string;
  mxmGsapSceneBrief?: string;
  mxmGsapStyleId?: string;
  mxmGsapSceneType?: string;
  mxmGsapSceneData?: Record<string, unknown>;
  mxmUserEdited?: boolean;
  mxmVideoMode?: MxmVideoMode;
  mxmReferenceImages?: string[];
  /** Seedance 参考素材（图/视频 + 描述） */
  mxmReferenceAssets?: Array<{
    content: string;
    purpose?: string;
    type?: string;
    mediaKind?: 'image' | 'video';
  }>;
  /** generator 业务 taskKey（默认 generator） */
  mxmVideoTaskKey?: string;
  /** generator 业务 subtype（默认 fragment） */
  mxmVideoSubtype?: string;
  mxmFragmentRole?: 'opening' | 'outro' | 'transition' | 'bumper' | 'overlay' | 'broll';
  /** 语篇角色（A0 确定性产出）：opening 开场白 | transition 章节转场 | body | closing 结尾 */
  mxmBeatRole?: 'opening' | 'transition' | 'body' | 'closing';
  mxmVisualStyle?: string;
  mxmMotionIntensity?: 'subtle' | 'moderate' | 'dynamic';
  mxmBackgroundMode?: 'dark_clean' | 'light_clean' | 'gradient_brand' | 'blur_extend' | 'full_scene';
  mxmGlobalTopic?: string;
  mxmVoiceoverText?: string;
  mxmEditStyle?: string;
  /** AI 镜头输出：video=Seedance 视频；image=graph 配图 + Ken Burns */
  mxmAiOutputKind?: 'video' | 'image';
  mxmGraphTaskKey?: string;
  mxmGraphSubtype?: string;
  mxmAiGeneratedImageUrl?: string;
  /** 独立 AI 生成子任务 id（列表可预览） */
  mxmAiGenTaskId?: string;
  /** 后端渲染产物 mp4（成片审核阶段预览） */
  mxmRenderedVideoUrl?: string;
  mxmRenderStatus?: 'pending' | 'rendering' | 'ready' | 'failed';
  mxmRenderError?: string;
}

export type VideoGeneratorOption = {
  taskKey: string;
  subtype: string | null;
  label: string;
  businessType: string;
};

export function formatGeneratorRouteValue(taskKey?: string, subtype?: string | null): string {
  const tk = taskKey?.trim() || 'generator';
  const sub = subtype?.trim() || 'fragment';
  return `${tk}/${sub}`;
}

export function parseGeneratorRouteValue(value: string): { taskKey: string; subtype: string | null } {
  const [taskKey, ...rest] = value.split('/');
  const subtype = rest.join('/') || 'fragment';
  return { taskKey: taskKey || 'generator', subtype: subtype || null };
}

export interface TimelineClip {
  id: string;
  mediaId?: string;
  trackId?: string;
  startTime: number;
  duration: number;
  type?: string;
  /** 0–1，与 OpenReel Clip.volume 对齐 */
  volume?: number;
  fade?: { fadeIn: number; fadeOut: number };
  metadata?: MxmClipMetadata;
}

export interface TimelineSubtitle {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
}

/** 时间轴上被选中的块（决定右侧检查器展示哪种配置） */
export type TimelineSelectionKind = 'visual' | 'audio' | 'subtitle' | 'overlay';

export interface TimelineSelection {
  kind: TimelineSelectionKind;
  id: string;
  /** kind === 'audio' 时区分语音轨 / 背景音乐轨 */
  audioRole?: 'voice' | 'bgm';
}

/** 语音轨仅有前置直链、无独立 clip 时的合成块 id */
export const AUDIO_PREVIEW_CLIP_ID = '__audio_preview__';
export const BGM_PREVIEW_CLIP_ID = '__bgm_preview__';
export const VOICE_AUDIO_TRACK_ID = 'track-audio-voiceover';
export const BGM_AUDIO_TRACK_ID = 'track-audio-bgm';

export interface VoiceoverSubtitleSegment {
  text: string;
  startSeconds: number;
  endSeconds: number;
}

export interface TimelineTrack {
  id?: string;
  type: 'video' | 'audio' | 'image' | 'text' | 'graphics' | string;
  name?: string;
  muted?: boolean;
  clips: TimelineClip[];
  transitions?: TimelineTransition[];
}

export const TRANSITION_TYPE_LABEL_KEY: Record<string, string> = {
  crossfade: 'video.transition.crossfade',
  dipToBlack: 'video.transition.dipToBlack',
  dipToWhite: 'video.transition.dipToWhite',
  wipe: 'video.transition.wipe',
  slide: 'video.transition.slide',
  zoom: 'video.transition.zoom',
  push: 'video.transition.push',
};

export const TRANSITION_TYPE_OPTIONS = [
  'crossfade',
  'dipToBlack',
  'dipToWhite',
  'wipe',
  'slide',
  'zoom',
  'push',
] as const;

export interface TimelineTransition {
  id: string;
  clipAId: string;
  clipBId: string;
  type: string;
  duration: number;
}

export interface VideoEditScript {
  version: string;
  project: {
    id: string;
    name: string;
    settings: { width: number; height: number; frameRate: number };
    textClips?: TextClip[];
    timeline: {
      tracks: TimelineTrack[];
      duration: number;
      subtitles?: TimelineSubtitle[];
    };
  };
}

export const RENDER_MODE_LABEL_KEY: Record<MxmRenderMode, string> = {
  'ai-video-gen': 'video.renderMode.aiVideoGen',
  'static-image': 'video.renderMode.staticImage',
  'gsap-html-animation': 'video.renderMode.gsapLegacy',
};

export const RENDER_MODE_COLOR: Record<MxmRenderMode, string> = {
  'ai-video-gen': '#0ea5e9',
  'static-image': '#22c55e',
  'gsap-html-animation': '#22c55e',
};

export const VIDEO_MODE_LABEL_KEY: Record<MxmVideoMode, string> = {
  'text-to-video': 'video.videoMode.textToVideo',
  'image-to-video': 'video.videoMode.imageToVideo',
  'reference-to-video': 'video.videoMode.referenceToVideo',
};

export const IMAGE_FIT_LABEL_KEY: Record<MxmImageFit, string> = {
  cover: 'video.imageFit.cover',
  contain: 'video.imageFit.contain',
  fill: 'video.imageFit.fill',
  none: 'video.imageFit.none',
};

export const DEFAULT_IMAGE_FIT: MxmImageFit = 'cover';
export const DEFAULT_IMAGE_MOTION: MxmImageMotion = 'none';

/** 启用动效后可选的类型（不含「无动效」） */
export const IMAGE_MOTION_OPTIONS: MxmImageMotion[] = [
  'zoom-in',
  'zoom-out',
  'pan-left',
  'pan-right',
  'pan-up',
  'pan-down',
];

export const IMAGE_MOTION_LABEL_KEY: Record<MxmImageMotion, string> = {
  none: 'video.imageMotion.none',
  'zoom-in': 'video.imageMotion.zoomIn',
  'zoom-out': 'video.imageMotion.zoomOut',
  'pan-left': 'video.imageMotion.panLeft',
  'pan-right': 'video.imageMotion.panRight',
  'pan-up': 'video.imageMotion.panUp',
  'pan-down': 'video.imageMotion.panDown',
};

export const DEFAULT_AUTO_STOCK_IMAGE = true;
export const DEFAULT_AUTO_STOCK_VIDEO = false;

export function isAutoStockImageEnabled(meta?: MxmClipMetadata): boolean {
  return meta?.mxmAutoStockImage !== false;
}

export function isAutoStockVideoEnabled(meta?: MxmClipMetadata): boolean {
  return meta?.mxmAutoStockVideo === true;
}

export function isImageMotionEnabled(meta?: MxmClipMetadata): boolean {
  return meta?.mxmImageMotionEnabled !== false;
}

/** 预览/导出实际动效：未启用或未选类型时为 none */
export function resolveClipImageMotion(meta?: MxmClipMetadata): MxmImageMotion {
  if (!isImageMotionEnabled(meta)) return 'none';
  const motion = meta?.mxmImageMotion;
  if (!motion || motion === 'none') return 'zoom-in';
  return motion;
}

export { buildStockSearchQuery, resolveClipSubtitleSearchContext } from './stockSearchQuery';
export type { StockSearchQueryInput } from './stockSearchQuery';

export const RENDER_STATUS_LABEL_KEY: Record<NonNullable<MxmClipMetadata['mxmRenderStatus']>, string> = {
  pending: 'video.renderStatus.pendingRender',
  rendering: 'video.renderStatus.rendering',
  ready: 'video.renderStatus.done',
  failed: 'video.renderStatus.renderFailed',
};

/** 画幅比例 → CSS aspect-ratio 数值 */
export function ratioToAspect(ratio?: '16:9' | '9:16' | '1:1'): number {
  if (ratio === '9:16') return 9 / 16;
  if (ratio === '1:1') return 1;
  return 16 / 9;
}

export const TRACK_TYPE_LABEL_KEY: Record<string, string> = {
  video: 'video.trackType.video',
  audio: 'video.trackType.audio',
  image: 'video.trackType.image',
  text: 'video.trackType.text',
  graphics: 'video.trackType.graphics',
  subtitle: 'video.trackType.subtitle',
};
