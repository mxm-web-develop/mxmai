/**
 * Video Edit — 类型定义
 *
 * 完整继承 OpenReel ProjectFile v1.0.0 数据结构（`@mxmai/mxm-editor-core/types/project`），
 * supermxmai 扩展字段用 `mxm*` 前缀放在 clip.metadata 上。
 *
 * 关联：
 * - OpenReel ProjectFile: `mxm-editor-core/src/storage/project-serializer.ts`（SCHEMA_VERSION='1.0.0'）
 * - OpenReel Project/Track/Clip: `mxm-editor-core/src/types/{project,timeline}.ts`
 * - 三种渲染模式 text 业务: `mxmcgi/src/tasks/examples/text-video-edit-script.business.json`
 * - ManualReviewKind='video-timeline': `mxmcgi/src/tasks/manual-review-types.ts`
 */

import type { ProjectFile } from "@mxmai/mxm-editor-core/storage/project-serializer";
import type { Project } from "@mxmai/mxm-editor-core/types/project";

// ============================================================
// 1. 完整继承 OpenReel ProjectFile
// ============================================================

/**
 * 视频剪辑脚本 = OpenReel ProjectFile v1.0.0
 * 用 ProjectSerializer.exportToJson 输出格式
 */
export type VideoEditScript = ProjectFile;

/**
 * 视频剪辑脚本里的 project 主体
 * 用 OpenReel 完整 Project 数据结构
 */
export type VideoEditProject = Project;

// ============================================================
// 2. supermxmai mxm* 扩展字段
// ============================================================

/**
 * 三种渲染模式（supermxmai 视频业务扩展）
 *
 * 分镜仅使用两种活跃模式：static-image（素材引入）、ai-video-gen（AI 生成）。
 * gsap-html-animation 为遗留值，构建时归并为 static-image + OpenReel textClips overlay。
 */
export type MxmRenderMode =
  | "ai-video-gen"
  | "static-image"
  /** @deprecated 请使用 static-image + project.textClips overlay */
  | "gsap-html-animation";

/**
 * clip.metadata 上 supermxmai 扩展字段（mxm* 前缀）
 */
export interface MxmClipMetadata {
  // ---- 通用 ----
  /** 渲染模式（三选一必填） */
  mxmRenderMode: MxmRenderMode;
  /** 用户在 OpenReel 剪辑器里调整过的标记 */
  mxmUserEdited?: boolean;
  /** 编辑时间戳 */
  mxmEditedAt?: number;

  /** text-to-video 参考图（可选，legacy URL 列表） */
  mxmReferenceImages?: string[];
  /** Seedance 参考素材（图/视频 + 描述，优先于 mxmReferenceImages） */
  mxmReferenceAssets?: Array<{
    content: string;
    purpose?: string;
    type?: string;
    mediaKind?: 'image' | 'video';
  }>;

  // ---- ai-video-gen 公共 ----
  /** supermxmai video 业务 taskKey（默认 'resource'，对应 seedance 子业务） */
  mxmVideoTaskKey?: string;
  /** video 业务 subtype（默认 'fragment'） */
  mxmVideoSubtype?: string;
  /** Atlas Seedance 2.0 三子接口：text-to-video / image-to-video / reference-to-video */
  mxmVideoMode?: "text-to-video" | "image-to-video" | "reference-to-video";
  /**
   * Seedance 等生视频专用英文 prompt（运镜/场景/动作）。
   * 与 mxmImagePrompt 分开，勿混写配图锚点文案。
   */
  mxmVideoPrompt?: string;
  /**
   * gpt-image-2 / nano-banana 等生图专用「核心展示内容」→ graph core_content。
   * 勿写 Seedance 运镜句。
   */
  mxmImagePrompt?: string;
  /**
   * @deprecated 旧分镜共用字段；新产出请用 mxmVideoPrompt / mxmImagePrompt。
   * 读取时：video ← mxmVideoPrompt ?? mxmPrompt；image ← mxmImagePrompt ?? mxmPrompt。
   */
  mxmPrompt?: string;
  /** 视频时长（秒） */
  mxmDuration?: number;
  /** 画幅比例 */
  mxmRatio?: "16:9" | "9:16" | "1:1";
  /** 分辨率 */
  mxmResolution?: "480p" | "720p" | "1080p";
  /** 是否生成原生音轨 */
  mxmGenerateAudio?: boolean;

