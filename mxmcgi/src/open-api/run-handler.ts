import type { PublishedApiRecord } from '@mxmai/mxmdata';
import { RepositoryFactory } from '@mxmai/mxmdata';
import { SmartflowEngine } from '../smartflow/core/engine/engine';
import { smartflowRepository } from '../smartflow/core/engine/repository';
import { executionRepository } from '../smartflow/core/engine/executionRepository';
import { runTaskV2 } from '../tasks/task-engine';
import { validateWithJsonSchema } from '../tasks/schema-validator';
import { ValidationError, ConfigurationError } from '../tasks/errors';
import type { JsonSchemaV2, TaskScope } from '../tasks/types';
import { applyFormSchemaDefaults, prepareGraphTaskParams, cloneFormSchemaWithReferenceImageEnrichment } from '../tasks/graph-reference-slots';
import { normalizeParamsBeforeSchemaValidate } from '../tasks/form-param-normalize';
import { taskExecutor } from '../task/task-executor';
import { BATCH_PARENT_TASK_TYPES, getChildTaskIdsFromBatchParent, summarizeBatchChildStatuses } from '../task/batch-parent-aggregate';
import { sanitizeBase64InObject } from '../task/reference-image';
import { pruneDuplicateGraphReferenceFields } from '../tasks/task-http-handlers';
import {
  attachOpenApiContext,
  buildOpenApiRunContext,
  extractOpenApiContext,
  stripOpenApiContext,
} from './context';
import { logOpenApiInvocation } from './usage';
import { mergePlatformFieldsIntoFormSchema } from '../tasks/platform-fields';
import { canUserAccessTask } from './task-access';
import { extractRequestLabelFromParams } from '../task/extract-request-label';

function prepareInputWithSnapshot(
  inputData: Record<string, unknown>,
  snapshot: JsonSchemaV2,
  opts?: { taskKey?: string; subtype?: string | null }
): Record<string, unknown> {
  const hasRefSlots = Object.values((snapshot.properties ?? {}) as Record<string, unknown>).some(
    (sch) => sch && typeof sch === 'object' && (sch as Record<string, unknown>)['x-ui-type'] === 'referenceImages'
  );

  if (hasRefSlots) {
    const enrichedSnapshot = cloneFormSchemaWithReferenceImageEnrichment(snapshot) ?? snapshot;
    const normalized = prepareGraphTaskParams(inputData, enrichedSnapshot, {
      taskKey: opts?.taskKey,
      subtype: opts?.subtype ?? null,
    });
    validateWithJsonSchema(enrichedSnapshot, normalized);
    return normalized;
  }

  const normalized = { ...inputData };
  applyFormSchemaDefaults(normalized as Record<string, any>, snapshot);
  const flattened = normalizeParamsBeforeSchemaValidate(snapshot, normalized);
  validateWithJsonSchema(snapshot, flattened);
  return flattened;
}

export async function loadEnabledPublishedBySlug(slug: string): Promise<PublishedApiRecord> {
  const repo = RepositoryFactory.createPublishedApiRepository();
  const row = await repo.findBySlug(slug);
  if (!row) throw new ConfigurationError(`未找到已发布 API：${slug}`);
  if (!row.is_enabled) throw new ConfigurationError(`已发布 API 已下架：${slug}`);
  return row;
}

