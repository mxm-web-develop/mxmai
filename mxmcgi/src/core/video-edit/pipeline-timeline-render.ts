/**
 * 自动剪辑管线内置节点：审核通过后按 OpenReel 时间轴逐段渲染 / 拼接。
 * 不是 prompt_engineering_config 业务，不经 runTaskV2 + loadTaskDefinition。
 */
import { taskExecutor } from '../../task/task-executor';
import type { PipelineStep, TaskContext } from '../../tasks/types';
import { ConfigurationError } from '../../tasks/errors';
import { interpolatePipelineTemplate } from '../../tasks/business-pipeline';

import {
  PIPELINE_NODE_VIDEO_TIMELINE_RENDER,
  VIDEO_TIMELINE_RENDER_STORAGE,
} from './pipeline-nodes';
export { PIPELINE_NODE_VIDEO_TIMELINE_RENDER } from './pipeline-nodes';

const MAX_PIPELINE_DEPTH = 1;

export function isVideoTimelineRenderPipelineStep(step: PipelineStep): boolean {
  return step.step === 'videoTimelineRender' || step.step === 'nestedVideo';
}

function readStepInputMapping(step: PipelineStep): Record<string, string> {
  const fromStep = step.inputMapping;
  if (fromStep && typeof fromStep === 'object') return fromStep;
  const fromParams = step.params?.inputMapping;
  if (fromParams && typeof fromParams === 'object' && !Array.isArray(fromParams)) {
    return fromParams as Record<string, string>;
  }
  return { videoEditScriptJson: '${state.videoEditScriptJson}' };
}

/** 从 pipeline step + ctx 解析渲染入参 */
export function resolveVideoTimelineRenderInput(
  ctx: TaskContext,
  step: PipelineStep
): {
  videoEditScriptJson: Record<string, unknown>;
  renderOptions?: Record<string, unknown>;
  label?: string;
} {
  const depth = Number((ctx.params as Record<string, unknown>)._pipelineDepth ?? 0);
  if (depth >= MAX_PIPELINE_DEPTH) {
    throw new ConfigurationError('videoTimelineRender 嵌套深度超限');
  }

  const mapping = readStepInputMapping(step);
  const nestedParams: Record<string, unknown> = {};
  for (const [field, tmpl] of Object.entries(mapping)) {
    if (field === 'videoEditScriptJson') {
      const direct = ctx.state.videoEditScriptJson;
      if (direct != null && typeof direct === 'object') {
        nestedParams[field] = direct;
        continue;
      }
      if (typeof direct === 'string' && direct.trim().startsWith('{')) {
        try {
          nestedParams[field] = JSON.parse(direct);
          continue;
        } catch {
          /* fall through */
        }
      }
    }
    const raw = interpolatePipelineTemplate(tmpl, ctx);
    if (raw.startsWith('{') || raw.startsWith('[')) {
      try {
        nestedParams[field] = JSON.parse(raw);
      } catch {
        nestedParams[field] = raw;
      }
    } else {
      nestedParams[field] = raw;
    }
  }

  const scriptRaw = nestedParams.videoEditScriptJson;
  if (scriptRaw == null || typeof scriptRaw !== 'object' || Array.isArray(scriptRaw)) {
    throw new Error(
      'videoTimelineRender 缺少 state.videoEditScriptJson：请确认分镜审核已通过且脚本已写入 pipeline state'
    );
  }

  const stepRenderOptions = (step.params as { renderOptions?: Record<string, unknown> } | undefined)
    ?.renderOptions;
  const renderOptions =
    stepRenderOptions && typeof stepRenderOptions === 'object' ? stepRenderOptions : undefined;

  const label =
    typeof nestedParams.label === 'string' && nestedParams.label.trim()
      ? nestedParams.label.trim()
      : undefined;

  return {
    videoEditScriptJson: scriptRaw as Record<string, unknown>,
    renderOptions,
    label,
  };
}

/** 创建内部 render 子任务（Task 记录 + worker 执行，无 DB 业务定义） */
export async function createVideoTimelineRenderTask(params: {
  userId: string;
  parentPipelineTaskId?: string;
  pipelineDepth?: number;
  videoEditScriptJson: Record<string, unknown>;
  renderOptions?: Record<string, unknown>;
  label?: string;
}): Promise<string> {
  const taskManager = taskExecutor.getTaskManager();
  const depth = params.pipelineDepth ?? 1;

  const createRes = await taskManager.createTask({
    type: 'video',
    model: 'video-edit-dispatcher',
    provider: 'internal',
    userId: params.userId,
    storeToMinio: true,
    params: {
      taskType: 'video',
      videoSubtype: 'render',
      userId: params.userId,
      params: {
        videoEditScriptJson: params.videoEditScriptJson,
        ...(params.renderOptions ? { renderOptions: params.renderOptions } : {}),
        _pipelineDepth: params.pipelineDepth ?? 1,
        metadata: {
          parentPipelineTaskId: params.parentPipelineTaskId,
          pipelineNode: PIPELINE_NODE_VIDEO_TIMELINE_RENDER,
          pipelineInternal: true,
        },
      },
      pipelineNode: PIPELINE_NODE_VIDEO_TIMELINE_RENDER,
      pipelineInternal: true,
      parentPipelineTaskId: params.parentPipelineTaskId,
    },
  });

  const storage = (taskManager as { storage?: { update: (id: string, u: unknown) => Promise<void> } })
    .storage;
  if (storage) {
    try {
      const snap = await taskManager.getTask(createRes.taskId);
      const existingMeta = (snap?.task?.metadata ?? {}) as Record<string, unknown>;
      await storage.update(createRes.taskId, {
        metadata: {
          ...existingMeta,
          model: 'video-edit-dispatcher',
          provider: 'internal',
          videoSubtype: 'render',
          pipelineNode: PIPELINE_NODE_VIDEO_TIMELINE_RENDER,
          pipelineInternal: true,
          hideFromUserList: true,
          ...(params.parentPipelineTaskId
            ? { parentPipelineTaskId: params.parentPipelineTaskId }
            : {}),
          storageConfig: VIDEO_TIMELINE_RENDER_STORAGE,
        },
      });
    } catch (metaErr) {
      console.warn('[videoTimelineRender] metadata 回写失败:', metaErr);
    }
  }

  return createRes.taskId;
}
