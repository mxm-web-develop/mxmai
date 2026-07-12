/**
 * 分镜 overlay 规格 — 对齐 OpenReel text/graphics/editing-template 子集
 * @see mxm-editor-core/src/text/types.ts
 * @see mxm-editor-core/src/editing-templates/types.ts
 */

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

export type OverlayTextPosition = 'top' | 'center' | 'bottom';

/** shot-list segment 上的单条 overlay 描述 */
export type SegmentOverlaySpec = {
  kind: 'text' | 'template';
  /** text overlay 文案 */
  text?: string;
  /** editing-template id（OpenReel built-in） */
  templateId?: string;
  templateControlValues?: Record<string, string | number | boolean>;
  animationPreset?: OverlayTextAnimationPreset;
  position?: OverlayTextPosition;
  /** 相对所属可视片段起点（秒） */
  startOffsetSeconds?: number;
  /** overlay 时长（秒）；缺省 = 片段时长 */
  durationSeconds?: number;
};

/** 相邻可视片段之间的转场（OpenReel Transition） */
export type SegmentTransitionSpec = {
  type: 'crossfade' | 'dipToBlack' | 'dipToWhite' | 'wipe' | 'slide' | 'zoom' | 'push';
  durationSeconds?: number;
};
