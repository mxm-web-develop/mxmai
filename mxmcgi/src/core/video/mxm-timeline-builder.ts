/**
 * superxmmai Timeline Builder
 *
 * 职责：
 * 1. 把 video 业务结果（chunks + 字幕 + BGM）组装成 MxmProject
 * 2. 提供序列化和反序列化方法
 * 3. 提供项目文件校验
 *
 * 关键约定：
 * - 入参只读；输出是新的对象（immutable）
 * - 时间累加：chunks 按时长顺序累加得到 startTime
 * - 默认效果：第一段 fadeIn，最后一段 fadeOut
 * - 转场：相邻 chunk 之间默认 dissolve 0.5s（可在 input 中覆盖）
 */

import { randomUUID } from 'node:crypto';
import {
  MXM_TIMELINE_VERSION,
  MXM_TIMELINE_SUPPORTED_VERSIONS,
  storyboardShotToRef,
  type MxmProject,
  type MxmProjectBuildInput,
  type MxmProjectFile,
  type MxmProjectSettings,
  type MxmSubtitle,
  type MxmSubtitleInput,
  type MxmTransition,
  type MxmValidationResult,
  type MxmVideoChunk,
  type MxmVideoChunkInput,
  type MxmVideoTrack,
  type MxmSubtitleTrack,
  type MxmAudioTrack,
} from './mxm-timeline-types';

/* ============================================================================
 * 默认配置
 * ==========================================================================*/

const DEFAULT_SETTINGS: MxmProjectSettings = {
  width: 1920,
  height: 1080,
  fps: 30,
  duration: 0,
  backgroundColor: '#000000',
  orientation: 'landscape',
};

const DEFAULT_VOLUME = 1.0;
const DEFAULT_AUDIO_START = 0;

/* ============================================================================
 * 核心 Builder
 * ==========================================================================*/

/**
 * 构建 MxmProject
 *
 * @example
 *   const project = buildMxmProject({
 *     id: 'task-abc',
 *     videoChunks: [
 *       { id: 'c0', duration: 5, mediaUrl: 'https://r2/c0.mp4', sourceChunk: chunk0 },
 *       { id: 'c1', duration: 8, mediaUrl: 'https://r2/c1.mp4', sourceChunk: chunk1 },
 *     ],
 *     subtitles: [
 *       { id: 's0', startTime: 0, endTime: 5, text: '你好' },
 *     ],
 *   });
 */
export function buildMxmProject(input: MxmProjectBuildInput): MxmProject {
  if (!input.id?.trim()) {
    throw new Error('[MxmTimelineBuilder] id 必填');
  }
  if (!Array.isArray(input.videoChunks) || input.videoChunks.length === 0) {
    throw new Error('[MxmTimelineBuilder] videoChunks 不能为空');
  }

  const now = Date.now();
  const videoChunks = buildVideoChunks(input.videoChunks);
  const totalDuration = videoChunks.reduce(
    (sum, c) => sum + c.duration,
    0,
  );

  const settings: MxmProjectSettings = {
    ...DEFAULT_SETTINGS,
    ...input.settings,
    duration: totalDuration,
  };

  const videoTrack: MxmVideoTrack = {
    type: 'video',
    chunks: videoChunks,
  };

  const subtitleTrack: MxmSubtitleTrack = {
    type: 'subtitle',
    subtitles: buildSubtitles(input.subtitles ?? []),
  };

  let audioTrack: MxmAudioTrack | undefined;
  if (input.audio) {
    audioTrack = {
      type: 'audio',
      mediaUrl: input.audio.mediaUrl,
      startTime: input.audio.startTime ?? DEFAULT_AUDIO_START,
      duration: input.audio.duration,
      volume: input.audio.volume ?? DEFAULT_VOLUME,
      ducking: input.audio.ducking ?? false,
      source: input.audio.source,
    };
  }

  const transitions = buildTransitions(videoChunks);

  return {
    version: MXM_TIMELINE_VERSION,
    id: input.id,
    name: input.name?.trim() || `视频方案 ${input.id.slice(0, 8)}`,
    createdAt: now,
    modifiedAt: now,
    settings,
    videoTrack,
    subtitleTrack,
    audioTrack,
    transitions,
    renderedVideoUrl: input.renderedVideoUrl,
    renderedDuration: input.renderedDuration,
    custom: input.custom,
  };
}

/**
 * 构建视频块（计算 startTime + 默认 effect）
 */
