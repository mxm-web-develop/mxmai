/**
 * YouTube / B站风格文字叠加预设（生成侧默认）
 * 开场/结尾对齐热门知识解说类布局：冷开场大标题卡 + 结束卡 CTA
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
  | 'bottom-right'
  /** 开场主标题：略偏上，避开正中与字幕带（类 YT cold open / B站封面字） */
  | 'title-hero'
  /** 开场副标题：主标题下方一行较小字 */
  | 'title-sub'
  /** 结尾 CTA：字幕带上方的 end-card 区 */
  | 'end-card';

export type OverlayStylePresetId =
  | 'yt-headline'
  | 'bili-keyword'
  | 'chapter-title'
  | 'lower-third'
  | 'price-tag'
  | 'soft-caption'
  | 'title-card'
  | 'chapter-cover'
  | 'keyword-pop'
  | 'fact-card'
  | 'chapter-progress'
  | 'outro-cta'
  /** 开场节目角标（小字，顶栏） */
  | 'show-badge';

/** shot-list 用 role 枚举 → 自动映射到具体 preset + 位置 */
export type OverlayLayerRole =
  | 'chapter-cover'
  | 'keyword-pop'
  | 'fact-card'
  | 'lower-third'
  | 'title-card'
  | 'outro-cta'
  | 'chapter-progress'
  | 'show-badge';

