/**
 * Writing 异步任务处理
 * 处理写作相关的异步任务（生成、改写、润色）
 */

import { TaskManager } from '../../task/task-manager';
import { taskExecutor } from '../../task/task-executor';
import { UsageService } from '../usage/usage-service';
import { BillingService } from '../billing/billing-service';
import { resolveUsageContextFromTaskMetadata } from '../../statistics/usage-context';
import {
  generateOutline,
  generateWriting,
} from './writing-service';
import type {
  OutlineParams,
  WritingGenerateParams,
} from './type';
import { OUTLINE_APPLY_TO_VALUES } from './type';
import type { TaskContext } from '../../tasks/types';
import { RepositoryFactory } from '@mxmai/mxmdata';
import { getGeneratedBucket } from '../../storage/generated-temp';

/** 写作统一落盘 Markdown 到 MinIO（静态对象存储），供预览/下载；PDF 由 Markdown 即时转换。 */
async function uploadWritingMarkdownToMinio(args: {
  userId?: string;
  taskId: string;
  markdown: string;
}): Promise<{ key: string; bucket: string; url: string } | undefined> {
  const text = args.markdown?.trim();
  if (!text) return undefined;
  const storageRepo = RepositoryFactory.createStorageRepository();
  const bucket = getGeneratedBucket();
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8);
  const uid = args.userId || 'anonymous';
  const key = `${uid}/writing/${timestamp}-${randomStr}.md`;
  await storageRepo.uploadFile(bucket, key, Buffer.from(text, 'utf-8'), {
    contentType: 'text/markdown; charset=utf-8',
    metadata: {
      'user-id': uid,
      format: 'markdown',
      'task-id': args.taskId,
      'word-count': String(text.length),
    },
  });
  const url = await storageRepo.getPresignedUrl(bucket, key, 7 * 24 * 60 * 60);
  return { key, bucket, url };
}

type WritingGenerateResultSlice = {
  text?: string;
  metadata?: Record<string, unknown>;
  storageInfo?: { key?: string; bucket?: string; url?: string };
  format?: string;
};

type PdfStorageRefLike = { key?: string; bucket?: string; url?: string };

/**
 * 将 post markdownToPdf 产出的 sidecar 写入写作结果。
 * mxm-warp 在 runPostPhase 内已跑完 PDF，必须在此合并；否则预览只能落到 Markdown。
 */
export function attachPdfSidecarToWritingResult(
  result: WritingGenerateResultSlice,
  state: Record<string, unknown> | null | undefined
): WritingGenerateResultSlice {
  if (!state || typeof state !== 'object') return result;

  const fromState = (state.markdownToPdfStorage ?? state.renderDocumentPdfStorage) as
    | PdfStorageRefLike
    | undefined;
  const finalMeta =
    state.finalArtifact &&
    typeof state.finalArtifact === 'object' &&
    (state.finalArtifact as { metadata?: unknown }).metadata &&
    typeof (state.finalArtifact as { metadata?: unknown }).metadata === 'object'
      ? ((state.finalArtifact as { metadata: Record<string, unknown> }).metadata)
      : undefined;
  const fromFinal = (finalMeta?.pdfStorage as PdfStorageRefLike | undefined) ?? undefined;
  const pdfStorage =
    fromState?.key && fromState.bucket
      ? fromState
      : fromFinal?.key && fromFinal.bucket
        ? fromFinal
        : undefined;

  const pdfStatus =
    typeof state.markdownToPdfStatus === 'string'
      ? String(state.markdownToPdfStatus)
      : typeof finalMeta?.pdfRenderStatus === 'string'
        ? String(finalMeta.pdfRenderStatus)
        : pdfStorage?.key
          ? 'ok'
          : undefined;
  const pdfError =
    typeof state.markdownToPdfError === 'string'
      ? String(state.markdownToPdfError)
      : typeof finalMeta?.pdfRenderError === 'string'
        ? String(finalMeta.pdfRenderError)
        : undefined;
  const storageMode =
    state.markdownToPdfStorageMode === 'overwrite' ||
    finalMeta?.markdownToPdfStorageMode === 'overwrite'
      ? 'overwrite'
      : 'sidecar';

  const mergedMeta: Record<string, unknown> = {
    ...((result.metadata as Record<string, unknown> | undefined) ?? {}),
  };
  let storageInfo = result.storageInfo;
  let format = result.format ?? (mergedMeta.format ? String(mergedMeta.format) : undefined);

  if (pdfStorage?.key && pdfStatus !== 'failed') {
    if (storageMode === 'overwrite') {
      if (storageInfo?.key) {
        mergedMeta.markdownStorage = storageInfo;
      }
      storageInfo = {
        key: pdfStorage.key,
        bucket: pdfStorage.bucket,
        url: pdfStorage.url,
      };
      format = 'pdf';
      mergedMeta.format = 'pdf';
      mergedMeta.storage_form = 'pdf';
      mergedMeta.reading_format = 'pdf';
    } else {
      mergedMeta.pdfStorage = {
        key: pdfStorage.key,
        bucket: pdfStorage.bucket,
        url: pdfStorage.url,
      };
      mergedMeta.storage_form = 'markdown';
      mergedMeta.format = 'markdown';
      mergedMeta.reading_format = 'pdf';
      format = 'markdown';
    }
    mergedMeta.pdfRenderStatus = 'ok';
    delete mergedMeta.pdfRenderError;
  } else if (pdfStatus === 'failed') {
    mergedMeta.pdfRenderStatus = 'failed';
    if (pdfError) mergedMeta.pdfRenderError = pdfError;
    const warning = `PDF 生成失败：${pdfError || '未知错误'}`;
    const prev = Array.isArray(mergedMeta.warnings)
      ? mergedMeta.warnings.filter((w): w is string => typeof w === 'string')
      : [];
    if (!prev.includes(warning)) mergedMeta.warnings = [...prev, warning];
    mergedMeta.storage_form = 'markdown';
    mergedMeta.format = 'markdown';
    format = 'markdown';
  } else {
    return result;
  }

  return {
    ...result,
    metadata: mergedMeta,
    storageInfo,
    format,
  };
}

