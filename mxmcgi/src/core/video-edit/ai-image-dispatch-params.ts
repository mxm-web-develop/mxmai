/**
 * ai-video-gen + mxmAiOutputKind=image → graph 配图子任务入参
 */
import type { MxmClipMetadata } from './types';
import { normalizeReferenceAssets } from './reference-media-assets';
import { resolveAiImagePrompt } from './ai-prompt-fields';

function mapRatioToAspect(ratio?: string): string {
  switch (ratio) {
    case '9:16':
      return '9:16';
    case '1:1':
      return '1:1';
    default:
      return '16:9';
  }
}

function mapEditStyleToIllustrationStyle(editStyle?: string): string {
  switch (editStyle?.trim()) {
    case 'science-minimal':
      return 'explain_visual';
    case 'documentary':
      return 'documentary_portrait';
    case 'motion-infographic':
      return 'explain_visual';
    case 'classroom':
      return 'warm_narrative';
    case 'cinematic':
      return 'cinematic_keyframe';
    default:
      return 'stylized_illustration';
  }
}

export type BuildAiImageParamsContext = {
  globalTopic?: string;
  editStyle?: string;
};

/** graph/design/content-illustration 等配图业务 params */
export function buildAiImageDispatchParams(
  meta: MxmClipMetadata,
  clipId: string,
  ctx?: BuildAiImageParamsContext
): Record<string, unknown> {
  const globalTopic = (meta.mxmGlobalTopic ?? ctx?.globalTopic ?? '').trim();
  const voiceover = meta.mxmVoiceoverText?.trim() ?? '';
  const prompt = resolveAiImagePrompt(meta);
  const coreContent =
    prompt ||
    voiceover ||
    globalTopic ||
    'Visual illustration for video segment';

  const referenceAssets = normalizeReferenceAssets(meta);
  const styleRefImages = referenceAssets
    .filter((a) => a.mediaKind !== 'video')
    .map((a) => a.content)
    .filter(Boolean);

  const editStyle = meta.mxmEditStyle ?? ctx?.editStyle;

  return {
    source: 'video-edit-pipeline',
    clip_id: clipId,
    core_content: coreContent,
    usage_context: 'video_embed',
    aspect_ratio: mapRatioToAspect(meta.mxmRatio),
    illustration_style: mapEditStyleToIllustrationStyle(editStyle),
    flat_visual_tone: mapEditStyleToIllustrationStyle(editStyle),
    prompt: [
      globalTopic ? `Global topic: ${globalTopic}` : '',
      voiceover ? `Voiceover context: ${voiceover}` : '',
      prompt,
    ]
      .filter(Boolean)
      .join('\n'),
    style_ref_images: styleRefImages,
    label: `mxm-ai-image-${clipId}`,
    uid: `mxm-ai-image-${clipId}`,
  };
}
