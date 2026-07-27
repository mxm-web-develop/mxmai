/**
 * 人工审核弹窗：面向用户的文案（过滤后端/配置内部术语）
 */

import i18n from '../i18n/config';

const INTERNAL_HINT_PATTERNS: Array<{ pattern: RegExp; replacementKey: string }> = [
  { pattern: /mxmRenderMode/gi, replacementKey: 'common.manualReview.sanitizeVisualMode' },
  { pattern: /PEXELS_API_KEY/gi, replacementKey: '' },
  { pattern: /（需服务端配置[^）]*）/g, replacementKey: '' },
  { pattern: /需服务端配置[^。；\n]*/g, replacementKey: '' },
  { pattern: /Pexels\s*视频素材/gi, replacementKey: 'common.manualReview.sanitizeStockLibrary' },
  { pattern: /OpenReel\s*ProjectFile[^。；\n]*/gi, replacementKey: '' },
  { pattern: /VideoTimelineReviewModal/gi, replacementKey: '' },
  { pattern: /\s{2,}/g, replacementKey: ' ' },
];

export function sanitizeReviewHint(raw?: string | null): string | undefined {
  if (!raw?.trim()) return undefined;
  let text = raw.trim();
  for (const { pattern, replacementKey } of INTERNAL_HINT_PATTERNS) {
    const replacement =
      replacementKey === ' '
        ? ' '
        : replacementKey
          ? i18n.t(replacementKey)
          : '';
    text = text.replace(pattern, replacement);
  }
  text = text.replace(/[，。；]\s*[，。；]+/g, '。').trim();
  return text || undefined;
}

export function resolveTimelineReviewHint(options: {
  hint?: string;
  draftHint?: string;
  gateHint?: string;
  isRenderedReview?: boolean;
}): string {
  const sanitized =
    sanitizeReviewHint(options.hint) ??
    sanitizeReviewHint(options.draftHint) ??
    sanitizeReviewHint(options.gateHint);

  if (sanitized) return sanitized;

  if (options.isRenderedReview) {
    return i18n.t('video.manualReview.timelineRenderedHint');
  }

  return i18n.t('video.manualReview.timelineStoryboardHint');
}

function inspectorTip(key: keyof typeof INSPECTOR_TIP_KEYS): string {
  return i18n.t(INSPECTOR_TIP_KEYS[key]);
}

const INSPECTOR_TIP_KEYS = {
  clipEmpty: 'video.manualReview.inspectorTips.clipEmpty',
  visualMode: 'video.manualReview.inspectorTips.visualMode',
  refineOverlay: 'video.manualReview.inspectorTips.refineOverlay',
  refineTransition: 'video.manualReview.inspectorTips.refineTransition',
  duration: 'video.manualReview.inspectorTips.duration',
  stockQuery: 'video.manualReview.inspectorTips.stockQuery',
  autoStockImage: 'video.manualReview.inspectorTips.autoStockImage',
  autoStockVideo: 'video.manualReview.inspectorTips.autoStockVideo',
  stockManualPick: 'video.manualReview.inspectorTips.stockManualPick',
  imageFit: 'video.manualReview.inspectorTips.imageFit',
  imageMotion: 'video.manualReview.inspectorTips.imageMotion',
  gsapBrief: 'video.manualReview.inspectorTips.gsapBrief',
  subtitleEdit: 'video.manualReview.inspectorTips.subtitleEdit',
  voiceAudio: 'video.manualReview.inspectorTips.voiceAudio',
  bgmAudio: 'video.manualReview.inspectorTips.bgmAudio',
  voiceover: 'video.manualReview.inspectorTips.voiceover',
  renderedDelta: 'video.manualReview.inspectorTips.renderedDelta',
  segmentSubtitles: 'video.manualReview.inspectorTips.segmentSubtitles',
} as const;

export const INSPECTOR_TIPS = {
  get clipEmpty() {
    return inspectorTip('clipEmpty');
  },
  get visualMode() {
    return inspectorTip('visualMode');
  },
  get refineOverlay() {
    return inspectorTip('refineOverlay');
  },
  get refineTransition() {
    return inspectorTip('refineTransition');
  },
  get duration() {
    return inspectorTip('duration');
  },
  get stockQuery() {
    return inspectorTip('stockQuery');
  },
  get autoStockImage() {
    return inspectorTip('autoStockImage');
  },
  get autoStockVideo() {
    return inspectorTip('autoStockVideo');
  },
  get stockManualPick() {
    return inspectorTip('stockManualPick');
  },
  get imageFit() {
    return inspectorTip('imageFit');
  },
  get imageMotion() {
    return inspectorTip('imageMotion');
  },
  get gsapBrief() {
    return inspectorTip('gsapBrief');
  },
  get subtitleEdit() {
    return inspectorTip('subtitleEdit');
  },
  get voiceAudio() {
    return inspectorTip('voiceAudio');
  },
  get bgmAudio() {
    return inspectorTip('bgmAudio');
  },
  get voiceover() {
    return inspectorTip('voiceover');
  },
  get renderedDelta() {
    return inspectorTip('renderedDelta');
  },
  get segmentSubtitles() {
    return inspectorTip('segmentSubtitles');
  },
} as const;
