/**
 * YouTube / B站风格文字叠加预设（生成侧默认）
 * 与 web overlayStylePresets 对齐
 */
import type { TextStyle } from '@mxmai/mxm-editor-core/text/types';

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
      });
    case 'lower-third':
      return baseStyle({
        fontSize: 36,
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
      });
    case 'soft-caption':
    default:
      return baseStyle({
        fontSize: 40,
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

/** 生成侧：按文案特征挑默认风格 */
export function pickDefaultOverlayStyle(text: string, position?: string): {
  style: TextStyle;
  layout: OverlayLayoutId;
} {
  const t = text.trim();
  if (/^[¥$€]|^\d[\d,.]*[%万亿]?$/.test(t) || /价格|售价|报价/.test(t)) {
    return { style: styleForOverlayPreset('price-tag'), layout: 'center-right' };
  }
  if (t.length <= 8) {
    return {
      style: styleForOverlayPreset('bili-keyword'),
      layout: position === 'top' ? 'top-right' : 'center-right',
    };
  }
  if (t.length <= 18) {
    return {
      style: styleForOverlayPreset('yt-headline'),
      layout: position === 'bottom' ? 'bottom-center' : 'center',
    };
  }
  if (position === 'top') {
    return { style: styleForOverlayPreset('chapter-title'), layout: 'top-center' };
  }
  if (position === 'center') {
    return { style: styleForOverlayPreset('chapter-title'), layout: 'center' };
  }
  return { style: styleForOverlayPreset('lower-third'), layout: 'bottom-left' };
}
