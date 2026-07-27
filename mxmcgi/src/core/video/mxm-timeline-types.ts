/**
 * superxmmai 视频时间轴 JSON Schema (v1.0)
 *
 * 设计原则（参考 OpenReel 精简而来）：
 * 1. 字段比 OpenReel 精简约 80%，只保留 superxmmai 视频业务需要的
 * 2. 兼容现有 StoryboardChunk 字段（video_description / dialogue / shot_timeline）
 * 3. 不引入 3D 变换 / 关键帧动画 / 复杂效果链
 * 4. 服务端拼接（ffmpeg）由 timeline 描述驱动，客户端只读 + 审核
 * 5. 字段名贴近 OpenReel（mediaUrl / duration / startTime），方便未来迁移
 *
 * 典型用法：
 *   import { MxmProject, storyboardChunksToMxmProject } from './mxm-timeline-types';
 *   import { buildMxmProjectFromTask } from './mxm-timeline-builder';
 *
 *   const project = buildMxmProjectFromTask(taskResult);
 *   const json = serializeMxmProject(project);  // → string
 *   const restored = parseMxmProject(json);     // → MxmProject
 */

import type { StoryboardChunk, StoryboardShot } from '../writing/type';

/** schema 版本号；解析时校验 */
export const MXM_TIMELINE_VERSION = '1.0.0';

/** 支持的 schema 版本列表（兼容旧版解析） */
export const MXM_TIMELINE_SUPPORTED_VERSIONS: readonly string[] = ['1.0.0'];

/* ============================================================================
 * 核心类型
 * ==========================================================================*/

/** superxmmai 视频项目（顶层） */
export interface MxmProject {
  /** schema 版本 */
  readonly version: typeof MXM_TIMELINE_VERSION;
  /** 项目唯一 ID（对应 taskId） */
  readonly id: string;
  /** 项目显示名 */
  readonly name: string;
  /** 创建时间（毫秒） */
  readonly createdAt: number;
  /** 最后修改时间（毫秒） */
  readonly modifiedAt: number;
  /** 项目画幅/帧率/时长等 */
  readonly settings: MxmProjectSettings;
  /** 主视频轨：每个 chunk 一段视频 */
  readonly videoTrack: MxmVideoTrack;
  /** 字幕轨（必含，可以为空数组） */
  readonly subtitleTrack: MxmSubtitleTrack;
  /** BGM/解说音频轨（可选） */
  readonly audioTrack?: MxmAudioTrack;
  /** 转场列表（按时间顺序） */
  readonly transitions?: readonly MxmTransition[];
  /** 服务端拼接后的最终视频 URL（ffmpeg 渲染产物，存 MinIO） */
  readonly renderedVideoUrl?: string;
  /** 服务端拼接后的最终视频时长（秒） */
  readonly renderedDuration?: number;
  /** 任意扩展字段（业务自定） */
  readonly custom?: Record<string, unknown>;
}

/** 项目画幅/帧率/时长 */
export interface MxmProjectSettings {
  /** 视频宽（默认 1920） */
  readonly width: number;
  /** 视频高（默认 1080） */
  readonly height: number;
  /** 帧率（默认 30） */
  readonly fps: number;
  /** 总时长（秒，由所有 chunk 累加） */
  readonly duration: number;
  /** 背景色（hex，alpha 时长块之间过渡用） */
  readonly backgroundColor?: string;
  /** 方向 */
  readonly orientation?: 'landscape' | 'portrait' | 'square';
}

/* ============================================================================
 * 视频轨
 * ==========================================================================*/

/** 主视频轨（必含，type=video） */
export interface MxmVideoTrack {
  readonly type: 'video';
  /** 各视频块（按 startTime 升序） */
  readonly chunks: readonly MxmVideoChunk[];
}