function buildVideoChunks(inputs: readonly MxmVideoChunkInput[]): readonly MxmVideoChunk[] {
  const out: MxmVideoChunk[] = [];
  let cursor = 0;
  const lastIndex = inputs.length - 1;

  for (let i = 0; i < inputs.length; i++) {
    const inp = inputs[i];
    const duration = Math.max(0, Number(inp.duration) || 0);
    if (duration <= 0) {
      throw new Error(`[MxmTimelineBuilder] chunk ${inp.id} duration 必须 > 0`);
    }
    if (!inp.mediaUrl?.trim()) {
      throw new Error(`[MxmTimelineBuilder] chunk ${inp.id} mediaUrl 必填`);
    }

    // 默认效果：第一段 fadeIn，最后一段 fadeOut，中间 none
    let effect: MxmVideoChunk['effect'];
    if (i === 0 && i === lastIndex) {
      effect = 'fadeInOut';
    } else if (i === 0) {
      effect = 'fadeIn';
    } else if (i === lastIndex) {
      effect = 'fadeOut';
    } else {
      effect = 'none';
    }

    out.push({
      id: inp.id,
      startTime: cursor,
      duration,
      mediaUrl: inp.mediaUrl,
      inPoint: inp.inPoint ?? 0,
      outPoint: inp.outPoint ?? duration,
      thumbnailUrl: inp.thumbnailUrl,
      sourceStoryboard: inp.sourceChunk
        ? {
            chunkIndex: inp.sourceChunk.index,
            description: inp.sourceChunk.video_description,
            cameraMovement: inp.sourceChunk.camera_movement,
            dialogue: inp.sourceChunk.dialogue,
            soundEffects: inp.sourceChunk.sound_effects,
            charactersInShot: inp.sourceChunk.characters_in_shot,
            prompt: inp.sourceChunk.prompt,
            shots: inp.sourceChunk.shots?.map(storyboardShotToRef),
          }
        : undefined,
      effect,
      volume: DEFAULT_VOLUME,
    });

    cursor += duration;
  }
  return out;
}

/**
 * 构建字幕（按 startTime 排序）
 */
function buildSubtitles(inputs: readonly MxmSubtitleInput[]): readonly MxmSubtitle[] {
  return inputs
    .slice()
    .sort((a, b) => a.startTime - b.startTime)
    .map((s) => {
      const out: MxmSubtitle = {
        id: s.id,
        startTime: Math.max(0, s.startTime),
        endTime: Math.max(s.startTime + 0.01, s.endTime),
        text: s.text,
        style: s.style,
        relateChunkId: s.relateChunkId,
      };
      if (s.words?.length) {
        return { ...out, words: s.words };
      }
      return out;
    });
}

/**
 * 构建转场（相邻 chunk 间默认 dissolve 0.5s）
 */
function buildTransitions(chunks: readonly MxmVideoChunk[]): readonly MxmTransition[] {
  if (chunks.length < 2) return [];
  const out: MxmTransition[] = [];
  for (let i = 0; i < chunks.length - 1; i++) {
    const from = chunks[i];
    const to = chunks[i + 1];
    const TRANSITION_DURATION = 0.5;
    out.push({
      id: `trans-${i}`,
      fromChunkId: from.id,
      toChunkId: to.id,
      type: 'dissolve',
      duration: TRANSITION_DURATION,
      startTime: from.startTime + from.duration - TRANSITION_DURATION,
    });
  }
  return out;
}

/* ============================================================================
 * 序列化
 * ==========================================================================*/

/**
 * 序列化为 JSON 字符串（项目文件格式）
 */
export function serializeMxmProject(
  project: MxmProject,
  metadata?: MxmProjectFile['metadata'],
): string {
  const file: MxmProjectFile = {
    version: MXM_TIMELINE_VERSION,
    project,
    metadata,
  };
  return JSON.stringify(file, null, 2);
}

/**
 * 序列化为 MxmProject 内部 JSON（不带文件包装）
 */
export function serializeMxmProjectRaw(project: MxmProject): string {
  return JSON.stringify(project);
}

/**
 * 解析 JSON 字符串为 MxmProjectFile
 *
 * 校验：
 * - version 必须存在且在支持列表
 * - project.id / project.name / project.settings / project.videoTrack / project.subtitleTrack 必填
 */
