/**
 * Task V2 多份并发生成：父任务 + N 子任务
 */
import type { TaskRunV2Request, TaskRunV2Response, TaskRunV2ParallelChild, JsonSchemaV2 } from './types';
import type { RunTaskV2Options, RunTaskV2SingleOptions } from './task-engine';
import { runTaskV2Single } from './task-engine';
import { loadTaskDefinition } from './task-definition';
import { extractParallelCount } from './platform-fields';
import { allocateVariationParams } from './parallel-variation';
import { prepareParallelBatchBaseParams } from './parallel-batch-prep';
import { taskExecutor } from '../task/task-executor';
import { extractRequestLabelFromParams } from '../task/extract-request-label';

export async function runTaskV2ParallelBatch(
  req: TaskRunV2Request,
  userId: string | undefined,
  options?: RunTaskV2Options
): Promise<TaskRunV2Response> {
  const { scope, taskKey, subtype } = req;
  const parallelCount = extractParallelCount(req.params as Record<string, unknown>);
  const { template } = await loadTaskDefinition({ scope, taskKey, subtype: subtype ?? null, lang: 'zh' });
  const templateFormSchema = template.formSchema as JsonSchemaV2;
  const formSchemaForInput = (options?.publishedFormSchema ?? templateFormSchema) as JsonSchemaV2;
  const baseParams = prepareParallelBatchBaseParams({
    scope,
    taskKey,
    subtype: subtype ?? null,
    params: req.params as Record<string, unknown>,
    formSchema: formSchemaForInput,
    templateFormSchema: options?.publishedFormSchema ? templateFormSchema : undefined,
  });

  const billingUserId = options?.openApi?.billingUserId ?? userId;
  if (!billingUserId) {
    throw new Error('Missing userId');
  }

  const label =
    extractRequestLabelFromParams(baseParams) ||
    (typeof (baseParams as { metadata?: { label?: string } }).metadata?.label === 'string'
      ? String((baseParams as { metadata?: { label?: string } }).metadata!.label)
      : undefined) ||
    `${taskKey}${subtype ? `/${subtype}` : ''}`;

  const taskManager = taskExecutor.getTaskManager();
  const parentTask = await taskManager.createTask({
    type: 'task-v2-batch-parent',
    model: 'task-v2-batch',
    provider: 'internal' as any,
    params: {
      metadata: {
        label: `${label}（${parallelCount} 份）`,
        childTaskIds: [],
        parallelTotal: parallelCount,
        scope,
        taskKey,
        subtype: subtype ?? null,
      },
      scope,
      taskKey,
      subtype: subtype ?? null,
    },
    userId: billingUserId,
    storeToMinio: false,
  });
  const parentTaskId = parentTask.taskId;

  const childTasks: TaskRunV2ParallelChild[] = [];
  const childTaskIds: string[] = [];

  const childErrors: string[] = [];

  for (let i = 0; i < parallelCount; i++) {
    try {
      const childParams = allocateVariationParams({
        formSchema: formSchemaForInput,
        baseParams,
        parallelIndex: i,
        parallelTotal: parallelCount,
      });
      const childReq: TaskRunV2Request = { ...req, params: childParams };
      const singleOpts: RunTaskV2SingleOptions = {
        ...options,
        batchContext: { parentTaskId, parallelIndex: i, parallelTotal: parallelCount },
        skipBalanceCheck: i > 0,
        balanceMultiplier: i === 0 ? parallelCount : undefined,
        parallelBatchPrepared: true,
      };
      const childRes = await runTaskV2Single(childReq, userId, singleOpts);
      childTaskIds.push(childRes.taskId);
      childTasks.push({
        taskId: childRes.taskId,
        parallelIndex: i,
        status: childRes.status ?? 'pending',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      childErrors.push(`#${i + 1}: ${msg}`);
      childTasks.push({
        taskId: '',
        parallelIndex: i,
        status: 'failed',
      });
      console.error(`[TaskV2ParallelBatch] 创建子任务 ${i + 1}/${parallelCount} 失败:`, err);
    }
  }

  if (childTaskIds.length === 0) {
    throw new Error(
      `多份任务全部创建失败：${childErrors.join('; ') || 'unknown'}`
    );
  }

  const storage = (taskManager as any).storage;
  if (storage) {
    const parent = await taskManager.getTask(parentTaskId);
    const existingMeta = parent?.task?.metadata ?? {};
    await storage.update(parentTaskId, {
      metadata: {
        ...existingMeta,
        label: `${label}（${parallelCount} 份）`,
        childTaskIds,
        parallelTotal: parallelCount,
        scope,
        taskKey,
        subtype: subtype ?? null,
      },
    });
  }

  return {
    success: true,
    taskId: parentTaskId,
    status: parentTask.status ?? 'pending',
    scope,
    taskKey,
    subtype: subtype ?? null,
    parallel: {
      parentTaskId,
      total: parallelCount,
      tasks: childTasks.filter((t) => t.taskId),
      failedCount: childTasks.filter((t) => !t.taskId).length,
    },
  };
}