/** 单个视频块（对应一个视频模型输出） */
export interface MxmVideoChunk {
  /** 块 ID（项目内唯一） */
  readonly id: string;
  /** 在 timeline 上的起始时间（秒） */
  readonly startTime: number;
  /** 时长（秒） */
  readonly duration: number;
  /** 媒体 URL（MinIO / 外部 / blob URL） */
  readonly mediaUrl: string;
  /** 媒体在源文件内的入点（裁剪起点，秒） */
  readonly inPoint: number;
  /** 媒体在源文件内的出点（裁剪终点，秒） */
  readonly outPoint: number;
  /** 缩略图 URL（可选，用于 timeline 缩略图） */
  readonly thumbnailUrl?: string;
  /** 关联的原始 storyboard（审核时回看） */
  readonly sourceStoryboard?: MxmStoryboardRef;
  /** 简单效果（无 / 淡入 / 淡出 / 淡入淡出 / Ken Burns / 推近） */
  readonly effect?: MxmChunkEffect;
  /** 音量（0-1，默认 1.0） */
  readonly volume: number;
  /** 任意扩展 */
  readonly custom?: Record<string, unknown>;
}

/** 引用原始 StoryboardChunk（审核时回看） */
export interface MxmStoryboardRef {
  /** StoryboardChunk.index */
  readonly chunkIndex: number;
  /** 视频描述 */
  readonly description?: string;
  /** 镜头运动 */
  readonly cameraMovement?: string;
  /** 对话 */
  readonly dialogue?: string;
  /** 音效 */
  readonly soundEffects?: string;
  /** 出镜角色 */
  readonly charactersInShot?: readonly string[];
  /** 该 chunk 对应的视频模型 prompt（生成时用） */
  readonly prompt?: string;
  /** 多镜头分镜（参考 OpenReel 但简化） */
  readonly shots?: readonly MxmShotRef[];
}

/** 单个镜头（多镜头 chunk 内部用） */
export interface MxmShotRef {
  readonly shotIndex: number;
  readonly videoDescription?: string;
  readonly cameraMovement?: string;
  readonly dialogue?: string;
  readonly soundEffects?: string;
  readonly prompt?: string;
}

/** chunk 简单效果枚举（克制选择，避免太复杂） */
export type MxmChunkEffect =
  | 'none'
  | 'fadeIn'
  | 'fadeOut'
  | 'fadeInOut'
  | 'kenBurns'
  | 'zoomIn';

/* ============================================================================
 * 字幕轨
 * ==========================================================================*/

/** 字幕轨（必含，type=subtitle） */
export interface MxmSubtitleTrack {
  readonly type: 'subtitle';
  readonly subtitles: readonly MxmSubtitle[];
}

/** 单条字幕（支持卡拉 OK 逐词） */
export interface MxmSubtitle {
  readonly id: string;
  /** 起始时间（秒，timeline 上） */
  readonly startTime: number;
  /** 结束时间（秒） */
  readonly endTime: number;
  /** 字幕文本 */
  readonly text: string;
  /** 卡拉 OK 逐词时间戳（可选，来自 TTS） */
  readonly words?: readonly MxmSubtitleWord[];
  /** 样式 */
  readonly style?: MxmSubtitleStyle;
  /** 关联的 video chunk id（点击字幕跳转） */
  readonly relateChunkId?: string;
}

/** 单个词（卡拉 OK） */
export interface MxmSubtitleWord {
  readonly text: string;
  readonly startTime: number;
  readonly endTime: number;
}

/** 字幕样式 */
export interface MxmSubtitleStyle {
  readonly fontFamily?: string;
  readonly fontSize?: number;
  readonly color?: string;
  readonly backgroundColor?: string;
  readonly position?: 'top' | 'center' | 'bottom';
  /** 卡拉 OK 当前词高亮色 */
  readonly highlightColor?: string;
}

/* ============================================================================
 * 音频轨
 * ==========================================================================*/

/** 音频轨（可选，type=audio） */
export interface MxmAudioTrack {
  readonly type: 'audio';
  /** 媒体 URL（MinIO / 外部） */
  readonly mediaUrl: string;
  /** 在 timeline 上的起始时间（默认 0） */
  readonly startTime: number;
  /** 时长（秒） */
  readonly duration: number;
  /** 音量（0-1） */
  readonly volume: number;
  /** 是否 ducking（主轨说话时自动降低音量） */
  readonly ducking?: boolean;
  /** 来源说明（'bgm' | 'voiceover' | 'soundtrack'） */
  readonly source?: 'bgm' | 'voiceover' | 'soundtrack' | string;
}