  /**
   * AI 镜头输出形态（默认 video）
   * - video：走 video/generator/* 生成 MP4
   * - image：走 graph 配图任务生成静图，再 Ken Burns 合成片段 MP4
   */
  mxmAiOutputKind?: 'video' | 'image';
  /** graph 业务 taskKey（image 模式，默认 design） */
  mxmGraphTaskKey?: string;
  /** graph 业务 subtype（image 模式，默认 content-illustration） */
  mxmGraphSubtype?: string;
  /** AI 配图产物 URL（image 模式中间态，渲染 hold 前写入） */
  mxmAiGeneratedImageUrl?: string;
  /** 独立 AI 生成子任务 id（视频/图文列表可预览） */
  mxmAiGenTaskId?: string;

  /** resource/fragment：片段用途（自动剪辑默认 broll） */
  mxmFragmentRole?: 'opening' | 'outro' | 'transition' | 'bumper' | 'overlay' | 'broll';
  /**
   * 语篇角色（A0 确定性产出，贯穿 cut-beat → shot-list → clip）：
   * opening 开场白 | transition 章节转场 | body 正文 | closing 结尾。
   * 用于开场白免横移、章节转场加强等差异化处理。
   */
  mxmBeatRole?: 'opening' | 'transition' | 'body' | 'closing';
  /** resource/fragment：视觉风格枚举 */
  mxmVisualStyle?: string;
  /** resource/fragment：运动强度 */
  mxmMotionIntensity?: 'subtle' | 'moderate' | 'dynamic';
  /** resource/fragment：背景/合成意图 */
  mxmBackgroundMode?: 'dark_clean' | 'light_clean' | 'gradient_brand' | 'blur_extend' | 'full_scene';
  /** 分镜中文描述（shot-list text，供 prompt 补齐） */
  mxmSegmentBrief?: string;
  /** 全片主题（自动剪辑 shot-list global_topic） */
  mxmGlobalTopic?: string;
  /** 本段口播原文（语义参考，勿烧录到画面） */
  mxmVoiceoverText?: string;
  /** 自动剪辑 edit_style（science-minimal 等） */
  mxmEditStyle?: string;

  // ---- static-image 专属 ----
  /** 源图 URL（MinIO / CDN / 虚拟文件夹） */
  mxmSourceImageUrl?: string;
  /** 虚拟文件夹 storage objectId（可选，审核 UI 写入） */
  mxmSourceAssetId?: string;
  /** 库存素材原始外链（转存 MinIO 前），便于排查 */
  mxmStockUpstreamUrl?: string;
  /** 库存素材提供方（openverse / pexels 等） */
  mxmStockProvider?: string;
  /** 库存素材署名 */
  mxmStockAttribution?: string;
  /** 静态图在画面中的适配方式（对应 CSS object-fit / ffmpeg scale+pad+crop），默认 cover */
  mxmImageFit?: "cover" | "contain" | "fill" | "none";
  /** 是否启用静态图 Ken Burns 动效（默认 true，用户可关闭） */
  mxmImageMotionEnabled?: boolean;
  /** 静态图 Ken Burns 动效类型（仅 mxmImageMotionEnabled=true 且为图片时生效） */
  mxmImageMotion?: "none" | "zoom-in" | "zoom-out" | "pan-left" | "pan-right" | "pan-up" | "pan-down";
  /** 用户手动选用的视频素材 URL（Pexels / 资产库） */
  mxmSourceVideoUrl?: string;
  /** 无手动插图时自动从图库配图（默认 true） */
  mxmAutoStockImage?: boolean;
  /** 无手动插图时自动从视频素材库配视频（默认 false；开启时优先于配图） */
  mxmAutoStockVideo?: boolean;
  /** 自动配图/配视频的检索词（优先本字段；勿用视频/生图长 prompt） */
  mxmStockSearchQuery?: string;
  /** 本段英文关键词（含核心实体/专名），供检索归一化与结果相关性重排 */
  mxmStockKeywords?: string[];
  /** 源图来自哪个 graph 任务 taskId */
  mxmSourceImageTaskId?: string;
  /** GSAP 段一句话描述（主脚本生成，审核时可触发 gsap-scene 子业务） */
  mxmGsapSceneBrief?: string;
  /** GSAP 内置风格包 */
  mxmGsapStyleId?: string;
  /** GSAP scene template type */
  mxmGsapSceneType?: string;
  /** scene template data */
  mxmGsapSceneData?: Record<string, unknown>;
  /** 分镜 storyboard JSON（多 scene 组装结果） */
  mxmStoryboard?: unknown;