/**
 * 将 post renderPptx 产出的 sidecar 写入写作结果。
 */
export function attachPresentationSidecarToWritingResult(
  result: WritingGenerateResultSlice,
  state: Record<string, unknown> | null | undefined
): WritingGenerateResultSlice {
  if (!state || typeof state !== 'object') return result;

  const fromState = (state.presentationStorage ?? state.renderPptxStorage) as
    | PdfStorageRefLike
    | undefined;
  const finalMeta =
    state.finalArtifact &&
    typeof state.finalArtifact === 'object' &&
    (state.finalArtifact as { metadata?: unknown }).metadata &&
    typeof (state.finalArtifact as { metadata?: unknown }).metadata === 'object'
      ? ((state.finalArtifact as { metadata: Record<string, unknown> }).metadata)
      : undefined;
  const fromFinal = (finalMeta?.presentationStorage as PdfStorageRefLike | undefined) ?? undefined;
  const presentationStorage =
    fromState?.key && fromState.bucket
      ? fromState
      : fromFinal?.key && fromFinal.bucket
        ? fromFinal
        : undefined;

  const pptStatus =
    typeof state.renderPptxStatus === 'string'
      ? String(state.renderPptxStatus)
      : typeof finalMeta?.presentationRenderStatus === 'string'
        ? String(finalMeta.presentationRenderStatus)
        : presentationStorage?.key
          ? 'ok'
          : undefined;
  const pptError =
    typeof state.renderPptxError === 'string'
      ? String(state.renderPptxError)
      : typeof finalMeta?.presentationRenderError === 'string'
        ? String(finalMeta.presentationRenderError)
        : undefined;

  const mergedMeta: Record<string, unknown> = {
    ...((result.metadata as Record<string, unknown> | undefined) ?? {}),
  };

  if (presentationStorage?.key && pptStatus !== 'failed') {
    mergedMeta.presentationStorage = {
      key: presentationStorage.key,
      bucket: presentationStorage.bucket,
      url: presentationStorage.url,
    };
    mergedMeta.presentationRenderStatus = 'ok';
    mergedMeta.reading_format = 'pptx';
    // PPTX 成功后主产物语义是演示文稿，避免列表/查看器仍按「写作文集」渲染
    mergedMeta.resultKind = 'presentation-deck';
    delete mergedMeta.presentationRenderError;
    if (typeof finalMeta?.presentationSlideCount === 'number') {
      mergedMeta.presentationSlideCount = finalMeta.presentationSlideCount;
    } else if (typeof state.deckSlideCount === 'number') {
      mergedMeta.presentationSlideCount = state.deckSlideCount;
    } else if (
      typeof mergedMeta.collectionItemCount === 'number' &&
      mergedMeta.presentationSlideCount == null
    ) {
      mergedMeta.presentationSlideCount = mergedMeta.collectionItemCount;
    }
  } else if (pptStatus === 'failed') {
    mergedMeta.presentationRenderStatus = 'failed';
    if (pptError) mergedMeta.presentationRenderError = pptError;
    const warning = `PPTX 生成失败：${pptError || '未知错误'}`;
    const prev = Array.isArray(mergedMeta.warnings)
      ? mergedMeta.warnings.filter((w): w is string => typeof w === 'string')
      : [];
    if (!prev.includes(warning)) mergedMeta.warnings = [...prev, warning];
  } else {
    return result;
  }

  return {
    ...result,
    metadata: mergedMeta,
  };
}

