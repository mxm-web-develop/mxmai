/**
 * 视频业务层服务
 * 统一按 chunk：无 chunks 时 body 即单个 chunk 的字段；有非空 chunks 时为批量。参数与 StoryboardChunk 对齐。
 */

import { taskExecutor } from '../../task/task-executor';
import {
  VIDEO_BUSINESS_MODEL,
  normalizeSeconds,
} from './videoconfigs';
import { chunkToPromptString } from '../writing/storyboard-chunk-utils';
import type { StoryboardChunk } from '../writing/type';
import type { StorageConfig } from '../utils/data-store';

/** 单个 chunk 的请求体（与 StoryboardChunk 对齐，无 chunks 数组时即“单段”= 一个 chunk） */
export interface VideoSingleChunkBody {
  prompt: string;
  chunk_seconds: number | string;
  label?: string;
  scriptType?: string;
  /** 横竖屏：用于后端自动选择最佳分辨率 */
  orientation?: 'landscape' | 'portrait';
  /** 兼容保留：若显式传入 size，会被后端覆盖为“最佳尺寸” */
  size?: string;
  input_reference?: string;
  reference_image_url?: string;
  storeToMinio?: boolean;
  storageConfig?: { bucket?: string; pathTemplate?: string };
}

/** 批量请求体：chunks 非空 */
export interface VideoBatchBody {
  chunks: StoryboardChunk[];
  scriptType?: string;
  label?: string;
  orientation?: 'landscape' | 'portrait';
  size?: string;
  storeToMinio?: boolean;
  storageConfig?: { bucket?: string; pathTemplate?: string };
}

export type VideoGenerateBody = (VideoSingleChunkBody | VideoBatchBody) & {
  chunks?: StoryboardChunk[];
};

export interface VideoGenerateOptions {
  userId: string;
  provider?: string;
}

/** 单段响应 */
export interface VideoSingleResponse {
  taskId: string;
  status: string;
  createdAt: Date;
}

/** 批量响应 */
export interface VideoBatchResponse {
  parentTaskId: string;
  batchId: string;
  tasks: { taskId: string; chunkIndex: number; label: string }[];
}

function isBatchBody(body: VideoGenerateBody): body is VideoBatchBody {
  return Array.isArray(body.chunks) && body.chunks.length > 0;
}

function getChunkPrompt(chunk: StoryboardChunk): string {
  const s = chunk.prompt?.trim();
  if (s) return s;
  return chunkToPromptString(chunk);
}

// 根据画幅选择 DeerAPI 官方稳定支持的分辨率：
// - 横屏：1280x720
// - 竖屏：720x1280
function getBestSize(orientation: 'landscape' | 'portrait' | undefined): '1280x720' | '720x1280' {
  return orientation === 'portrait' ? '720x1280' : '1280x720';
}

/**
 * 统一生成入口：有非空 chunks 走批量，否则走单段
 */