export function parseMxmProject(json: string): MxmProjectFile {
  let file: MxmProjectFile;
  try {
    file = JSON.parse(json) as MxmProjectFile;
  } catch (e) {
    throw new Error(
      `[MxmTimelineBuilder] JSON 解析失败: ${e instanceof Error ? e.message : 'unknown'}`,
    );
  }

  if (!file.version) {
    throw new Error('[MxmTimelineBuilder] ProjectFile 缺少 version 字段');
  }
  if (!MXM_TIMELINE_SUPPORTED_VERSIONS.includes(file.version)) {
    throw new Error(
      `[MxmTimelineBuilder] 不支持的 version: ${file.version}（支持: ${MXM_TIMELINE_SUPPORTED_VERSIONS.join(', ')}）`,
    );
  }
  if (!file.project) {
    throw new Error('[MxmTimelineBuilder] ProjectFile 缺少 project 字段');
  }
  const p = file.project;
  if (!p.id) throw new Error('[MxmTimelineBuilder] project.id 必填');
  if (!p.name) throw new Error('[MxmTimelineBuilder] project.name 必填');
  if (!p.settings) throw new Error('[MxmTimelineBuilder] project.settings 必填');
  if (!p.videoTrack) throw new Error('[MxmTimelineBuilder] project.videoTrack 必填');
  if (!p.subtitleTrack) throw new Error('[MxmTimelineBuilder] project.subtitleTrack 必填');
  return file;
}

/* ============================================================================
 * 校验（业务校验，结构校验在 parse 阶段完成）
 * ==========================================================================*/

/**
 * 深度校验，返回错误和警告列表
 */
export function validateMxmProject(file: MxmProjectFile): MxmValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const missingAssets: string[] = [];
  const project = file.project;

  if (!project.videoTrack.chunks?.length) {
    errors.push('videoTrack.chunks 不能为空');
  }

  // 校验时间连续性
  let expected = 0;
  for (const chunk of project.videoTrack.chunks) {
    if (Math.abs(chunk.startTime - expected) > 0.01) {
      warnings.push(
        `chunk ${chunk.id} startTime=${chunk.startTime} 与预期 ${expected} 不一致`,
      );
    }
    if (chunk.duration <= 0) {
      errors.push(`chunk ${chunk.id} duration 必须 > 0`);
    }
    if (!chunk.mediaUrl?.trim()) {
      missingAssets.push(chunk.id);
      errors.push(`chunk ${chunk.id} 缺少 mediaUrl`);
    }
    expected = chunk.startTime + chunk.duration;
  }

  // 校验转场引用的 chunk 必须存在
  const chunkIds = new Set(project.videoTrack.chunks.map((c) => c.id));
  for (const trans of project.transitions ?? []) {
    if (!chunkIds.has(trans.fromChunkId)) {
      errors.push(`转场 ${trans.id} 引用了不存在的 fromChunkId: ${trans.fromChunkId}`);
    }
    if (!chunkIds.has(trans.toChunkId)) {
      errors.push(`转场 ${trans.id} 引用了不存在的 toChunkId: ${trans.toChunkId}`);
    }
  }

  // 校验字幕时间
  for (const sub of project.subtitleTrack.subtitles) {
    if (sub.startTime < 0 || sub.endTime <= sub.startTime) {
      errors.push(`字幕 ${sub.id} 时间无效 (${sub.startTime} - ${sub.endTime})`);
    }
    if (sub.relateChunkId && !chunkIds.has(sub.relateChunkId)) {
      warnings.push(`字幕 ${sub.id} 引用了不存在的 relateChunkId: ${sub.relateChunkId}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    missingAssets: missingAssets.length ? missingAssets : undefined,
  };
}

/* ============================================================================
 * 工具函数
 * ==========================================================================*/

/** 生成新 ID（带前缀） */
export function newMxmId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

/**
 * 提取所有 video chunk 引用到的 storyboard 信息
 * 供"点击 chunk 看原始 storyboard"功能使用
 */
export function getStoryboardByChunkId(
  project: MxmProject,
  chunkId: string,
) {
  const chunk = project.videoTrack.chunks.find((c) => c.id === chunkId);
  return chunk?.sourceStoryboard;
}

/**
 * 找当前时间点对应的 video chunk
 */
export function getChunkAtTime(project: MxmProject, time: number) {
  return project.videoTrack.chunks.find(
    (c) => time >= c.startTime && time < c.startTime + c.duration,
  );
}

/**
 * 找当前时间点对应的字幕（可能多条，取最后开始的）
 */
export function getSubtitleAtTime(project: MxmProject, time: number) {
  return [...project.subtitleTrack.subtitles]
    .reverse()
    .find((s) => time >= s.startTime && time < s.endTime);
}