  // ---- gsap-html-animation 专属 ----
  /** HTML 源码（data-composition-id / data-width / data-height + 实际内容） */
  mxmHtmlContent?: string;
  /** GSAP timeline 代码 */
  mxmGsapTimeline?: string;
  /** GSAP 全局 easing（默认 power3.out） */
  mxmGsapEase?: string;
  /** 设计引用（DESIGN.md#anchor） */
  mxmDesignRef?: string;
  /** 渲染帧率（默认 30） */
  mxmRenderFps?: number;
  /** 渲染 pixel ratio（默认 1） */
  mxmRenderPixelRatio?: number;

  // ---- 渲染产物（dispatcher 写入） ----
  /** 后端渲染产物的 mp4 URL */
  mxmRenderedVideoUrl?: string;
  /** 渲染耗时（毫秒） */
  mxmRenderDurationMs?: number;
  /** 渲染状态 */
  mxmRenderStatus?: "pending" | "rendering" | "ready" | "failed";
  /** 渲染失败的错误信息 */
  mxmRenderError?: string;
}

// ============================================================
// 3. Dispatcher 输入/输出
// ============================================================

/**
 * Dispatcher 输入：ProjectFile JSON
 */
export interface DispatchInput {
  /** ProjectFile JSON（OpenReel 标准） */
  script: VideoEditScript;
  /** 用户 ID（用于计费 / MinIO 路径） */
  userId: string;
  /** 上级任务 ID（用于账单关联） */
  parentTaskId?: string;
  /** 渲染选项（clips-only / 跳过已渲染 / 仅拼接） */
  options?: VideoEditRenderOptions;
}

/** 视频剪辑渲染选项 */
export interface VideoEditRenderOptions {
  /** 是否拼接最终 mp4（默认 true） */
  concatFinal?: boolean;
  /** 跳过 mxmRenderStatus=ready 且未 userEdited 的 clip（成片审核后导出用） */
  skipReadyClips?: boolean;
  /** 仅拼接已有 mxmRenderedVideoUrl，不再分发渲染 */
  concatOnly?: boolean;
  /** 烧录 project.textClips 文字叠加（成片精修阶段） */
  applyOverlays?: boolean;
  /** 烧录 timeline.subtitles 口播字幕。成片审核前建议 false（审核页用 HTML 字幕）；最终导出 true */
  applySubtitleBurn?: boolean;
  /** 拼接时使用 track.transitions xfade（成片精修阶段） */
  applyTransitions?: boolean;
}

/**
 * 单个 clip 的渲染结果
 */
export interface ClipDispatchResult {
  /** 对应 OpenReel clip.id */
  clipId: string;
  /** 渲染模式 */
  renderMode: MxmRenderMode;
  /** 渲染产物的 mp4 URL（成功时） */
  videoUrl?: string;
  /** AI 配图 URL（ai-video-gen + image 路径） */
  imageUrl?: string;
  /** 渲染实际使用的静态素材图 URL（stock / 用户图），供成片审核回退展示 */
  resolvedImageUrl?: string;
  /** 渲染实际使用的素材视频 URL（stock / 用户视频），供成片审核回退展示 */
  resolvedVideoUrl?: string;
  /** 独立生成子任务 id（保留在列表中可预览） */
  childTaskId?: string;
  /** 渲染时长（毫秒） */
  durationMs?: number;
  /** 渲染失败时的错误信息 */
  error?: string;
}

/**
 * Dispatcher 输出
 */
export interface DispatchOutput {
  /** 所有 clip 的渲染结果（按 timeline 顺序） */
  clips: ClipDispatchResult[];
  /** 拼接后的最终 mp4 URL（成功时） */
  finalVideoUrl?: string;
  /** 写入 mxmRenderedVideoUrl 后的 ProjectFile（供二次审核 / 导出） */
  script: VideoEditScript;
  /** 总耗时（毫秒） */
  totalDurationMs?: number;
  /** 失败 clip 数量 */
  failedCount: number;
}

/** 素材引用图片是否启用了 Ken Burns 动效（默认开启） */
export function isImageMotionEnabled(meta?: MxmClipMetadata): boolean {
  return meta?.mxmImageMotionEnabled !== false;
}

/** 导出/渲染时实际使用的动效（未启用则 none） */
export function resolveEffectiveImageMotion(
  meta?: MxmClipMetadata
): NonNullable<MxmClipMetadata["mxmImageMotion"]> {
  if (!isImageMotionEnabled(meta)) return "none";
  const motion = meta?.mxmImageMotion;
  if (!motion || motion === "none") return "zoom-in";
  return motion;
}