export async function generate(
  body: VideoGenerateBody,
  options: VideoGenerateOptions
): Promise<VideoSingleResponse | VideoBatchResponse> {
  const { userId, provider } = options;
  const taskManager = taskExecutor.getTaskManager();

  const storageConfig: StorageConfig = {
    bucket: body.storageConfig?.bucket ?? process.env.CGI_STORAGE_BUCKET ?? 'user-media',
    pathTemplate: body.storageConfig?.pathTemplate ?? '{userId}/video/{timestamp}-{randomId}.{ext}',
  };
  const storeToMinio = body.storeToMinio !== undefined ? body.storeToMinio : false;

  if (isBatchBody(body)) {
    // ---------- 分镜批量 ----------
    const chunks = body.chunks;
    const baseLabel = (body.label?.trim() || '分镜成片').replace(/\d+$/, '').trim() || '分镜成片';

    // 校验：每项含 prompt 与 chunk_seconds（seconds 会在 normalizeSeconds 中按模式归一化）
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      if (!c || typeof c !== 'object') {
        throw new Error(`chunks[${i}] 无效`);
      }
      const prompt = getChunkPrompt(c);
      if (!prompt) {
        throw new Error(`chunks[${i}] 缺少 prompt 或 video_description`);
      }
      normalizeSeconds(c.chunk_seconds);
    }

    // 1. 创建父任务（不执行）
    const parentTask = await taskManager.createTask({
      type: 'video-batch-parent',
      model: 'video-batch',
      provider: provider as any,
      params: {
        metadata: {
          label: baseLabel,
          childTaskIds: [], // 稍后回写
        },
      },
      userId,
      storeToMinio: false,
      storageConfig,
    });
    const parentTaskId = parentTask.taskId;
    const batchId = parentTaskId;

    const childTaskIds: string[] = [];
    const tasksResult: { taskId: string; chunkIndex: number; label: string }[] = [];

    // 2. 创建子任务
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const sec = normalizeSeconds(chunk.chunk_seconds);
      const prompt = getChunkPrompt(chunk);
      const secondsStr = String(sec) as any;
      const childLabel = `${baseLabel}${i + 1}`;
      const size = getBestSize((body as any).orientation);

      const childParams: Record<string, any> = {
        prompt,
        seconds: secondsStr,
        size,
        input_reference: (chunk as any).input_reference ?? (chunk as any).reference_image_url,
        label: childLabel,
        metadata: {
          label: childLabel,
          parentTaskId,
          chunkIndex: i,
          batchId,
        },
      };

      const childTask = await taskManager.createTask({
        type: 'video',
        model: VIDEO_BUSINESS_MODEL,
        provider: provider as any,
        params: childParams,
        userId,
        storeToMinio,
        storageConfig,
      });

      childTaskIds.push(childTask.taskId);
      tasksResult.push({ taskId: childTask.taskId, chunkIndex: i, label: childLabel });
    }

    // 3. 回写父任务 metadata.childTaskIds
    const storage = (taskManager as any).storage;
    if (storage) {
      const parent = await taskManager.getTask(parentTaskId);
      const existingMeta = parent?.task?.metadata ?? {};
      await storage.update(parentTaskId, {
        metadata: {
          ...existingMeta,
          label: baseLabel,
          childTaskIds,
        },
      });
    }

    // 4. 执行子任务（不阻塞）
    for (let i = 0; i < childTaskIds.length; i++) {
      const chunk = chunks[i];
      const sec = normalizeSeconds(chunk.chunk_seconds);
      const prompt = getChunkPrompt(chunk);
      const secondsStr = String(sec) as any;
      const size = getBestSize((body as any).orientation);
      const execParams = {
        prompt,
        seconds: secondsStr,
        size,
        input_reference: (chunk as any).input_reference ?? (chunk as any).reference_image_url,
      };
      console.log('[VideoService] 子任务 executeTask 参数:', {
        chunkIndex: i,
        promptLength: prompt.length,
        promptPreview: prompt.slice(0, 80) + (prompt.length > 80 ? '...' : ''),
        seconds: execParams.seconds,
        size: execParams.size,
        hasInputReference: !!execParams.input_reference,
      });
      taskExecutor
        .executeTask({
          taskId: childTaskIds[i],
          modelName: VIDEO_BUSINESS_MODEL,
          provider: provider as any,
          params: execParams,
          userId,
          storeToMinio,
          storageConfig,
        })
        .catch((err) => {
          console.error(`[VideoService] 子任务 ${childTaskIds[i]} 执行失败:`, err);
        });
    }

    return {
      parentTaskId,
      batchId,
      tasks: tasksResult,
    };
  }

  // ---------- 单个 chunk（无 chunks 数组 = 单段）----------
  const one = body as VideoSingleChunkBody;
  if (!one.prompt || (one.prompt as string).trim() === '') {
    throw new Error('缺少 prompt');
  }
  const chunk_seconds = normalizeSeconds(one.chunk_seconds);
  const secondsStr = String(chunk_seconds) as any;
  const inputRef = one.input_reference ?? one.reference_image_url;
  const size = getBestSize(one.orientation);

  const createRes = await taskManager.createTask({
    type: 'video',
    model: VIDEO_BUSINESS_MODEL,
    provider: provider as any,
    params: {
      prompt: one.prompt.trim(),
      seconds: secondsStr,
      size,
      input_reference: inputRef,
      label: one.label,
      metadata: one.label ? { label: one.label } : undefined,
    },
    userId,
    storeToMinio,
    storageConfig,
  });

  taskExecutor
    .executeTask({
      taskId: createRes.taskId,
      modelName: VIDEO_BUSINESS_MODEL,
      provider: provider as any,
      params: {
        prompt: one.prompt.trim(),
        seconds: secondsStr,
        size,
        input_reference: inputRef,
      },
      userId,
      storeToMinio,
      storageConfig,
    })
    .catch((err) => {
      console.error(`[VideoService] 单段任务 ${createRes.taskId} 执行失败:`, err);
    });

  return {
    taskId: createRes.taskId,
    status: createRes.status,
    createdAt: createRes.createdAt,
  };
}
