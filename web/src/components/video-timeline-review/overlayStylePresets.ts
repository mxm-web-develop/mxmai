/**
 * YouTube / B站风格文字叠加预设 — 对齐 OpenReel TextStyle + Transform
 */
import type { TextClip, TextStyle } from '@mxmai/mxm-editor-core/text/types';
import type { OverlayTextAnimationPreset } from './types';

export type OverlayLayoutId =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'center-left'
  | 'center'
  | 'center-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export type OverlayStylePresetId =
  | 'yt-headline'
  | 'bili-keyword'
  | 'chapter-title'
  | 'lower-third'
  | 'price-tag'
  | 'soft-caption';

export const OVERLAY_LAYOUT_LABEL_KEY: Record<OverlayLayoutId, string> = {
  'top-left': 'video.overlay.layoutPreset.topLeft',
  'top-center': 'video.overlay.layoutPreset.topCenter',
  'top-right': 'video.overlay.layoutPreset.topRight',
  'center-left': 'video.overlay.layoutPreset.centerLeft',
  center: 'video.overlay.layoutPreset.center',
  'center-right': 'video.overlay.layoutPreset.centerRight',
  'bottom-left': 'video.overlay.layoutPreset.bottomLeft',
  'bottom-center': 'video.overlay.layoutPreset.bottomCenter',
  'bottom-right': 'video.overlay.layoutPreset.bottomRight',
};

export const OVERLAY_LAYOUT_OPTIONS: OverlayLayoutId[] = [
  'top-left',
  'top-center',
  'top-right',
  'center-left',
  'center',
  'center-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
];

export const OVERLAY_STYLE_PRESET_LABEL_KEY: Record<OverlayStylePresetId, string> = {
  'yt-headline': 'video.overlay.stylePreset.ytHeadline',
  'bili-keyword': 'video.overlay.stylePreset.biliKeyword',
  'chapter-title': 'video.overlay.stylePreset.chapterTitle',
  'lower-third': 'video.overlay.stylePreset.lowerThird',
  'price-tag': 'video.overlay.stylePreset.priceTag',
  'soft-caption': 'video.overlay.stylePreset.softCaption',
};

export const OVERLAY_STYLE_PRESET_OPTIONS: OverlayStylePresetId[] = [
  'yt-headline',
  'bili-keyword',
  'chapter-title',
  'lower-third',
  'price-tag',
  'soft-caption',
];

const LAYOUT_POS: Record<OverlayLayoutId, { x: number; y: number }> = {
  'top-left': { x: 0.18, y: 0.12 },
  'top-center': { x: 0.5, y: 0.12 },
  'top-right': { x: 0.82, y: 0.12 },
  'center-left': { x: 0.22, y: 0.48 },
  center: { x: 0.5, y: 0.48 },
  'center-right': { x: 0.78, y: 0.48 },
  'bottom-left': { x: 0.18, y: 0.82 },
  'bottom-center': { x: 0.5, y: 0.82 },
  'bottom-right': { x: 0.82, y: 0.82 },
};

const FONT =
  '"PingFang SC", "Noto Sans SC", "Microsoft YaHei", Inter, system-ui, sans-serif';

function baseStyle(partial: Partial<TextStyle> & Pick<TextStyle, 'fontSize' | 'color'>): TextStyle {
  return {
    fontFamily: FONT,
    fontWeight: 800,
    fontStyle: 'normal',
    textAlign: 'center',
    verticalAlign: 'middle',
    lineHeight: 1.15,
    letterSpacing: 0.5,
    ...partial,
  };
}

