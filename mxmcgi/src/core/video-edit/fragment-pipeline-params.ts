/**
 * 自动剪辑 ai-video-gen → video/resource/fragment 入参映射
 */
import type { MxmClipMetadata } from './types';
import {
  buildReferencePurposeSuffix,
  mapReferenceAssetsToVideoParams,
  normalizeReferenceAssets,
  resolveVideoModeFromReferenceAssets,
} from './reference-media-assets';
import { resolveAiVideoPrompt } from './ai-prompt-fields';

export type FragmentVisualStyle =
  | 'motion_graphics'
  | 'cinematic'
  | 'neon_cyber'
  | 'minimal_clean'
  | 'retro_vhs'
  | 'anime_pop'
  | '3d_clay';

export type FragmentRole =
  | 'opening'
  | 'outro'
  | 'transition'
  | 'bumper'
  | 'overlay'
  | 'broll';

export type FragmentMotionIntensity = 'subtle' | 'moderate' | 'dynamic';
export type FragmentBackgroundMode =
  | 'dark_clean'
  | 'light_clean'
  | 'gradient_brand'
  | 'blur_extend'
  | 'full_scene';

const EDIT_STYLE_TO_VISUAL: Record<string, FragmentVisualStyle> = {
  'science-minimal': 'minimal_clean',
  documentary: 'cinematic',
  'motion-infographic': 'motion_graphics',
  classroom: 'minimal_clean',
};

const EDIT_STYLE_TO_MOTION: Record<string, FragmentMotionIntensity> = {
  'science-minimal': 'subtle',
  documentary: 'moderate',
  'motion-infographic': 'dynamic',
  classroom: 'subtle',
};

const EDIT_STYLE_TO_BACKGROUND: Record<string, FragmentBackgroundMode> = {
  'science-minimal': 'dark_clean',
  documentary: 'full_scene',
  'motion-infographic': 'dark_clean',
  classroom: 'light_clean',
};

export function mapAspectRatioToPlatformPreset(ratio: string): string {
  switch (ratio) {
    case '9:16':
      return 'douyin_9_16';
    case '1:1':
      return 'square_1_1';
    default:
      return 'bilibili_16_9';
  }
}

export function mapEditStyleToVisualStyle(editStyle?: string): FragmentVisualStyle {
  const key = editStyle?.trim();
  if (key && EDIT_STYLE_TO_VISUAL[key]) return EDIT_STYLE_TO_VISUAL[key]!;
  return 'cinematic';
}

export function mapEditStyleToMotionIntensity(editStyle?: string): FragmentMotionIntensity {
  const key = editStyle?.trim();
  if (key && EDIT_STYLE_TO_MOTION[key]) return EDIT_STYLE_TO_MOTION[key]!;
  return 'moderate';
}

export function mapEditStyleToBackgroundMode(editStyle?: string): FragmentBackgroundMode {
  const key = editStyle?.trim();
  if (key && EDIT_STYLE_TO_BACKGROUND[key]) return EDIT_STYLE_TO_BACKGROUND[key]!;
  return 'full_scene';
}

export type BuildFragmentParamsContext = {
  globalTopic?: string;
  editStyle?: string;
};

/** 自动剪辑 dispatcher → resource/fragment 完整表单 params */
export function buildFragmentParamsFromClipMetadata(
  meta: MxmClipMetadata,
  jobDuration: number,
  clipId: string,
  ctx?: BuildFragmentParamsContext
): Record<string, unknown> {
  const referenceAssets = normalizeReferenceAssets(meta);
  const videoMode =
    meta.mxmVideoMode ?? resolveVideoModeFromReferenceAssets(referenceAssets);

  const ratio = meta.mxmRatio ?? '16:9';
  const durationSec = Math.min(15, Math.max(1, Math.round(jobDuration)));
  const editStyle = meta.mxmEditStyle ?? ctx?.editStyle;
  const globalTopic = (meta.mxmGlobalTopic ?? ctx?.globalTopic ?? '').trim();
  const voiceover = meta.mxmVoiceoverText?.trim() ?? '';
  let englishPrompt = resolveAiVideoPrompt(meta);
  const purposeSuffix = buildReferencePurposeSuffix(referenceAssets);
  if (purposeSuffix) {
    englishPrompt = englishPrompt
      ? `${englishPrompt}\n\nReference notes: ${purposeSuffix}`
      : `Reference notes: ${purposeSuffix}`;
  }

  const { reference_images, reference_videos } = mapReferenceAssetsToVideoParams(referenceAssets);

  const params: Record<string, unknown> = {
    source: 'video-edit-pipeline',
    fragment_role: meta.mxmFragmentRole ?? 'broll',
    platform_preset: mapAspectRatioToPlatformPreset(ratio),
    ratio,
    edit_style: editStyle ?? '',
    visual_style: meta.mxmVisualStyle ?? mapEditStyleToVisualStyle(editStyle),
    motion_intensity: meta.mxmMotionIntensity ?? mapEditStyleToMotionIntensity(editStyle),
    background_mode: meta.mxmBackgroundMode ?? mapEditStyleToBackgroundMode(editStyle),
    global_topic: globalTopic,
    voiceover_context: voiceover,
    clip_id: clipId,
    prompt: englishPrompt,
    duration: durationSec,
    total_duration_seconds: durationSec,
    resolution: meta.mxmResolution ?? '720p',
    atlas_video_mode: videoMode,
    generate_audio: meta.mxmGenerateAudio ?? false,
    reference_images,
    label: `mxm-ai-video-${clipId}`,
  };

  if (reference_videos.length > 0) {
    params.reference_videos = reference_videos;
  }

  if (videoMode === 'image-to-video') {
    const firstImage = referenceAssets.find((a) => a.mediaKind !== 'video')?.content;
    if (firstImage) {
      params.input_reference = firstImage;
      params.reference_image_url = firstImage;
      params.image = firstImage;
    }
  }

  return params;
}
