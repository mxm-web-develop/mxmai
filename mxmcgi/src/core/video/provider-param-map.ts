/**
 * Video 表单参数 → Provider 请求体映射（由 provider_models.protocol 驱动）
 */

import type { ProviderType } from '../providers/types';
import { getByProviderAndModelKey } from '../../models/provider-model-catalog';
import { coerceVideoDuration, getBestSize } from './video-params';

export type VideoProviderProtocol =
  | 'prediction_video'
  | 'deer_video_job'
  | 'openai_video'
  | 'replicate_video'
  | 'openrouter_video'
  | 'unknown';

const RESOLUTION_TO_SIZE: Record<string, string> = {
  '480p': '1280x720',
  '720p': '1280x720',
  '1080p': '1792x1024',
};

export function normalizeVideoProtocol(protocol: string | null | undefined): VideoProviderProtocol {
  const p = String(protocol ?? '').toLowerCase();
  if (!p) return 'unknown';
  if (p.includes('prediction') && (p.includes('video') || p.includes('text-to-video'))) {
    return 'prediction_video';
  }
  if (p.includes('deer') || p.includes('video_job') || p.includes('sora')) {
    return 'deer_video_job';
  }
  if (p.includes('openai') && p.includes('video')) return 'openai_video';
  if (p.includes('openrouter') && p.includes('video')) return 'openrouter_video';
  if (p.includes('replicate') && p.includes('video')) return 'replicate_video';
  if (p === 'prediction_video' || p === 'generate_video') return 'prediction_video';
  return 'unknown';
}

export function getVideoProtocolForModel(
  provider: ProviderType,
  modelKey: string,
): VideoProviderProtocol {
  const row = getByProviderAndModelKey(provider, modelKey);
  if (row?.protocol) {
    const normalized = normalizeVideoProtocol(row.protocol);
    if (normalized !== 'unknown') return normalized;
  }
  if (provider === 'atlascloud') return 'prediction_video';
  if (provider === 'deer') return 'deer_video_job';
  if (provider === 'openrouter') return 'openrouter_video';
  if (provider === 'replicate') return 'replicate_video';
  return 'unknown';
}

/**
 * 将 Task V2 / 业务表单 params 转为 runByModelKey 可用的 GenerateParams 形状
 */
export function mapFormParamsToProviderGenerate(
  protocol: VideoProviderProtocol,
  formParams: Record<string, unknown>,
): {
  prompt: string;
  parameters: Record<string, unknown>;
} {
  const prompt = String(formParams.prompt ?? formParams.video_description ?? '').trim();
  const duration = coerceVideoDuration(
    (formParams.duration ??
      formParams.seconds ??
      formParams.chunk_seconds ??
      formParams.total_duration_seconds) as number | string | undefined,
    8,
  );
  const orientation = formParams.orientation as 'landscape' | 'portrait' | undefined;
  const size =
    typeof formParams.size === 'string' && formParams.size.trim()
      ? String(formParams.size).trim()
      : getBestSize(orientation);
  const resolution =
    typeof formParams.resolution === 'string' ? String(formParams.resolution).trim() : undefined;
  const ratio = typeof formParams.ratio === 'string' ? String(formParams.ratio).trim() : undefined;
  const inputRef =
    (typeof formParams.input_reference === 'string' && formParams.input_reference) ||
    (typeof formParams.reference_image_url === 'string' && formParams.reference_image_url) ||
    undefined;
  const refImages = Array.isArray(formParams.reference_images)
    ? (formParams.reference_images as unknown[]).filter(
        (u): u is string => typeof u === 'string' && u.length > 0,
      )
    : inputRef
      ? [inputRef]
      : undefined;
  const generateAudio = formParams.generate_audio;

  const baseParams: Record<string, unknown> = {
    ...(formParams.parameters && typeof formParams.parameters === 'object'
      ? (formParams.parameters as Record<string, unknown>)
      : {}),
  };

  const videoSubtype =
    typeof formParams.videoSubtype === 'string' ? String(formParams.videoSubtype).trim() : undefined;
  const explicitVideoMode =
    typeof formParams.video_mode === 'string'
      ? String(formParams.video_mode).trim()
      : typeof formParams.atlas_video_mode === 'string'
        ? String(formParams.atlas_video_mode).trim()
        : undefined;

  if (protocol === 'prediction_video' || protocol === 'unknown') {
    return {
      prompt,
      parameters: {
        ...baseParams,
        duration,
        ...(resolution ? { resolution } : {}),
        ...(ratio ? { ratio } : {}),
        ...(refImages ? { reference_images: refImages } : {}),
        ...(inputRef ? { input_reference: inputRef } : {}),
        ...(generateAudio != null ? { generate_audio: generateAudio } : {}),
        // Atlas generateVideo 使用 resolution + ratio，勿传 size（易被解析为非法 width）
        ...(videoSubtype ? { videoSubtype } : {}),
        ...(explicitVideoMode ? { atlas_video_mode: explicitVideoMode } : {}),
      },
    };
  }

  if (protocol === 'deer_video_job') {
    const deerSize =
      resolution && RESOLUTION_TO_SIZE[resolution]
        ? RESOLUTION_TO_SIZE[resolution]
        : size;
    return {
      prompt,
      parameters: {
        ...baseParams,
        seconds: String(duration),
        size: deerSize,
        ...(inputRef ? { input_reference: inputRef } : {}),
        ...(refImages && refImages.length > 1 ? { reference_images: refImages } : {}),
        ...(formParams.character_url ? { character_url: formParams.character_url } : {}),
        ...(formParams.character_timestamps
          ? { character_timestamps: formParams.character_timestamps }
          : {}),
      },
    };
  }

  if (protocol === 'openrouter_video') {
    return {
      prompt,
      parameters: {
        ...baseParams,
        duration,
        ...(resolution ? { resolution } : {}),
        ...(size ? { size } : {}),
        ...(generateAudio != null ? { generate_audio: generateAudio } : {}),
        ...(refImages ? { reference_images: refImages } : {}),
        ...(inputRef ? { input_reference: inputRef } : {}),
      },
    };
  }

  return {
    prompt,
    parameters: {
      ...baseParams,
      duration,
      seconds: String(duration),
      size,
      ...(resolution ? { resolution } : {}),
      ...(ratio ? { ratio } : {}),
      ...(inputRef ? { input_reference: inputRef } : {}),
      ...(refImages ? { reference_images: refImages } : {}),
    },
  };
}
