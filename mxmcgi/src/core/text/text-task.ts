/**
 * Text 异步任务（带 post pipeline：人工审核 + nestedVideo 等）
 */
import type { TaskManager } from "../../task/task-manager";
import { taskExecutor } from "../../task/task-executor";
import { runByModelKey } from "../../models/run";
import type { GenerateResult } from "../providers/types";
import { resolveTextModel } from "./text-model-routing";
import { buildLogicalModel } from "../../routes/business-bundle";
import type { TaskContext } from "../../tasks/types";

function extractText(result: GenerateResult): string {
  const t = (result as { text?: string }).text;
  if (typeof t === "string" && t.trim()) return t;
  const mt = result.metadata?.text;
  if (typeof mt === "string" && mt.trim()) return mt;
  return "";
}

async function applyTextPostPipelineIfNeeded(args: {
  taskId: string;
  userId: string;
  taskParams: Record<string, unknown>;
  result: { text?: string; metadata?: Record<string, unknown>; mediaUrls?: string[] };
  taskManager: TaskManager;
}): Promise<{ paused: true } | { paused: false; result: typeof args.result }> {
  const nestedParams = (args.taskParams.params ?? args.taskParams) as Record<string, unknown>;
  const taskV2 = (nestedParams.taskV2 ?? args.taskParams.taskV2) as
    | { scope?: string; taskKey?: string; subtype?: string | null }
    | undefined;
  if (!taskV2?.scope || !taskV2.taskKey) return { paused: false, result: args.result };

  const { loadTaskDefinition } = await import("../../tasks/task-definition");
  const { mergeEffectivePipeline } = await import("../../tasks/business-pipeline-defaults");
  const { buildCoreArtifactFromResult, applyFinalArtifactToGenerateResult } = await import(
    "../../tasks/business-pipeline"
  );
  const {
    runPostPipelineWithCheckpoints,
    persistManualReviewPause,
    buildPersistedParamsForAwaitingReview,
    buildTaskMetadataForAwaitingReview,
  } = await import("../../tasks/manual-review");

  const { row, template } = await loadTaskDefinition({
    scope: taskV2.scope as import("../../tasks/types").TaskScope,
    taskKey: taskV2.taskKey,
    subtype: taskV2.subtype ?? null,
  });

  const { post } = mergeEffectivePipeline(
    taskV2.scope,
    template,
    (row.extra ?? null) as Record<string, unknown> | null
  );
  if (!post.length) return { paused: false, result: args.result };

  const pipelineState = (nestedParams.businessPipelineState ??
    args.taskParams.businessPipelineState) as Record<string, unknown> | undefined;

  const coreArtifact = buildCoreArtifactFromResult(taskV2.scope, {
    text: args.result.text,
    mediaUrls: args.result.mediaUrls,
    metadata: args.result.metadata,
  });

  let ctx: TaskContext = {
    scope: taskV2.scope,
    taskKey: taskV2.taskKey,
    subtype: taskV2.subtype ?? null,
    userId: args.userId,
    taskId: args.taskId,
    params: { ...nestedParams, metadata: args.result.metadata },
    state: {
      ...(pipelineState ?? {}),
      coreArtifact,
      finalArtifact: coreArtifact,
      _formSchema: template.formSchema,
    },
  };

  const outcome = await runPostPipelineWithCheckpoints({
    ctx,
    template,
    scope: taskV2.scope,
    rowExtra: (row.extra ?? null) as Record<string, unknown> | null,
  });

  if (outcome.kind === "paused") {
    const execParams = {
      ...args.taskParams,
      businessPipelineState: {
        ...(pipelineState ?? {}),
        ...outcome.ctx.state,
        pendingPostResult: args.result,
        businessPipelinePostDeferred: true,
      },
    };
    const pausedParams = await persistManualReviewPause({
      taskId: args.taskId,
      gate: outcome.gate,
      draft: outcome.draft,
      execParams: execParams as Record<string, any>,
      taskType: "text",
    });
    const persisted = buildPersistedParamsForAwaitingReview(pausedParams);
    await args.taskManager.updateTaskRequestParams(args.taskId, persisted);

    const taskMeta = (await args.taskManager.getTask(args.taskId))?.task?.metadata ?? {};
    const storage = (args.taskManager as { storage?: { update: Function } }).storage;
    if (storage) {
      await storage.update(args.taskId, {
        metadata: buildTaskMetadataForAwaitingReview(
          taskMeta as Record<string, unknown>,
          outcome.gate
        ),
      });
    }
    await args.taskManager.updateTaskStatus(args.taskId, "awaiting_review", {
      progress: 85,
      logs: ["等待人工审核…"],
    });
    return { paused: true };
  }

  const merged = applyFinalArtifactToGenerateResult(
    taskV2.scope,
    outcome.ctx.state.finalArtifact as import("../../tasks/types").CoreArtifact,
    args.result as GenerateResult
  );

  return {
    paused: false,
    result: {
      text: merged.text ?? args.result.text,
      mediaUrls: merged.mediaUrls ?? args.result.mediaUrls,
      metadata: merged.metadata as Record<string, unknown>,
    },
  };
}

