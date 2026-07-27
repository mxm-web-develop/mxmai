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

async function applyWritingPostPipelineIfNeeded(args: {
  taskId: string;
  userId: string;
  taskParams: Record<string, unknown>;
  result: {
    text?: string;
    metadata?: Record<string, unknown>;
    storageInfo?: { key?: string; bucket?: string; url?: string };
    format?: string;
  };
  taskManager: TaskManager;
}): Promise<{ paused: true } | { paused: false; result: typeof args.result }> {
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

  const pdfStorage = ctx.state.renderDocumentPdfStorage as
    | { key?: string; bucket?: string; url?: string }
    | undefined;

  return {
    paused: false,
    result: {
      ...args.result,
      text: merged.text ?? args.result.text,
      metadata: merged.metadata as Record<string, unknown>,
      storageInfo: pdfStorage?.key
        ? {
            key: pdfStorage.key,
            bucket: pdfStorage.bucket,
            url: pdfStorage.url,
          }
        : args.result.storageInfo,
      format: (merged.metadata as Record<string, unknown> | undefined)?.format
        ? String((merged.metadata as Record<string, unknown>).format)
        : args.result.format,
    },
  };
}

async function writingPostPipelineHasRenderPdf(taskParams: Record<string, unknown>): Promise<boolean> {
  const nestedParams = (taskParams.params ?? taskParams) as Record<string, unknown>;
  const taskV2 = (nestedParams.taskV2 ?? taskParams.taskV2) as
    | { scope?: string; taskKey?: string; subtype?: string | null }
    | undefined;
  if (!taskV2?.scope || !taskV2.taskKey) return false;
  try {
    const { loadTaskDefinition } = await import('../../tasks/task-definition');
    const { mergeEffectivePipeline } = await import('../../tasks/business-pipeline-defaults');
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
    return post.some((s) => s.step === 'renderDocumentPdf');
  } catch {
    return false;
  }
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
              const { ctx: afterWarp, text, usageBag, paused } = await executeMxmWarpTask({
                ctx: warpCtx,
                template,
                modelScope: 'writing',
                modelKey,
                provider,
                resumeAt,
                onProgress: reportWarpProgress,
              });

              if (paused) {
                const nextResume =
                  paused.gate.kind === 'interactive-card' || paused.gate.kind === 'basic-form'
                    ? 'start'
                    : 'output';
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
                await taskManager.updateTaskStatus(taskId, 'awaiting_review', {
                  progress: 55,
                  phase: 'enrich',
                  phaseIndex: 2,
                  phaseTotal: 5,
                  message: `${paused.gate.label ?? '内容确认'}，等待你确认`,
                  logs: [`${paused.gate.label ?? 'enrich 审核'}，等待人工审核后再成文`],
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
              if (coreMeta.resultKind === 'writing-collection') {
                collectionMeta.resultKind = 'writing-collection';
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
                  ...collectionMeta,
                },
                _llmMetadata: {
                  usage: usageBag.usage,
                  model: usageBag.model ?? modelKey,
                  provider: usageBag.provider ?? provider,
                },
              };
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

        const skipCoreMinio = await writingPostPipelineHasRenderPdf(taskParams as Record<string, unknown>);
        const writingResult = await generateWriting(
          {
            ...generateParams,
            ...(skipCoreMinio ? { storeToMinio: false } : {}),
          },
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
    const taskResult: any = {
      mediaUrls: result.storageInfo?.url ? [result.storageInfo.url] : [],
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