/* ============================================================================
 * 转场
 * ==========================================================================*/

/** 转场（连接两个 chunk） */
export interface MmxTransitionV1 {
  readonly id: string;
  readonly fromChunkId: string;
  readonly toChunkId: string;
  readonly type: 'cut' | 'fade' | 'dissolve' | 'wipe' | 'slide';
  readonly duration: number;
  /** 起始时间 = fromChunkId.startTime + fromChunkId.duration - duration */
  readonly startTime: number;
}
/** 命名修正：使用 MxmTransition */
export type MxmTransition = MmxTransitionV1;

/* ============================================================================
 * 序列化（持久化）
 * ==========================================================================*/

/** 带元信息的项目文件（持久化格式） */
export interface MxmProjectFile {
  readonly version: typeof MXM_TIMELINE_VERSION;
  readonly project: MxmProject;
  readonly metadata?: MxmProjectFileMetadata;
}

/** 项目文件元信息（导出/分享用） */
export interface MxmProjectFileMetadata {
  readonly exportedAt?: number;
  readonly description?: string;
  readonly author?: string;
  readonly sourceTaskId?: string;
}

/* ============================================================================
 * 校验错误
 * ==========================================================================*/

/** 校验结果 */
export interface MxmValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly missingAssets?: readonly string[];
}

/* ============================================================================
 * 工具类型（builder 输入）
 * ==========================================================================*/

/** builder 输入：单个视频块（来自 video 业务结果） */
export interface MxmVideoChunkInput {
  readonly id: string;
  /** 时长（秒） */
  readonly duration: number;
  /** 视频 URL（MinIO 临时 R2 / 输出桶） */
  readonly mediaUrl: string;
  /** 入点（默认 0） */
  readonly inPoint?: number;
  /** 出点（默认 = duration） */
  readonly outPoint?: number;
  /** 缩略图 URL（可选） */
  readonly thumbnailUrl?: string;
  /** 关联的 StoryboardChunk */
  readonly sourceChunk?: StoryboardChunk;
}

/** builder 输入：字幕（来自 TTS 业务结果） */
export interface MxmSubtitleInput {
  readonly id: string;
  readonly startTime: number;
  readonly endTime: number;
  readonly text: string;
  readonly words?: readonly MxmSubtitleWord[];
  readonly style?: MxmSubtitleStyle;
  /** 关联的 chunk ID（点击跳转） */
  readonly relateChunkId?: string;
}

/** builder 输入：音频 */
export interface MxmAudioInput {
  readonly mediaUrl: string;
  readonly startTime?: number;
  readonly duration: number;
  readonly volume?: number;
  readonly ducking?: boolean;
  readonly source?: 'bgm' | 'voiceover' | 'soundtrack' | string;
}

/** builder 完整输入 */
export interface MxmProjectBuildInput {
  readonly id: string;
  readonly name?: string;
  readonly videoChunks: readonly MxmVideoChunkInput[];
  readonly subtitles?: readonly MxmSubtitleInput[];
  readonly audio?: MxmAudioInput;
  readonly settings?: Partial<MxmProjectSettings>;
  readonly renderedVideoUrl?: string;
  readonly renderedDuration?: number;
  readonly custom?: Record<string, unknown>;
}

/* ============================================================================
 * StoryboardShot → MxmShotRef 转换工具（仅供 builder 内部使用）
 * ==========================================================================*/
export function storyboardShotToRef(shot: StoryboardShot): MxmShotRef {
  return {
    shotIndex: shot.shot_index,
    videoDescription: shot.video_description,
    cameraMovement: shot.camera_movement,
    dialogue: shot.dialogue,
    soundEffects: shot.sound_effects,
    prompt: shot.prompt,
  };
}
