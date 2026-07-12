import type { MxmRenderMode } from './types';
import type { SegmentOverlaySpec, SegmentTransitionSpec } from './timeline-overlay-types';

/** 分镜 builder 统一的「一段可视内容」抽象（各 segmentStrategy 产出） */
export type TimelineVisualSegment = {
  startSeconds: number;
  endSeconds: number;
  text: string;
  mxmRenderMode?: MxmRenderMode;
  /** OpenReel 文字/模板 overlay（叠在基底素材或 AI 视频上） */
  overlays?: SegmentOverlaySpec[];
  /** 与下一段之间的转场（OpenReel Transition） */
  transition?: SegmentTransitionSpec;
  /** ai-video-gen：视频生成 prompt（英文） */
  mxmPrompt?: string;
  /** ai-video-gen：text-to-video | image-to-video | reference-to-video */
  mxmVideoMode?: 'text-to-video' | 'image-to-video' | 'reference-to-video';
  /** static-image（素材引用）：图库/视频素材库检索词 */
  mxmStockSearchQuery?: string;
  mxmSourceImageUrl?: string;
  /** @deprecated 遗留 GSAP 段；构建时转为 overlays */
  mxmGsapSceneBrief?: string;
  mxmGsapStyleId?: string;
  mxmGsapSceneType?: string;
  mxmGsapSceneData?: Record<string, unknown>;
  /** 该段对应口播原文（shot-list voiceover_text，供语义参考） */
  mxmVoiceoverText?: string;
  /** shot-list global_keywords / 段级 keywords */
  keywords?: string[];
  /** ai-video-gen → resource/fragment 片段用途 */
  mxmFragmentRole?: 'opening' | 'outro' | 'transition' | 'bumper' | 'overlay' | 'broll';
  /** 语篇角色（A0 确定性产出）：opening 开场白 | transition 章节转场 | body | closing 结尾 */
  mxmBeatRole?: 'opening' | 'transition' | 'body' | 'closing';
  /** ai-video-gen 选用的 generator 业务 taskKey（默认 generator） */
  mxmVideoTaskKey?: string;
  /** ai-video-gen 选用的 generator 业务 subtype（默认 fragment） */
  mxmVideoSubtype?: string;
  mxmVisualStyle?: string;
  mxmMotionIntensity?: 'subtle' | 'moderate' | 'dynamic';
  mxmBackgroundMode?: 'dark_clean' | 'light_clean' | 'gradient_brand' | 'blur_extend' | 'full_scene';
};

export type VoiceoverSubtitleLike = {
  text: string;
  startSeconds: number;
  endSeconds: number;
};
