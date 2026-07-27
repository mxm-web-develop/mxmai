/**
 * Smartflow business 节点：调用 Task V2 并等待异步任务完成，返回资源 URL（非仅 taskId）
 */

import { runTaskV2 } from '../../../tasks/task-engine';
import type { TaskRunV2Response } from '../../../tasks/types';
import type { TaskScope } from '../../../tasks/types';
import { taskExecutor } from '../../../task/task-executor';
import { waitForTaskCompletion } from '../../../task/wait-for-task';
import type { Task } from '../../../task/types';

const MEDIA_SCOPES_REQUIRING_URLS = new Set<TaskScope>(['graph', 'video', 'audio', 'music']);

export interface SmartflowBusinessTaskOutput {
  success: boolean;
  taskId: string;
  status: string;
  scope: TaskScope;
  taskKey: string;
  subtype: string | null;
  syncResult?: {
    text?: string;
    mediaUrls?: string[];
    metadata?: Record<string, unknown>;
  };
  /** 异步媒体类任务完成后的可访问 URL（与 syncResult.mediaUrls 一致） */
  mediaUrls?: string[];
  /** graph 场景别名 */
  image_urls?: string[];
}

function smartflowBusinessTaskTimeoutMs(): number {
  return Number(
    process.env.SMARTFLOW_BUSINESS_TASK_WAIT_TIMEOUT_MS ||
      process.env.AGENT_TASK_WAIT_TIMEOUT_MS ||
      600_000
  );
}

function extractHttpMediaUrls(result: Task['result'] | undefined): string[] {
  const urls = result?.mediaUrls;
  if (!Array.isArray(urls)) return [];
  return urls.filter(
    (u): u is string =>
      typeof u === 'string' && u.trim().length > 0 && /^https?:\/\//i.test(u.trim())
  );
}

function fromSyncResponse(res: TaskRunV2Response): SmartflowBusinessTaskOutput {
  const sync = res.syncResult;
  const mediaUrls = (sync?.mediaUrls ?? []).filter(
    (u): u is string => typeof u === 'string' && u.trim().length > 0
  );
  return {
    success: true,
    taskId: res.taskId,
    status: 'completed',
    scope: res.scope,
    taskKey: res.taskKey,
    subtype: res.subtype ?? null,
    syncResult: sync,
    ...(mediaUrls.length > 0 ? { mediaUrls, image_urls: mediaUrls } : {}),
  };
}

function buildCompletedOutput(res: TaskRunV2Response, task: Task): SmartflowBusinessTaskOutput {
  const mediaUrls = extractHttpMediaUrls(task.result);
  const meta = (task.result?.metadata ?? {}) as Record<string, unknown>;
  const text =
    typeof meta.text === 'string' && meta.text.trim()
      ? meta.text.trim()
      : typeof task.result?.metadata?.text === 'string'
        ? String(task.result.metadata.text).trim()
        : undefined;

  const syncResult: SmartflowBusinessTaskOutput['syncResult'] = {
    ...(text ? { text } : {}),
    ...(mediaUrls.length > 0 ? { mediaUrls } : {}),
    metadata: meta,
  };

  return {
    success: true,
    taskId: res.taskId,
    status: 'completed',
    scope: res.scope,
    taskKey: res.taskKey,
    subtype: res.subtype ?? null,
    syncResult,
    ...(mediaUrls.length > 0 ? { mediaUrls, image_urls: mediaUrls } : {}),
  };
}

function assertTerminalTask(scope: TaskScope, task: Task): void {
  if (task.status === 'failed' || task.status === 'network_error') {
    const err = task.progress?.error;
    throw new Error(typeof err === 'string' && err.trim() ? err : '任务失败');
  }
  if (task.status === 'cancelled') {
    throw new Error('任务已取消');
  }
  if (task.status !== 'completed') {
    throw new Error(`任务未完成: ${task.status}`);
  }
  if (MEDIA_SCOPES_REQUIRING_URLS.has(scope)) {
    const urls = extractHttpMediaUrls(task.result);
    if (urls.length === 0) {
      throw new Error('任务已完成但未获取到存储后的资源 URL（mediaUrls 为空）');
    }
    const meta = (task.result?.metadata ?? {}) as Record<string, unknown>;
    const generatedPrompt =
      typeof meta.generated_prompt === 'string'
        ? meta.generated_prompt.trim()
        : typeof (task.metadata as Record<string, unknown> | undefined)?.generated_prompt === 'string'
          ? String((task.metadata as Record<string, unknown>).generated_prompt).trim()
          : '';
    if (scope === 'graph' && generatedPrompt.length < 40) {
      throw new Error('Graph 任务缺少有效 generated_prompt，疑似未走完 text/format 生图链路');
    }
  }
}

export async function runBusinessTaskForSmartflow(
  scope: TaskScope,
  taskKey: string,
  params: Record<string, unknown>,
  userId: string,
  options?: { subtype?: string | null }
): Promise<SmartflowBusinessTaskOutput> {
  const res = await runTaskV2(
    {
      scope,
      taskKey,
      subtype: options?.subtype ?? null,
      params,
    },
    userId
  );

  if (!res.success) {
    throw new Error(`任务创建失败: ${res.taskId ?? 'unknown'}`);
  }

  if (res.syncResult) {
    return fromSyncResponse(res);
  }

  if (!res.taskId) {
    throw new Error('任务响应缺少 taskId');
  }

  const taskManager = taskExecutor.getTaskManager();
  const snap = await taskManager.getTask(res.taskId);
  if (snap?.task?.status === 'completed') {
    assertTerminalTask(scope, snap.task);
    return buildCompletedOutput(res, snap.task);
  }

  const timeoutMs = smartflowBusinessTaskTimeoutMs();
  const { task, timedOut } = await waitForTaskCompletion(res.taskId, { timeoutMs });

  if (timedOut) {
    throw new Error(`任务超时（>${timeoutMs}ms），taskId=${res.taskId}`);
  }
  if (!task) {
    throw new Error(`任务不存在: ${res.taskId}`);
  }

  assertTerminalTask(scope, task);
  return buildCompletedOutput(res, task);
}