export async function startTextTask(
  taskId: string,
  originalParams?: Record<string, unknown>
): Promise<void> {
  const taskManager = taskExecutor.getTaskManager();
  const taskResponse = await taskManager.getTask(taskId);
  if (!taskResponse?.task) throw new Error(`任务 ${taskId} 不存在`);

  const task = taskResponse.task;
  const requestParams = (originalParams || task.requestParams || {}) as Record<string, unknown>;
  const pipelineState = (requestParams.businessPipelineState ?? {}) as Record<string, unknown>;
  const userId =
    (requestParams.userId as string) ||
    (task.metadata?.userId as string) ||
    (task.metadata?.billingUserId as string) ||
    "";

  if (pipelineState.businessPipelinePostDeferred === true && pipelineState.pendingPostResult) {
    const pending = pipelineState.pendingPostResult as {
      text?: string;
      metadata?: Record<string, unknown>;
      mediaUrls?: string[];
    };
    const resumed = await applyTextPostPipelineIfNeeded({
      taskId,
      userId,
      taskParams: requestParams,
      result: pending,
      taskManager,
    });
    if (resumed.paused) return;

    await taskManager.setTaskResult(taskId, {
      mediaUrls: resumed.result.mediaUrls ?? [],
      metadata: {
        ...task.metadata,
        ...resumed.result.metadata,
        text: resumed.result.text,
      },
    });
    return;
  }

  await taskManager.updateTaskStatus(taskId, "processing", { progress: 15, startedAt: new Date() });

  const innerParams = (requestParams.params ?? requestParams) as Record<string, unknown>;
  const taskV2 = (requestParams.taskV2 ?? innerParams.taskV2) as
    | { scope?: string; taskKey?: string; subtype?: string | null }
    | undefined;
  if (!taskV2?.taskKey) throw new Error("text 任务缺少 taskV2.taskKey");

  const prompt =
    (typeof requestParams.prompt === "string" && requestParams.prompt.trim()) ||
    (typeof innerParams.prompt === "string" && innerParams.prompt.trim()) ||
    "";
  if (!prompt) throw new Error("text 任务缺少 prompt");

  const resolved = await resolveTextModel(taskV2.taskKey, taskV2.subtype ?? undefined);
  const routingKey = buildLogicalModel("text", taskV2.taskKey, taskV2.subtype ?? undefined);

  const result = await runByModelKey(
    "text",
    resolved.modelName,
    {
      prompt,
      useConfiguredPrompt: true,
      logicalModel: routingKey,
      outputFormat: "json",
    },
    { providerOverride: resolved.provider as any }
  );

  const text = extractText(result);
  const genResult = {
    text,
    metadata: { ...result.metadata, text, model: resolved.modelName, provider: resolved.provider },
    mediaUrls: result.mediaUrls,
  };

  await taskManager.updateTaskProgress(taskId, { progress: 70, logs: ["文本生成完成，执行后置管线…"] });

  const postOutcome = await applyTextPostPipelineIfNeeded({
    taskId,
    userId,
    taskParams: requestParams,
    result: genResult,
    taskManager,
  });

  if (postOutcome.paused) return;

  await taskManager.setTaskResult(taskId, {
    mediaUrls: postOutcome.result.mediaUrls ?? [],
    metadata: {
      ...task.metadata,
      ...postOutcome.result.metadata,
      text: postOutcome.result.text ?? text,
    },
  });
}