export type OverlayEmphasis = 'soft' | 'normal' | 'hot';

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
  // YouTube/B站封面字：中上三分之一，不压正中脸/主体
  'title-hero': { x: 0.5, y: 0.36 },
  // 副标题贴在主标题下方
  'title-sub': { x: 0.5, y: 0.48 },
  // 结束卡：明显高于底部硬字幕/安全区
  'end-card': { x: 0.5, y: 0.66 },
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
        shadowOffsetY: 2,
        shadowOffsetX: 0,
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
      });
    /**
     * 开场主标题 — 参考 YT 冷开场 / B站知识区片头字：
     * 白字厚描边、无半透明底（避免糊画面），字号大、字距略开。
     */
    case 'title-card':
      return baseStyle({
        fontSize: 120,
        fontWeight: 900,
        color: '#FFFFFF',
        strokeColor: '#0a0a0a',
        strokeWidth: 7,
        shadowColor: 'rgba(0,0,0,0.9)',
        shadowBlur: 0,
        shadowOffsetX: 5,
        shadowOffsetY: 5,
        backgroundColor: undefined,
        letterSpacing: 2.5,
        lineHeight: 1.12,
      });
    /** 开场节目角标 — 顶栏小 chip，对标频道/系列名露出 */
    case 'show-badge':
      return baseStyle({
        fontSize: 34,
        fontWeight: 700,
        color: '#F8FAFC',
        backgroundColor: 'rgba(15, 23, 42, 0.78)',
        strokeWidth: 0,
        letterSpacing: 2,
        textAlign: 'center',
      });
    case 'chapter-cover':
      return baseStyle({
        fontSize: 92,
        fontWeight: 800,
        color: '#F8FAFC',
        strokeColor: '#020617',
        strokeWidth: 4,
        shadowColor: 'rgba(2,6,23,0.75)',
        shadowBlur: 6,
        shadowOffsetX: 0,
        shadowOffsetY: 3,
        backgroundColor: undefined,
        letterSpacing: 1.5,
      });
    case 'keyword-pop':
      return baseStyle({
        fontSize: 88,
        fontWeight: 900,
        color: '#38BDF8',
        strokeColor: '#0c2233',
        strokeWidth: 4,
        shadowColor: 'rgba(2,6,23,0.65)',
        shadowBlur: 4,
        shadowOffsetX: 0,
        shadowOffsetY: 2,
        letterSpacing: 1,
      });
    case 'fact-card':
      return baseStyle({
        fontSize: 72,
        fontWeight: 800,
        color: '#FB923C',
        strokeColor: '#1c1917',
        strokeWidth: 3,
        shadowColor: 'rgba(0,0,0,0.65)',
        shadowBlur: 4,
        shadowOffsetX: 0,
        shadowOffsetY: 2,
        backgroundColor: 'rgba(15, 23, 42, 0.5)',
        letterSpacing: 0,
      });
    case 'chapter-progress':
      return baseStyle({
        fontSize: 36,
        fontWeight: 700,
        color: '#F8FAFC',
        backgroundColor: 'rgba(15, 23, 42, 0.55)',
        strokeWidth: 0,
        letterSpacing: 2,
      });
    /**
     * 结尾 CTA — 参考 YT end screen / B站「点赞投币」结束卡：
     * 实心底条 + 大字，落在字幕带上方。
     */
    case 'outro-cta':
      return baseStyle({
        fontSize: 68,
        fontWeight: 900,
        color: '#FFFFFF',
        strokeColor: undefined,
        strokeWidth: 0,
        shadowColor: 'rgba(0,0,0,0.55)',
        shadowBlur: 10,
        shadowOffsetX: 0,
        shadowOffsetY: 4,
        backgroundColor: 'rgba(251, 113, 133, 0.92)',
        letterSpacing: 2,
        lineHeight: 1.2,
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

/** shot-list role → preset 默认映射（模型可省略 role 自动套用） */
const ROLE_PRESET_MAP: Record<OverlayLayerRole, OverlayStylePresetId> = {
  'chapter-cover': 'chapter-cover',
  'keyword-pop': 'keyword-pop',
  'fact-card': 'fact-card',
  'lower-third': 'lower-third',
  'title-card': 'title-card',
  'outro-cta': 'outro-cta',
  'chapter-progress': 'chapter-progress',
  'show-badge': 'show-badge',
};

/** role → 默认 layout */
const ROLE_LAYOUT_MAP: Record<OverlayLayerRole, OverlayLayoutId> = {
  'chapter-cover': 'title-hero',
  'keyword-pop': 'center-right',
  'fact-card': 'bottom-center',
  'lower-third': 'bottom-left',
  'chapter-progress': 'top-center',
  'title-card': 'title-hero',
  'outro-cta': 'end-card',
  'show-badge': 'top-center',
};

/** emphasis 给字号 / 描边的临时缩放系数 */
function emphasisAdjust(emphasis: OverlayEmphasis | undefined, fontSize: number): number {
  if (emphasis === 'hot') return Math.round(fontSize * 1.08);
  if (emphasis === 'soft') return Math.round(fontSize * 0.92);
  return fontSize;
}

export type OverlayLayerInput = {
  role: OverlayLayerRole;
  text: string;
  /** 可选覆盖位置：未指定则用 ROLE_LAYOUT_MAP 默认 */
  position?: OverlayLayoutId;
  enterAt: number;
  exitAt: number;
  emphasis?: OverlayEmphasis;
};

/** shot-list 的 overlayLayers[] → (style + layout) 包装，便于 timeline-overlay-builder 直接消费 */
export function styleForOverlayLayer(layer: OverlayLayerInput): {
  preset: OverlayStylePresetId;
  style: TextStyle;
  layout: OverlayLayoutId;
} {
  const preset = ROLE_PRESET_MAP[layer.role];
  const base = styleForOverlayPreset(preset);
  const layout = layer.position ?? ROLE_LAYOUT_MAP[layer.role];
  const fontSize = emphasisAdjust(layer.emphasis, base.fontSize ?? 56);
  return { preset, layout, style: { ...base, fontSize } };
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
      layout: position === 'bottom' ? 'bottom-center' : 'title-hero',
    };
  }
  if (position === 'top') {
    return { style: styleForOverlayPreset('chapter-title'), layout: 'top-center' };
  }
  if (position === 'center') {
    return { style: styleForOverlayPreset('chapter-title'), layout: 'title-hero' };
  }
  return { style: styleForOverlayPreset('lower-third'), layout: 'bottom-left' };
}