export async function runPublishedApi(
  record: PublishedApiRecord,
  callerId: string,
  body: { params?: Record<string, unknown>; input_data?: Record<string, unknown> },
  partner?: { partnerAppId?: string; endUserId?: string }
): Promise<{ jobId: string; kind: 'task_v2' | 'smartflow'; status: string; pollUrl: string }> {
  const pollBase = `/api/v1/open/${record.slug}/jobs`;

  const openCtx = buildOpenApiRunContext(record, callerId, partner);

  if (record.kind === 'task_v2') {
    const scope = record.task_v2_scope as TaskScope;
    const snapshot = mergePlatformFieldsIntoFormSchema(
      record.input_schema_snapshot as JsonSchemaV2,
      scope
    );
    const taskKey = record.task_v2_task_key!;
    const subtype = record.task_v2_subtype ?? undefined;
    const rawParams = (body.params ?? {}) as Record<string, unknown>;
    const params = prepareInputWithSnapshot(rawParams, snapshot, { taskKey, subtype: subtype ?? null });
    const usageTitle =
      extractRequestLabelFromParams(rawParams) ?? record.title?.trim() ?? null;

    const result = await runTaskV2(
      { scope, taskKey, subtype, params },
      callerId,
      { publishedFormSchema: snapshot, openApi: openCtx }
    );

    if (result.parallel?.tasks?.length) {
      for (const child of result.parallel.tasks) {
        await logOpenApiInvocation(record, openCtx, child.taskId, 'task_v2', usageTitle);
      }
    } else {
      await logOpenApiInvocation(record, openCtx, result.taskId, 'task_v2', usageTitle);
    }

    return {
      jobId: result.taskId,
      kind: 'task_v2',
      status: result.status ?? 'pending',
      pollUrl: `${pollBase}/${result.taskId}`,
      ...(result.parallel
        ? {
            parallel: {
              parentTaskId: result.parallel.parentTaskId,
              total: result.parallel.total,
              childTaskIds: result.parallel.tasks.map((t) => t.taskId),
            },
          }
        : {}),
    };
  }

  const inputDataRaw = stripOpenApiContext((body.input_data ?? {}) as Record<string, unknown>);
  const sfSnapshot = record.input_schema_snapshot as JsonSchemaV2;
  const inputData =
    sfSnapshot &&
    typeof sfSnapshot === 'object' &&
    Object.keys(sfSnapshot.properties ?? {}).length > 0
      ? prepareInputWithSnapshot(inputDataRaw, sfSnapshot)
      : inputDataRaw;
  if (
    sfSnapshot &&
    typeof sfSnapshot === 'object' &&
    Object.keys(sfSnapshot.properties ?? {}).length === 0 &&
    Object.keys(sfSnapshot).length > 0 &&
    sfSnapshot.type === 'object'
  ) {
    validateWithJsonSchema(sfSnapshot, inputData);
  }

  const smartflowId = record.smartflow_id!;
  const started = await smartflowEngine.start(smartflowId, {
    smartflow_id: smartflowId,
    user_id: callerId,
    input_data: attachOpenApiContext(inputData, openCtx),
    mode: 'run',
  } as any);

  const execution = started.execution;
  const sfTitle =
    extractRequestLabelFromParams(inputDataRaw) ?? record.title?.trim() ?? null;
  await logOpenApiInvocation(record, openCtx, execution.id, 'smartflow', sfTitle);

  return {
    jobId: execution.id,
    kind: 'smartflow',
    status: execution.status ?? 'pending',
    pollUrl: `${pollBase}/${execution.id}`,
  };
}

export async function getPublishedJobStatus(
  record: PublishedApiRecord,
  jobId: string,
  callerId: string,
  isAdmin: boolean,
  partnerEndUserId?: string
): Promise<unknown> {
  if (record.kind === 'task_v2') {
    const taskManager = taskExecutor.getTaskManager();
    const response = await taskManager.getTask(jobId, isAdmin);
    const ownerId = record.owner_user_id;
    if (
      !isAdmin &&
      !canUserAccessTask(response.task, callerId, {
        publishedOwnerId: ownerId,
        partnerEndUserId,
      })
    ) {
      throw new ValidationError('无权查询该任务');
    }
    const task = response.task;
    const base = {
      ...task,
      requestParams: pruneDuplicateGraphReferenceFields(
        sanitizeBase64InObject(task.requestParams)
      ),
    };
    if (BATCH_PARENT_TASK_TYPES.has(task.type)) {
      const childTaskIds = getChildTaskIdsFromBatchParent(task);
      const { completedCount, failedCount, processingCount } = await summarizeBatchChildStatuses(
        taskManager,
        childTaskIds
      );
      const children: { taskId: string; status: string; progress?: number }[] = [];
      let progressSum = 0;
      for (const id of childTaskIds) {
        try {
          const cr = await taskManager.getTask(id, isAdmin);
          if (cr?.task) {
            const cp =
              typeof cr.task.progress?.progress === 'number' ? cr.task.progress.progress : 0;
            progressSum += cp;
            children.push({ taskId: id, status: cr.task.status, progress: cp });
          }
        } catch {
          children.push({ taskId: id, status: 'unknown' });
        }
      }

      const total = childTaskIds.length;
      let status = task.status;
      let aggregateProgress =
        typeof task.progress?.progress === 'number' ? task.progress.progress : 0;
      if (total > 0) {
        aggregateProgress = Math.round(progressSum / total);
        if (completedCount === total) {
          status = 'completed';
          aggregateProgress = 100;
        } else if (failedCount === total) {
          status = 'failed';
        } else if (processingCount > 0 || completedCount + failedCount < total) {
          status = 'processing';
        }
      }

      return {
        ...base,
        status,
        progress: {
          ...(typeof task.progress === 'object' && task.progress ? task.progress : {}),
          status,
          progress: aggregateProgress,
        },
        parallel: {
          parentTaskId: task.id,
          total: task.metadata?.parallelTotal ?? childTaskIds.length,
          childTaskIds,
          summary: { completedCount, failedCount, processingCount },
          children,
        },
      };
    }
    return base;
  }

  const execution = await executionRepository.findById(jobId);
  if (!execution) throw new ConfigurationError('执行记录不存在');
  const openCtx = extractOpenApiContext(execution.input_data as Record<string, unknown>);
  const taskEndUser = openCtx?.endUserId;
  if (partnerEndUserId && taskEndUser && taskEndUser !== partnerEndUserId) {
    throw new ValidationError('无权查询该执行记录');
  }
  if (
    !isAdmin &&
    execution.user_id !== callerId &&
    openCtx?.callerUserId !== callerId &&
    record.owner_user_id !== callerId
  ) {
    throw new ValidationError('无权查询该执行记录');
  }
  return execution;
}