/** 预设样式（不含位置） */
export function styleForOverlayPreset(preset: OverlayStylePresetId): TextStyle {
  switch (preset) {
    case 'yt-headline':
      return baseStyle({
        fontSize: 72,
        fontWeight: 900,
        color: '#FACC15',
        strokeColor: '#0a0a0a',
        strokeWidth: 6,
        shadowColor: 'rgba(0,0,0,0.85)',
        shadowBlur: 0,
        shadowOffsetX: 4,
        shadowOffsetY: 4,
        backgroundColor: undefined,
        letterSpacing: 1,
      });
    case 'bili-keyword':
      return baseStyle({
        fontSize: 64,
        fontWeight: 900,
        color: '#FFFFFF',
        strokeColor: '#111827',
        strokeWidth: 5,
        shadowColor: 'rgba(0,0,0,0.75)',
        shadowBlur: 2,
        shadowOffsetX: 3,
        shadowOffsetY: 3,
        backgroundColor: undefined,
        textAlign: 'right',
      });
    case 'chapter-title':
      return baseStyle({
        fontSize: 56,
        fontWeight: 800,
        color: '#F8FAFC',
        strokeColor: '#020617',
        strokeWidth: 3,
        shadowColor: 'rgba(2,6,23,0.7)',
        shadowBlur: 8,
        shadowOffsetX: 0,
        shadowOffsetY: 2,
        backgroundColor: undefined,
      });
    case 'lower-third':
      return baseStyle({
        fontSize: 44,
        fontWeight: 700,
        color: '#F8FAFC',
        backgroundColor: 'rgba(15, 23, 42, 0.72)',
        strokeWidth: 0,
        textAlign: 'left',
        letterSpacing: 0,
      });
    case 'price-tag':
      return baseStyle({
        fontSize: 68,
        fontWeight: 900,
        color: '#FB923C',
        strokeColor: '#1c1917',
        strokeWidth: 5,
        shadowColor: 'rgba(0,0,0,0.8)',
        shadowBlur: 0,
        shadowOffsetX: 3,
        shadowOffsetY: 3,
        backgroundColor: undefined,
      });
    case 'soft-caption':
    default:
      return baseStyle({
        fontSize: 48,
        fontWeight: 700,
        color: '#F8FAFC',
        backgroundColor: 'rgba(15, 23, 42, 0.55)',
        strokeWidth: 0,
        letterSpacing: 0,
      });
  }
}

export function positionForLayout(layout: OverlayLayoutId): { x: number; y: number } {
  return { ...LAYOUT_POS[layout] };
}

export function inferLayoutFromPosition(x: number, y: number): OverlayLayoutId | 'custom' {
  let best: OverlayLayoutId = 'center';
  let bestDist = Infinity;
  for (const id of OVERLAY_LAYOUT_OPTIONS) {
    const p = LAYOUT_POS[id];
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = id;
    }
  }
  return bestDist < 0.012 ? best : 'custom';
}

export function inferStylePreset(style: TextStyle): OverlayStylePresetId | 'custom' {
  const size = style.fontSize;
  const stroke = style.strokeWidth ?? 0;
  const hasBox = Boolean(style.backgroundColor?.trim());
  const color = (style.color ?? '').toLowerCase();

  if (stroke >= 5 && size >= 64 && (color.includes('facc15') || color.includes('yellow'))) {
    return 'yt-headline';
  }
  if (stroke >= 4 && size >= 56 && !hasBox && style.textAlign === 'right') return 'bili-keyword';
  if (stroke >= 4 && size >= 60 && (color.includes('fb923c') || color.includes('f97316'))) {
    return 'price-tag';
  }
  if (stroke >= 2 && size >= 48 && !hasBox) return 'chapter-title';
  if (hasBox && size <= 42 && style.textAlign === 'left') return 'lower-third';
  if (hasBox && stroke < 2) return 'soft-caption';
  return 'custom';
}

export function applyOverlayStylePreset(clip: TextClip, preset: OverlayStylePresetId): TextClip {
  const nextStyle = styleForOverlayPreset(preset);
  const layoutHint: OverlayLayoutId =
    preset === 'bili-keyword'
      ? 'center-right'
      : preset === 'lower-third'
        ? 'bottom-left'
        : preset === 'yt-headline' || preset === 'chapter-title'
          ? 'center'
          : 'bottom-center';
  const pos = positionForLayout(layoutHint);
  return {
    ...clip,
    style: nextStyle,
    transform: {
      ...clip.transform,
      position: pos,
      anchor: { x: 0.5, y: 0.5 },
    },
  };
}

export function buildOverlayAnimation(
  preset: OverlayTextAnimationPreset,
  opts?: { inDuration?: number; outDuration?: number }
): TextClip['animation'] {
  if (preset === 'none') return undefined;
  return {
    preset,
    params: {},
    inDuration: opts?.inDuration ?? (preset === 'typewriter' ? 1.2 : 0.45),
    outDuration: opts?.outDuration ?? 0.35,
    unit: preset === 'typewriter' ? 'character' : 'word',
  };
}

export const OVERLAY_FONT_SIZE_MIN = 28;
export const OVERLAY_FONT_SIZE_MAX = 144;
