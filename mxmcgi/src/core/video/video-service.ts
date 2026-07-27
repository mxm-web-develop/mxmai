/**
 * 视频兼容层：POST /video/generate（移动端等）→ 内部转 Task V2
 * 新接入请使用 POST /api/v2/tasks/run（scope=video）
 */

import { runTaskV2Single } from '../../tasks/task-engine';
import { taskExecutor } from '../../task/task-executor';
import { buildVideoChunkTaskParams, coerceVideoDuration } from './video-params';
import { resolveVideoTaskKey } from './video-task-keys';
import { chunkToPromptString } from '../writing/storyboard-chunk-utils';
import type { StoryboardChunk } from '../writing/type';

export interface VideoSingleChunkBody {
  prompt: string;
  chunk_seconds: number | string;
  label?: string;
  scriptType?: string;
  taskKey?: string;
  subtype?: string;
  orientation?: 'landscape' | 'portrait';
  size?: string;
  resolution?: string;
  ratio?: string;
  input_reference?: string;
  reference_image_url?: string;
  reference_images?: string[];
  generate_audio?: boolean;
  parameters?: Record<string, unknown>;
  storeToMinio?: boolean;
  storageConfig?: { bucket?: string; pathTemplate?: string };
}

export interface VideoBatchBody {
  chunks: StoryboardChunk[];
  scriptType?: string;
  taskKey?: string;
  subtype?: string;
  label?: string;
  orientation?: 'landscape' | 'portrait';
  size?: string;
  resolution?: string;
  ratio?: string;
  generate_audio?: boolean;
  parameters?: Record<string, unknown>;
  storeToMinio?: boolean;
  storageConfig?: { bucket?: string; pathTemplate?: string };
}

export type VideoGenerateBody = (VideoSingleChunkBody | VideoBatchBody) & {
  chunks?: StoryboardChunk[];
  taskKey?: string;
  subtype?: string;
  scriptType?: string;
};

export interface VideoGenerateOptions {
  userId: string;
  provider?: string;
  taskKey?: string;
  subtype?: string;
}

export interface VideoSingleResponse {
  taskId: string;
  status: string;
  createdAt: Date;
}

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

function sharedBodyFields(body: VideoGenerateBody) {
  return {
    orientation: (body as VideoBatchBody).orientation,
    size: (body as VideoBatchBody).size,
    resolution: (body as VideoBatchBody).resolution,
    ratio: (body as VideoBatchBody).ratio,
    generate_audio: (body as VideoBatchBody).generate_audio,
    parameters: (body as VideoBatchBody).parameters,
  };
}

function chunkToV2Params(
  chunk: StoryboardChunk,
  body: VideoGenerateBody,
  childLabel?: string,
): Record<string, unknown> {
  const prompt = getChunkPrompt(chunk);
  if (!prompt) {
    throw new Error('chunk 缺少 prompt 或 video_description');
  }
  coerceVideoDuration(chunk.chunk_seconds);
  return {
    ...buildVideoChunkTaskParams({
      prompt,
      chunk_seconds: chunk.chunk_seconds,
      ...sharedBodyFields(body),
      input_reference: (chunk as StoryboardChunk & { input_reference?: string }).input_reference,
      reference_image_url: (chunk as StoryboardChunk & { reference_image_url?: string }).reference_image_url,
      label: childLabel,
    }),
    label: childLabel,
  };
}

/**
 * 兼容入口：单段或分镜批量（内部 Task V2 + task-v2-batch-parent）
 */
export async function generate(
  body: VideoGenerateBody,
  options: VideoGenerateOptions,
): Promise<VideoSingleResponse | VideoBatchResponse> {
  const { userId } = options;
  const taskKey = resolveVideoTaskKey({
    taskKey: options.taskKey ?? body.taskKey,
    scriptType: body.scriptType,
  });
  const subtype = (options.subtype ?? body.subtype ?? 'default').trim() || 'default';

  if (isBatchBody(body)) {
    const chunks = body.chunks;
    const baseLabel = (body.label?.trim() || '分镜成片').replace(/\d+$/, '').trim() || '分镜成片';
    const taskManager = taskExecutor.getTaskManager();

    const parent = await taskManager.createTask({
      type: 'task-v2-batch-parent',
      model: 'video-batch',
      provider: options.provider as never,
      params: {
        metadata: { label: baseLabel, videoTaskKey: taskKey, videoSubtype: subtype },
      },
      userId,
      storeToMinio: false,
    });
    const parentTaskId = parent.taskId;

    const tasksResult: { taskId: string; chunkIndex: number; label: string }[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const childLabel = `${baseLabel}${i + 1}`;
      const params = chunkToV2Params(chunks[i], body, childLabel);
      const res = await runTaskV2Single(
        { scope: 'video', taskKey, subtype, params },
        userId,
        {
          batchContext: {
            parentTaskId,
            parallelIndex: i,
            parallelTotal: chunks.length,
          },
        },
      );
      tasksResult.push({ taskId: res.taskId, chunkIndex: i, label: childLabel });
    }

    const storage = (taskManager as any).storage;
    if (storage) {
      const snap = await taskManager.getTask(parentTaskId);
      await storage.update(parentTaskId, {
        metadata: {
          ...(snap?.task?.metadata ?? {}),
          label: baseLabel,
          childTaskIds: tasksResult.map((t) => t.taskId),
          videoTaskKey: taskKey,
        },
      });
    }

    return { parentTaskId, batchId: parentTaskId, tasks: tasksResult };
  }

  const one = body as VideoSingleChunkBody;
  if (!one.prompt?.trim()) {
    throw new Error('缺少 prompt');
  }
  const params = buildVideoChunkTaskParams({
    prompt: one.prompt.trim(),
    chunk_seconds: one.chunk_seconds,
    ...sharedBodyFields(body),
    input_reference: one.input_reference ?? one.reference_image_url,
    reference_images: one.reference_images,
    label: one.label,
  });

  const res = await runTaskV2Single({ scope: 'video', taskKey, subtype, params }, userId);
  return {
    taskId: res.taskId,
    status: res.status,
    createdAt: new Date(),
  };
}