async function applyWritingPostPipelineIfNeeded(args: {
  taskId: string;
  userId: string;
  taskParams: Record<string, unknown>;
  result: WritingGenerateResultSlice;
  taskManager: TaskManager;
}): Promise<{ paused: true } | { paused: false; result: WritingGenerateResultSlice }> {
  const nestedParams = (args.taskParams.params ?? args.taskParams) as Record<string, unknown>;
  const taskV2 = (nestedParams.taskV2 ?? args.taskParams.taskV2) as
    | { scope?: string; taskKey?: string; subtype?: string | null }
    | undefined;
  if (!taskV2?.scope || !taskV2.taskKey) {
    return { paused: false, result: args.result };
  }

  const { loadTaskDefinition } = await import('../../tasks/task-definition');
  const { mergeEffectivePipeline } = await import('../../tasks/business-pipeline-defaults');
  const { buildCoreArtifactFromResult, applyFinalArtifactToGenerateResult } = await import(
    '../../tasks/business-pipeline'
  );
  const {
    runPostPipelineWithCheckpoints,
    persistManualReviewPause,
    buildPersistedParamsForAwaitingReview,
    buildTaskMetadataForAwaitingReview,
  } = await import('../../tasks/manual-review');

  const { row, template } = await loadTaskDefinition({
    scope: taskV2.scope as import('../../tasks/types').TaskScope,
    taskKey: taskV2.taskKey,
    subtype: taskV2.subtype ?? null,
  });

  const { post } = mergeEffectivePipeline(
    taskV2.scope,
    template,
    (row.extra ?? null) as Record<string, unknown> | null
  );
  if (!post.length) {
    return { paused: false, result: args.result };
  }

  const pipelineState = (nestedParams.businessPipelineState ??
    args.taskParams.businessPipelineState) as Record<string, unknown> | undefined;

  const coreArtifact = buildCoreArtifactFromResult(taskV2.scope, {
    text: args.result.text,
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

  if (outcome.kind === 'paused') {
    const execParams = {
      ...(args.taskParams as Record<string, unknown>),
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
      taskType: 'writing',
    });
    const persisted = buildPersistedParamsForAwaitingReview(pausedParams);
    await args.taskManager.updateTaskRequestParams(args.taskId, persisted);

    const taskMeta = (await args.taskManager.getTask(args.taskId))?.task?.metadata ?? {};
    try {
      const storage = (args.taskManager as any).storage;
      if (storage) {
        await storage.update(args.taskId, {
          metadata: buildTaskMetadataForAwaitingReview(
            taskMeta as Record<string, unknown>,
            outcome.gate
          ),
        });
      }
    } catch {
      /* ignore metadata write errors */
    }

    await args.taskManager.updateTaskStatus(args.taskId, 'awaiting_review', {
      progress: 85,
      logs: [`${outcome.gate.label ?? '产出审核'}，等待人工审核`],
    });
    return { paused: true };
  }

  ctx = outcome.ctx;
  const finalArtifact = ctx.state.finalArtifact as import('../../tasks/types').CoreArtifact | undefined;
  const merged = applyFinalArtifactToGenerateResult(finalArtifact, {
    text: args.result.text,
    metadata: {
      ...(args.result.metadata ?? {}),
      pipelineTrace: ctx.state.pipelineTrace,
      pipelineNestedUsage: ctx.state.pipelineNestedUsage,
    },
  });

  return {
    paused: false,
    result: attachPresentationSidecarToWritingResult(
      attachPdfSidecarToWritingResult(
        {
          ...args.result,
          text: merged.text ?? args.result.text,
          metadata: (merged.metadata as Record<string, unknown> | undefined) ?? args.result.metadata,
        },
        ctx.state as Record<string, unknown>
      ),
      ctx.state as Record<string, unknown>
    ),
  };
}

export interface WritingTaskParams {
  taskType: 'outline' | 'generate';
  params: OutlineParams | WritingGenerateParams;
  userId: string;
  provider?: string;
}

/**
 * 执行写作任务
 * 注意：这个函数会被 task-executor 调用，但任务已经在 task-executor 中创建
 * 我们需要从任务中提取参数并执行相应的写作操作
 */
export async function startWritingTask(taskId: string): Promise<void> {
  const taskManager: TaskManager = taskExecutor.getTaskManager();

  try {
    const taskResponse = await taskManager.getTask(taskId);
    // 从 requestParams 中提取 WritingTaskParams
    const taskParams = taskResponse.task.requestParams as any;
    
    // 检查是否是 writing 任务
    if (!taskParams || !taskParams.taskType) {
      await taskManager.setTaskError(taskId, '写作任务参数不完整：缺少 taskType');
      return;
    }

    const params: WritingTaskParams = {
      taskType: taskParams.taskType,
      params: taskParams.params,
      userId: taskParams.userId,
      provider: taskParams.provider,
    };

    if (!params || !params.taskType || !params.userId) {
      await taskManager.setTaskError(taskId, '写作任务参数不完整');
      return;
    }

    // 状态/进度由 TaskExecutor 统一推进（含 deferred 前置）；此处仅追加业务日志，勿硬抬到 25%
    await taskManager.updateTaskProgress(taskId, {
      progress: Math.max(taskResponse.task.progress?.progress ?? 0, 10),
      message: '准备生成…',
      logs: [`开始写作生成，类型: ${params.taskType}`],
    });

    let result: any;

    switch (params.taskType) {
      case 'outline': {
        const outlineParams = params.params as OutlineParams;
        const writingType = outlineParams.writing_type || 'outlines';

        // 参数验证（提前验证，避免任务开始后才发现错误）
        try {
          if (outlineParams.applyto) {
            if (!OUTLINE_APPLY_TO_VALUES.includes(outlineParams.applyto)) {
              throw new Error(`不支持的 applyto 类型: ${outlineParams.applyto}。仅支持: ${OUTLINE_APPLY_TO_VALUES.join(', ')}`);
            }

            // voice-scripts / storyboard-scripts 的 total_duration_seconds 为选填：不填则可在写作时再补充
          }
        } catch (validationError) {
          // 验证失败，立即抛出错误，不继续执行
          throw validationError;
        }

        await taskManager.updateTaskProgress(taskId, {
          progress: 30,
          logs: ['开始生成大纲'],
        });

        const outlineResult = await generateOutline(
          {
            uid: outlineParams.uid,
            prompt: outlineParams.prompt,
            logicalModel: outlineParams.logicalModel,
            maxDepth: outlineParams.maxDepth,
            expectedNodes: outlineParams.expectedNodes,
            total_textcount: outlineParams.total_textcount,
            total_duration_seconds: outlineParams.total_duration_seconds,
            applyto: outlineParams.applyto,
            outline_type: outlineParams.outline_type,
            outline_structure_type: outlineParams.outline_structure_type,
            stance: outlineParams.stance,
            tone: outlineParams.tone,
            speech_rate: outlineParams.speech_rate,
            rhythm: outlineParams.rhythm,
            knowledgeBase: outlineParams.knowledgeBase,
            cast_character_count: outlineParams.cast_character_count,
            language: outlineParams.language,
            useConfiguredPrompt: outlineParams.useConfiguredPrompt,
          },
          params.userId,
          params.provider as any
        );

        await taskManager.updateTaskProgress(taskId, {
          progress: 90,
          logs: ['大纲生成完成'],
        });

        // 注意：生成的角色不会自动保存，用户可以在编辑大纲时手动保存角色
        // 保留 _llmMetadata 用于 Provider 扣费和用户 MXM-TOKEN 扣费
        result = {
          outline: outlineResult.outline,
          metadata: {
            type: writingType, // 使用 writing_type，默认 'outlines'
            uid: outlineParams.uid,
            outline: outlineResult.outline, // 将大纲内容存储在 metadata 中，方便直接返回
            ...(outlineParams.total_duration_seconds != null ? { total_duration_seconds: outlineParams.total_duration_seconds } : {}),
            ...(outlineResult.characters && outlineResult.characters.length > 0
              ? { characters: outlineResult.characters }
              : {}),
          },
          _llmMetadata: (outlineResult as { _llmMetadata?: unknown })._llmMetadata,
        };
        break;
      }

      case 'generate': {
        const generateParams = params.params as WritingGenerateParams;
        const writingType = generateParams.writing_type || 'articles';

        // outlines 类型特殊处理：调用 generateOutline 而不是 generateWriting
        if (writingType === 'outlines') {
          await taskManager.updateTaskProgress(taskId, {
            progress: 30,
            logs: ['开始生成大纲'],
          });

          // 构建 outline 参数
          const outlineParams: OutlineParams = {
            uid: generateParams.metadata?.uid || `outline-${Date.now()}`,
            prompt: generateParams.prompt,
            writing_type: 'outlines',
            maxDepth: (generateParams as any).maxDepth,
            expectedNodes: (generateParams as any).expectedNodes,
            total_textcount: (generateParams as any).total_textcount,
            total_duration_seconds: (generateParams as any).total_duration_seconds ?? ((generateParams as any).total_duration_minutes != null ? (generateParams as any).total_duration_minutes * 60 : undefined),
            applyto: (generateParams as any).applyto,
            outline_type: (generateParams as any).outline_type,
            outline_structure_type: (generateParams as any).outline_structure_type,
            stance: (generateParams as any).stance,
            tone: (generateParams as any).tone,
            speech_rate: (generateParams as any).speech_rate,
            rhythm: (generateParams as any).rhythm,
            knowledgeBase: generateParams.knowledgeBase?.map(kb => ({
              knowledgeBaseId: kb.knowledgeBaseId,
              query: kb.query,
              limit: kb.limit,
            })),
            process_style: generateParams.process_style,
            outputFormat: 'json',
            language: (generateParams as any).language,
          };

          const outlineResult = await generateOutline(
            {
              uid: outlineParams.uid,
              prompt: outlineParams.prompt,
              maxDepth: outlineParams.maxDepth,
              expectedNodes: outlineParams.expectedNodes,
              total_textcount: outlineParams.total_textcount,
              total_duration_seconds: outlineParams.total_duration_seconds,
              applyto: outlineParams.applyto,
              outline_type: outlineParams.outline_type,
              outline_structure_type: outlineParams.outline_structure_type,
              knowledgeBase: outlineParams.knowledgeBase,
              language: outlineParams.language,
            },
            params.userId,
            params.provider as any
          );

          await taskManager.updateTaskProgress(taskId, {
            progress: 90,
            logs: ['大纲生成完成'],
          });

          // outlines 类型返回 JSON 格式，不存储到 MinIO
          // 保留 _llmMetadata 用于 Provider 扣费和用户 MXM-TOKEN 扣费
          result = {
            outline: outlineResult.outline,
            metadata: {
              type: 'outlines',
              uid: outlineParams.uid,
              outline: outlineResult.outline, // 将大纲内容存储在 metadata 中，方便直接返回
              ...(outlineParams.total_duration_seconds != null ? { total_duration_seconds: outlineParams.total_duration_seconds } : {}),
              ...(outlineResult.characters && outlineResult.characters.length > 0
                ? { characters: outlineResult.characters }
                : {}),
            },
            _llmMetadata: (outlineResult as { _llmMetadata?: unknown })._llmMetadata,
          };
          break;
        }

        // mxm-warp：pre→input→enrich→[审核暂停]→output→post
        {
          const nested = (taskParams.params ?? taskParams) as Record<string, unknown>;
          const taskV2 = (nested.taskV2 ?? taskParams.taskV2) as
            | { scope?: string; taskKey?: string; subtype?: string | null }
            | undefined;
          const bps = (nested.businessPipelineState ??
            taskParams.businessPipelineState) as Record<string, unknown> | undefined;
          if (taskV2?.scope && taskV2.taskKey) {
            const { loadTaskDefinition } = await import('../../tasks/task-definition');
            const { detectMxmWarp, executeMxmWarpTask, contractSnapshotFromCtx } = await import(
              '../../tasks/mxm-warp/execute-warp-task'
            );
            const {
              persistManualReviewPause,
              buildPersistedParamsForAwaitingReview,
              buildTaskMetadataForAwaitingReview,
            } = await import('../../tasks/manual-review');
            const { row, template } = await loadTaskDefinition({
              scope: taskV2.scope as import('../../tasks/types').TaskScope,
              taskKey: taskV2.taskKey,
              subtype: taskV2.subtype ?? null,
            });
            if (detectMxmWarp(template, (row.extra ?? null) as Record<string, unknown> | null) || bps?.executionMode === 'mxm-warp') {
              const completedGateIds =
                ((bps?.reviewCheckpoint as { completedGateIds?: string[] } | undefined)
                  ?.completedGateIds ?? []) as string[];
              // 有 warpCursor 则按游标续跑；仅 enrich 成文审核后的旧路径用 output
              const resumeAt: 'start' | 'output' =
                bps?.mxmWarpResumeAt === 'output' && !bps?.warpCursor ? 'output' : 'start';

              await taskManager.updateTaskProgress(taskId, {
                progress: resumeAt === 'output' ? 68 : 12,
                phase: resumeAt === 'output' ? 'output' : 'pre',
                phaseIndex: resumeAt === 'output' ? 3 : 0,
                phaseTotal: 5,
                message:
                  resumeAt === 'output'
                    ? '撰写成稿中…'
                    : completedGateIds.length
                      ? '继续生成…'
                      : '检索资讯中…',
                logs: [
                  resumeAt === 'output'
                    ? 'mxm-warp：审核通过，继续 output/post'
                    : completedGateIds.length
                      ? 'mxm-warp：继续五段业务流'
                      : 'mxm-warp：执行五段业务流',
                ],
              });
              const modelKey =
                (typeof generateParams.logicalModel === 'string' && generateParams.logicalModel.trim()
                  ? generateParams.logicalModel.trim()
                  : '') ||
                String((params as { model?: string }).model || '');
              if (!modelKey) {
                throw new Error('mxm-warp：缺少物理模型 key（logicalModel）');
              }
              const provider = String(params.provider || 'unknown');
              const warpCtx: TaskContext = {
                scope: taskV2.scope,
                taskKey: taskV2.taskKey,
                subtype: taskV2.subtype ?? null,
                userId: params.userId,
                taskId,
                params: {
                  ...generateParams,
                  ...(nested as Record<string, unknown>),
                  // groupItemBatch 等同任务并发步需要宿主模型键
                  model: modelKey,
                  logicalModel: modelKey,
                  provider,
                },
                state: {
                  ...(bps ?? {}),
                  executionMode: 'mxm-warp',
                  // 续跑时清掉「下次从 output」误标记（交互卡续跑应走 cursor）
                  ...(bps?.warpCursor ? { mxmWarpResumeAt: undefined } : {}),
                },
              };
              const reportWarpProgress = async (u: {
                progress: number;
                message: string;
                phase: string;
                phaseIndex: number;
                phaseTotal: number;
              }) => {
                await taskManager.updateTaskProgress(taskId, {
                  progress: u.progress,
                  message: u.message,
                  phase: u.phase,
                  phaseIndex: u.phaseIndex,
                  phaseTotal: u.phaseTotal,
                  logs: [u.message],
                });
              };
              const persistAdminPipelineCheckpoint = async (checkpointCtx: TaskContext) => {
                const { isAdminPipelineDebug } = await import('../../tasks/mxm-warp/evidence');
                if (!isAdminPipelineDebug(checkpointCtx)) return;
                try {
                  const snap = await taskManager.getTask(taskId);
                  const existing = {
                    ...((snap?.task?.requestParams ?? {}) as Record<string, unknown>),
                  };
                  const prevBps = {
                    ...((existing.businessPipelineState as Record<string, unknown> | undefined) ?? {}),
                    ...((bps ?? {}) as Record<string, unknown>),
                  };
                  await taskManager.updateTaskRequestParams(taskId, {
                    ...existing,
                    businessPipelineState: {
                      ...prevBps,
                      pipelineTrace: checkpointCtx.state.pipelineTrace,
                      evidence: checkpointCtx.state.evidence,
                      warpCursor: checkpointCtx.state.warpCursor,
                      contract:
                        contractSnapshotFromCtx(checkpointCtx) ?? checkpointCtx.state.contract,
                      executionMode: 'mxm-warp',
                    },
                  });
                } catch (persistErr) {
                  console.warn('[mxm-warp] admin pipelineTrace 中途落库失败:', persistErr);
                }
              };
              const { ctx: afterWarp, text, usageBag, paused } = await executeMxmWarpTask({
                ctx: warpCtx,
                template,
                modelScope: 'writing',
                modelKey,
                provider,
                resumeAt,
                onProgress: reportWarpProgress,
                onPipelineCheckpoint: persistAdminPipelineCheckpoint,
              });

              if (paused) {
                const isInputGate =
                  paused.gate.kind === 'interactive-card' || paused.gate.kind === 'basic-form';
                const nextResume = isInputGate ? 'start' : 'output';
                const execParams = {
                  ...(taskParams as Record<string, unknown>),
                  businessPipelineState: {
                    ...(bps ?? {}),
                    ...afterWarp.state,
                    executionMode: 'mxm-warp',
                    mxmWarpResumeAt: nextResume,
                    contract: contractSnapshotFromCtx(afterWarp) ?? afterWarp.state.contract,
                  },
                };
                const pausedParams = await persistManualReviewPause({
                  taskId,
                  gate: paused.gate,
                  draft: paused.draft,
                  execParams: execParams as Record<string, any>,
                  taskType: 'writing',
                });
                const persisted = buildPersistedParamsForAwaitingReview(pausedParams);
                await taskManager.updateTaskRequestParams(taskId, persisted);
                const taskMeta = (await taskManager.getTask(taskId))?.task?.metadata ?? {};
                try {
                  const storage = (taskManager as any).storage;
                  if (storage) {
                    await storage.update(taskId, {
                      metadata: buildTaskMetadataForAwaitingReview(
                        taskMeta as Record<string, unknown>,
                        paused.gate
                      ),
                    });
                  }
                } catch {
                  /* ignore */
                }
                // 闸门语义：interactive-card / basic-form = 「我还没开始干活，等你补字段」
                // → 用 awaiting_user_input，与 awaiting_review（已出活等审核）严格区分。
                const pauseStatus: 'awaiting_user_input' | 'awaiting_review' = isInputGate
                  ? 'awaiting_user_input'
                  : 'awaiting_review';
                const pauseProgress = isInputGate ? 20 : 55;
                const pausePhase = isInputGate ? 'pre' : 'enrich';
                const pausePhaseIndex = isInputGate ? 0 : 2;
                const pauseMessage = isInputGate
                  ? `${paused.gate.label ?? '请补全信息'}，等待你输入`
                  : `${paused.gate.label ?? '内容确认'}，等待你确认`;
                const pauseLog = isInputGate
                  ? `${paused.gate.label ?? 'pre 引导'}，等待用户补全后再继续`
                  : `${paused.gate.label ?? 'enrich 审核'}，等待人工审核后再成文`;
                await taskManager.updateTaskStatus(taskId, pauseStatus, {
                  progress: pauseProgress,
                  phase: pausePhase,
                  phaseIndex: pausePhaseIndex,
                  phaseTotal: 5,
                  message: pauseMessage,
                  logs: [pauseLog],
                });
                return;
              }

              await taskManager.updateTaskProgress(taskId, {
                progress: 95,
                phase: 'save',
                phaseIndex: 4,
                phaseTotal: 5,
                message: '保存文稿中…',
                logs: ['mxm-warp：产出完成，保存 Markdown'],
              });
              const storageInfo = await uploadWritingMarkdownToMinio({
                userId: params.userId,
                taskId,
                markdown: text,
              });
              const coreMeta =
                afterWarp.state.coreArtifact &&
                typeof afterWarp.state.coreArtifact === 'object' &&
                (afterWarp.state.coreArtifact as { metadata?: unknown }).metadata &&
                typeof (afterWarp.state.coreArtifact as { metadata?: unknown }).metadata === 'object'
                  ? ((afterWarp.state.coreArtifact as { metadata: Record<string, unknown> }).metadata)
                  : {};
              const collectionMeta: Record<string, unknown> = {};
              if (
                coreMeta.resultKind === 'writing-collection' ||
                coreMeta.resultKind === 'presentation-deck'
              ) {
                if (coreMeta.resultKind === 'writing-collection') {
                  collectionMeta.resultKind = 'writing-collection';
                }
                if (typeof coreMeta.collectionTitle === 'string') {
                  collectionMeta.collectionTitle = coreMeta.collectionTitle;
                }
                if (typeof coreMeta.collectionItemCount === 'number') {
                  collectionMeta.collectionItemCount = coreMeta.collectionItemCount;
                }
                if (typeof coreMeta.collectionReadyCount === 'number') {
                  collectionMeta.collectionReadyCount = coreMeta.collectionReadyCount;
                }
                if (typeof coreMeta.collectionFailedCount === 'number') {
                  collectionMeta.collectionFailedCount = coreMeta.collectionFailedCount;
                }
                if (coreMeta.collectionResult && typeof coreMeta.collectionResult === 'object') {
                  collectionMeta.collectionResult = coreMeta.collectionResult;
                }
                if (coreMeta.assembledFromGroup === true) {
                  collectionMeta.assembledFromGroup = true;
                }
                if (typeof coreMeta.presentationSlideCount === 'number') {
                  collectionMeta.presentationSlideCount = coreMeta.presentationSlideCount;
                }
              }
              result = {
                text,
                format: 'markdown',
                storageInfo,
                metadata: {
                  type: writingType,
                  text,
                  format: 'markdown',
                  storage_form: 'markdown',
                  mxmWarp: true,
                  contract: contractSnapshotFromCtx(afterWarp),
                  pipelineTrace: afterWarp.state.pipelineTrace,
                  evidence: afterWarp.state.evidence,
                  ...collectionMeta,
                },
                _llmMetadata: {
                  usage: usageBag.usage,
                  model: usageBag.model ?? modelKey,
                  provider: usageBag.provider ?? provider,
                },
              };
              // warp 的 post（含 markdownToPdf / renderPptx）已跑完；必须把 sidecar 写入结果
              result = attachPdfSidecarToWritingResult(
                result,
                afterWarp.state as Record<string, unknown>
              );
              result = attachPresentationSidecarToWritingResult(
                result,
                afterWarp.state as Record<string, unknown>
              );
              break;
            }
          }
        }

        // 其他类型使用正常的 generateWriting
        await taskManager.updateTaskProgress(taskId, {
          progress: 10,
          logs: ['开始生成文章'],
        });

        // 创建进度回调函数
        const onProgress = async (progress: number, message: string) => {
          await taskManager.updateTaskProgress(taskId, {
            progress,
            logs: [message],
          });
        };

        // 主存始终 Markdown；PDF 由 post markdownToPdf 以 sidecar 产出
        const writingResult = await generateWriting(
          generateParams,
          params.userId,
          params.provider as any,
          onProgress
        );

        await taskManager.updateTaskProgress(taskId, {
          progress: 95,
          logs: ['文章生成完成'],
        });

        result = {
          text: writingResult.text,
          formattedContent: Buffer.isBuffer(writingResult.formattedContent)
            ? writingResult.formattedContent.toString('base64')
            : writingResult.formattedContent,
          format: writingResult.format,
          storageInfo: writingResult.storageInfo,
          metadata: {
            ...writingResult.metadata,
            type: writingType,
          },
          _llmMetadata: (writingResult as { _llmMetadata?: unknown })._llmMetadata,
        };

        const postOutcome = await applyWritingPostPipelineIfNeeded({
          taskId,
          userId: params.userId,
          taskParams: taskParams as Record<string, unknown>,
          result,
          taskManager,
        });
        if (postOutcome.paused) {
          return;
        }
        result = postOutcome.result;
        break;
      }

      default:
        await taskManager.setTaskError(taskId, `不支持的任务类型: ${params.taskType}`);
        return;
    }

    await taskManager.updateTaskProgress(taskId, {
      progress: 95,
      logs: ['正在保存任务结果'],
    });

    // 对于 outline 任务，将大纲内容直接存储在 metadata 中
    const pdfUrl =
      result.metadata &&
      typeof result.metadata === 'object' &&
      (result.metadata as Record<string, unknown>).pdfStorage &&
      typeof (result.metadata as { pdfStorage?: { url?: string } }).pdfStorage === 'object'
        ? (result.metadata as { pdfStorage?: { url?: string } }).pdfStorage?.url
        : undefined;
    const taskResult: any = {
      mediaUrls: [pdfUrl, result.storageInfo?.url].filter(
        (u): u is string => typeof u === 'string' && u.length > 0
      ),
      metadata: result.metadata || {},
      ...(result.storageInfo ? { storageInfo: result.storageInfo } : {}),
    };

    // 如果是 outline 任务，将 outline 对象也包含在结果中
    if (params.taskType === 'outline' && result.outline) {
      taskResult.metadata.outline = result.outline;
    }
    // 如果 outline 任务包含角色画像，写入 result.metadata.characters
    if (params.taskType === 'outline' && (result as any).metadata?.characters) {
      taskResult.metadata.characters = (result as any).metadata.characters;
    }

    // 文本/Markdown 始终写入 metadata，便于 PDF 预览时重新排版
    if (params.taskType !== 'outline' && result.text) {
      taskResult.metadata.text = result.text;
      if (result.format) {
        taskResult.metadata.format = result.format;
      }
      if (!result.storageInfo && result.formattedContent) {
        taskResult.metadata.formattedContent = result.formattedContent;
      }
    }

    // setTaskResult 内部会调用 updateTaskStatus 发送通知，不需要重复调用
    await taskManager.setTaskResult(taskId, taskResult);

    // 记录 Provider 用量并按 provider_pricing 扣减余额（outline、长文写作等所有带 _llmMetadata 的任务）
    const llmMeta = (result as { _llmMetadata?: { usage?: unknown; model?: string; provider?: string } })._llmMetadata;
    const needsUsageLog = !!llmMeta;
    if (needsUsageLog && llmMeta) {
      const billingScope = params.taskType === 'outline' ? 'outline' : 'writing';
      const usageTaskType = params.taskType === 'outline' ? 'outline' : 'writing';
      const { costUsd } = await UsageService.logProviderUsage({
        taskId,
        userId: params.userId,
        logicalModel: llmMeta.model,
        result: {
          metadata: {
            usage: llmMeta.usage,
            model: llmMeta.model,
            provider: llmMeta.provider,
            taskType: usageTaskType,
          },
        } as any,
        providerOverride: llmMeta.provider as any,
        usageContext: resolveUsageContextFromTaskMetadata(
          (await taskManager.getTask(taskId))?.task?.metadata as Record<string, unknown>
        ),
      });

      // 扣减用户 MXM-TOKEN
      if (params.userId) {
        const usageAny = llmMeta.usage as any;
        const taskSnap = await taskManager.getTask(taskId);
        const taskMeta = (taskSnap?.task?.metadata ?? {}) as Record<string, unknown>;
        try {
          await BillingService.consumeForTask({
            taskId,
            userId: params.userId,
            provider: llmMeta.provider || 'unknown',
            modelKey: llmMeta.model || 'unknown',
            scope: billingScope,
            inputTokens: Number(usageAny?.prompt_tokens ?? usageAny?.input_tokens ?? 0),
            outputTokens: Number(usageAny?.completion_tokens ?? usageAny?.output_tokens ?? 0),
            totalTokens: Number(usageAny?.total_tokens ?? 0),
            requestCount: 1,
            providerCostUsd: costUsd,
            publishedSlug:
              typeof taskMeta.publishedSlug === 'string' ? taskMeta.publishedSlug : undefined,
            publishedApiId:
              typeof taskMeta.publishedApiId === 'string' ? taskMeta.publishedApiId : undefined,
            openApiCallerId:
              typeof taskMeta.openApiCallerId === 'string' ? taskMeta.openApiCallerId : undefined,
          });
        } catch (billingErr) {
          console.warn('[WritingTask] 用户扣费失败:', billingErr instanceof Error ? billingErr.message : String(billingErr));
        }
      }
    }
  } catch (error) {
    await taskManager.setTaskError(
      taskId,
      error instanceof Error ? error.message : String(error)
    );
  }
}

/**
 * outline 独立任务入口
 * 当前实现复用 startWritingTask 内部的 outline 分支，避免重复落库/扣费/通知逻辑。
 */
export async function startOutlineTask(taskId: string): Promise<void> {
  // 为了安全地复用现有编排逻辑，确保 requestParams.taskType 确实是 outline
  const taskManager: TaskManager = taskExecutor.getTaskManager();
  const taskResponse = await taskManager.getTask(taskId);
  const requestParams = taskResponse?.task?.requestParams as any;
  if (!requestParams || requestParams.taskType !== 'outline') {
    throw new Error(`[OutlineTask] task ${taskId} requestParams.taskType 不是 outline`);
  }
  await startWritingTask(taskId);
}

