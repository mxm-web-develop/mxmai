/**
 * Graph任务处理
 * 处理graph类型任务的执行
 */

import { taskExecutor } from '../../task/task-executor';
import { generateGraphImage, generateGraphPrompt } from './graph-service';
import { executeGraphToolsHd, isGraphToolsHdBusiness } from './tools/graph-tools-hd';
import type { GraphRuntimeParams } from './type';
import type { ProviderType } from '../providers/types';
import type { TaskManager } from '../../task/task-manager';
import { UsageService } from '../usage/usage-service';
import { BillingService } from '../billing/billing-service';
import { resolveUsageContextFromTaskMetadata } from '../../statistics/usage-context';
import { isCompleteStorageConfig, mediaUrlNeedsObjectStorage } from '../../task/task-result-media-persist';
import { formatGraphPromptFailureForTaskError } from './graph-prompt-errors';
import { maybeScheduleParallelChildRetry } from '../../tasks/parallel-child-retry';
import {
  assertGraphOutputNotReferenceEcho,
  collectGraphReferenceHttpUrls,
} from './graph-reference-echo-guard';
import { getGeneratedBucket } from '../../storage/generated-temp';

function isGraphReferenceImageEmpty(ref: unknown): boolean {
  if (ref == null) return true;
  if (typeof ref === 'string') return !String(ref).trim();
  if (Array.isArray(ref)) return ref.length === 0;
  return false;
}

/** 仅有 product_images 而无 referenceImage 时，合成生图用 referenceImage（与表单槽位内容一致） */
function synthesizeReferenceImageFromProductImages(p: Record<string, any>): void {
  const raw = p.product_images;
  if (!Array.isArray(raw) || raw.length === 0) return;
  const out: Array<{ type: string; content: string; purpose?: string }> = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const content = (item as { content?: unknown }).content;
    if (typeof content !== 'string' || !content.trim()) continue;
    const typeRaw = (item as { type?: unknown }).type;
    const type =
      typeof typeRaw === 'string' && typeRaw.trim() ? String(typeRaw).trim() : 'main-subject';
    const purposeRaw = (item as { purpose?: unknown }).purpose;
    const row: { type: string; content: string; purpose?: string } = { type, content: content.trim() };
    if (typeof purposeRaw === 'string' && purposeRaw.trim()) row.purpose = purposeRaw.trim();
    out.push(row);
  }
  if (out.length > 0) p.referenceImage = out;
}

async function consumeGraphUserBilling(args: {
  taskId: string;
  userId: string;
  effProvider: ProviderType;
  promptGenUsage?: { metadata?: { usage?: unknown; provider?: string; model?: string } };
  promptCostUsd: number;
  graphModelKey: string;
  imageCount: number;
  providerCostUsd: number;
  publishedSlug?: string;
  publishedApiId?: string;
  openApiCallerId?: string;
}): Promise<void> {
  const {
    taskId,
    userId,
    effProvider,
    promptGenUsage,
    promptCostUsd,
    graphModelKey,
    imageCount,
    providerCostUsd,
    publishedSlug,
    publishedApiId,
    openApiCallerId,
  } = args;
  const openApiBilling = {
    ...(publishedSlug ? { publishedSlug } : {}),
    ...(publishedApiId ? { publishedApiId } : {}),
    ...(openApiCallerId ? { openApiCallerId } : {}),
  };
  try {
    if (promptGenUsage?.metadata && promptCostUsd >= 0) {
      const u = promptGenUsage.metadata.usage as Record<string, unknown> | undefined;
      await BillingService.consumeForTask({
        taskId,
        userId,
        provider: (promptGenUsage.metadata.provider as ProviderType) || effProvider,
        modelKey: String(promptGenUsage.metadata.model || 'writing-basic-text'),
        scope: 'writing',
        inputTokens: Number(u?.prompt_tokens ?? u?.input_tokens ?? 0),
        outputTokens: Number(u?.completion_tokens ?? u?.output_tokens ?? 0),
        requestCount: 1,
        providerCostUsd: promptCostUsd,
        ...openApiBilling,
      });
    }
    await BillingService.consumeForTask({
      taskId,
      userId,
      provider: effProvider,
      modelKey: graphModelKey,
      scope: 'graph',
      imageCount,
      requestCount: 1,
      providerCostUsd,
      ...openApiBilling,
    });
  } catch (billingErr) {
    console.warn('[GraphTask] 用户扣费失败:', billingErr instanceof Error ? billingErr.message : String(billingErr));
  }
}

/** 落库前校验：启用 MinIO 时 mediaUrls 不得含 data:/纯 base64（须已是可访问的 http(s)） */
function assertNoInlineGraphMediaUrls(storeToMinio: boolean, mediaUrls: string[], taskIdLabel: string): void {
  if (!storeToMinio) return;
  for (const u of mediaUrls) {
    if (typeof u === 'string' && mediaUrlNeedsObjectStorage(u)) {
      throw new Error(
        `[GraphTask] 禁止将内联媒体写入任务结果（须先成功写入 MinIO URL）${taskIdLabel}`
      );
    }
  }
}

/**
 * 启动Graph任务
 * @param taskId 任务ID
 * @param originalParams 原始参数（可选，如果提供则使用原始参数，否则从数据库读取）
 */
export async function startGraphTask(taskId: string, originalParams?: Record<string, any>): Promise<void> {
  const taskManager = taskExecutor.getTaskManager();

  try {
    console.log(`\n========== [GraphTask] 开始处理任务 ${taskId} ==========`);
    
    // 1. 获取任务
    const taskResponse = await taskManager.getTask(taskId);
    if (!taskResponse || !taskResponse.task) {
      throw new Error(`任务 ${taskId} 不存在`);
    }
    const task = taskResponse.task;
    console.log(`[GraphTask] 任务类型: ${task.type}, graphType: ${task.requestParams?.graphType}, type: ${task.requestParams?.type}`);

    // 状态/进度由 TaskExecutor 统一推进（含 deferred 前置）
    await taskManager.updateTaskProgress(taskId, {
      progress: Math.max(task.progress?.progress ?? 0, 25),
      logs: ['开始图片生成'],
    });
    console.log(`[GraphTask] 进入生图阶段`);

    // 4. 解析任务参数
    // 优先使用原始参数（包含完整的 base64），如果没有则从数据库读取（可能已被清理）
    const requestParams = originalParams || task.requestParams || {};
    
    // 明确提取关键参数
    const graphType = requestParams.graphType as string | undefined;
    const userId = requestParams.userId as string | undefined;
    const provider = requestParams.provider as string | undefined;
    
    // 提取业务参数（排除taskType、graphType、userId、provider）
    // 注意：Task V2 graph 的 briefing 仅保存在 requestParams.params.prompt（顶层不再重复 prompt）；
    // 实际提交给生图 Provider 的英文 prompt 在任务完成后写入 metadata.generated_prompt（仅一份）。
    const innerParams = (requestParams as any).params || {};
    const graphParams: any = {
      ...innerParams,
      ...requestParams,
    };
    delete graphParams.taskType;
    delete graphParams.graphType;
    delete graphParams.userId;
    delete graphParams.provider;

    // 图集编排（group/content-album*）：不调 atlas，post 并发生成内容配图
    {
      const taskV2 = (innerParams.taskV2 ?? (task.metadata as Record<string, unknown> | undefined)?.taskV2) as
        | { scope?: string; taskKey?: string; subtype?: string | null }
        | undefined;
      const graphTaskKey = String(
        taskV2?.taskKey ?? graphParams.graphType ?? graphType ?? ''
      ).trim();
      const graphSubtype =
        typeof graphParams.graphBusinessSubtype === 'string' && graphParams.graphBusinessSubtype.trim()
          ? String(graphParams.graphBusinessSubtype).trim()
          : taskV2?.subtype
            ? String(taskV2.subtype).trim()
            : null;

      let templateExtra: Record<string, unknown> | null = null;
      if (taskV2?.scope && taskV2.taskKey) {
        try {
          const { loadTaskDefinition } = await import('../../tasks/task-definition');
          const { row } = await loadTaskDefinition({
            scope: taskV2.scope as import('../../tasks/types').TaskScope,
            taskKey: taskV2.taskKey,
            subtype: taskV2.subtype ?? null,
          });
          templateExtra = (row.extra ?? null) as Record<string, unknown> | null;
        } catch {
          templateExtra = null;
        }
      }

      const { isAlbumPipelineOrchestrator, extractAlbumSpecPayload, ALBUM_ORCHESTRATOR_MODEL } =
        await import('./album/album-pipeline-orchestrator');

      if (
        isAlbumPipelineOrchestrator({
          graphTaskKey,
          graphSubtype,
          templateExtra,
        })
      ) {
        const finalUserId = userId || (task.metadata as { userId?: string } | undefined)?.userId;
        if (!finalUserId) {
          throw new Error(`缺少 userId：图集编排任务无法计费归属 (taskId: ${taskId})`);
        }
        const { albumSpecJson, title } = extractAlbumSpecPayload(requestParams as Record<string, unknown>);
        await taskManager.updateTaskProgress(taskId, {
          progress: 40,
          logs: [`图集规格已就绪（${title}），进入并发生图…`],
        });
        await taskExecutor.finalizeMediaTaskResult(
          taskId,
          {
            text: albumSpecJson,
            mediaUrls: [],
            metadata: {
              orchestrator: true,
              resultKind: 'image-album',
              model: ALBUM_ORCHESTRATOR_MODEL,
              provider: 'internal',
              albumTitle: title,
            },
          },
          {
            userId: finalUserId,
            modelName: ALBUM_ORCHESTRATOR_MODEL,
            provider: 'internal' as ProviderType,
            // post albumImageBatch 产出后由 processResult 再落父任务 MinIO（须为 true）
            storeToMinio: true,
          }
        );
        console.log(`[GraphTask] 图集编排任务 ${taskId} 已进入后置并发生图管线`);
        return;
      }
    }

    // 展开顺序下，若 requestParams 顶层含 referenceImage: undefined/null/[]，会冲掉 innerParams 里有效参考图，
    // generateGraphImage 将走无图文生图。从内层 params 找回；仍空则用 product_images 合成。
    if (isGraphReferenceImageEmpty(graphParams.referenceImage)) {
      if (!isGraphReferenceImageEmpty(innerParams.referenceImage)) {
        graphParams.referenceImage = innerParams.referenceImage;
        console.warn(
          `[GraphTask] 已从 requestParams.params 恢复 referenceImage（顶层曾被空值覆盖），taskId=${taskId}`
        );
      } else {
        synthesizeReferenceImageFromProductImages(graphParams);
        if (!isGraphReferenceImageEmpty(graphParams.referenceImage)) {
          console.warn(
            `[GraphTask] 已从 product_images 合成 referenceImage（referenceImage 缺失），taskId=${taskId}`
          );
        }
      }
    }

    if (!graphType || typeof graphType !== 'string' || !graphType.trim()) {
      throw new Error(`无效的 graph taskKey（graphType）: ${graphType || 'undefined'}`);
    }

    // Worker 从 DB 读取时参考图槽位可能已被 sanitize 为占位符：与 task-engine 一致再 merge/hydrate 一次
    let formSchema: { properties?: Record<string, unknown> } | undefined;
    try {
      const { loadTaskDefinition } = await import('../../tasks/task-definition');
      const { prepareGraphTaskParams } = await import('../../tasks/graph-reference-slots');
      const graphSubtype =
        typeof graphParams.graphBusinessSubtype === 'string' && graphParams.graphBusinessSubtype.trim()
          ? String(graphParams.graphBusinessSubtype).trim()
          : typeof innerParams.graphBusinessSubtype === 'string'
            ? String(innerParams.graphBusinessSubtype).trim()
            : null;
      const { template } = await loadTaskDefinition({
        scope: 'graph',
        taskKey: String(graphType),
        subtype: graphSubtype,
        lang: 'zh',
      });
      formSchema = template?.formSchema as { properties?: Record<string, unknown> } | undefined;
      if (template?.formSchema) {
        const repaired = prepareGraphTaskParams(graphParams, template.formSchema, {
          taskKey: String(graphType),
          subtype: graphSubtype,
        });
        Object.assign(graphParams, repaired);
        console.log(`[GraphTask] 已执行 prepareGraphTaskParams 修复参考图槽位, taskId=${taskId}`);
      }
    } catch (prepErr) {
      console.warn(
        '[GraphTask] prepareGraphTaskParams 跳过:',
        prepErr instanceof Error ? prepErr.message : prepErr
      );
    }

    // 获取userId（优先从requestParams，其次从task.metadata）
    const finalUserId = userId || task.metadata.userId;
    if (!finalUserId) {
      throw new Error(`缺少 userId：requestParams.userId 与 task.metadata.userId 均为空 (taskId: ${taskId})`);
    }

    try {
      const { hydrateReferenceImageParamsInPlace } = await import('../../task/reference-image');
      await hydrateReferenceImageParamsInPlace(graphParams, finalUserId, formSchema);
      console.log(`[GraphTask] 参考图已预加载为 data URI, taskId=${taskId}`);
    } catch (hydrateErr) {
      throw hydrateErr instanceof Error
        ? hydrateErr
        : new Error(String(hydrateErr));
    }

    const graphSubtype =
      typeof graphParams.graphBusinessSubtype === 'string' && graphParams.graphBusinessSubtype.trim()
        ? String(graphParams.graphBusinessSubtype).trim()
        : null;

    let result: {
      prompt: string;
      image_urls: string[];
      modelName: string;
      knowledgeRecallMetadata?: unknown;
      promptGenerationUsage?: unknown;
      promptGenerationCostUsd?: number;
      gridPromptPlan?: unknown;
      frozenParamsHash?: string;
      hdMetadata?: Record<string, unknown>;
    };

    if (isGraphToolsHdBusiness(String(graphType), graphSubtype)) {
      console.log(`[GraphTask] tools/hd 高清放大链路 (taskId: ${taskId})`);
      await taskManager.updateTaskProgress(taskId, {
        progress: 20,
        logs: ['正在裁切宫格并高清放大...'],
      });
      const hdResult = await executeGraphToolsHd(
        graphParams as Record<string, unknown>,
        provider as ProviderType | undefined
      );
      result = {
        prompt: hdResult.deerapiImagePrompt,
        image_urls: hdResult.image_urls,
        modelName: hdResult.modelName,
        hdMetadata: hdResult.hdMetadata as Record<string, unknown>,
      };
    } else {
      // 5. 调用 graph-service：先生成 prompt，再生图
      console.log(
        `[GraphTask] 开始调用 generateGraphPrompt + generateGraphImage (graphType: ${graphType}, userId: ${finalUserId})`
      );

      await taskManager.updateTaskProgress(taskId, {
        progress: 20,
        logs: ['正在生成图片...'],
      });

      const promptResult = await generateGraphPrompt(
        String(graphType),
        graphParams as GraphRuntimeParams,
        finalUserId,
        provider as ProviderType | undefined,
        taskId,
        task.metadata as Record<string, unknown> | undefined
      );

      const imageResult = await generateGraphImage(
        String(graphType),
        graphParams as GraphRuntimeParams,
        promptResult.prompt,
        provider as ProviderType | undefined,
        finalUserId
      );

      result = {
        prompt: imageResult.deerapiImagePrompt,
        image_urls: imageResult.image_urls,
        modelName: imageResult.modelName,
        knowledgeRecallMetadata: promptResult.knowledgeRecallMetadata,
        promptGenerationUsage: promptResult.promptGenerationUsage,
        promptGenerationCostUsd: promptResult.promptGenerationCostUsd,
        gridPromptPlan: promptResult.gridPromptPlan,
        frozenParamsHash: promptResult.frozenParamsHash,
      };
    }
    console.log(`[GraphTask] generateGraphImage 完成，模型: ${result.modelName}, 图片数量: ${result.image_urls.length}`);
    
    // 图片生成完成后，再次更新进度，确保 updatedAt 被更新
    await taskManager.updateTaskProgress(taskId, {
      progress: 80,
      logs: ['图片生成完成'],
    });
    if (result.knowledgeRecallMetadata) {
      console.log(`[GraphTask] 知识库召回信息: source=${result.knowledgeRecallMetadata.source}, chunks=${result.knowledgeRecallMetadata.totalChunks}`);
    }

    // 6. 更新任务的 metadata：实际模型、graph-type、提交给生图 Provider 的最终 prompt（仅 generated_prompt）
    const graphTypeModel = `graph-${graphType}`;
    // 通过 TaskManager 的底层 storage 更新 metadata（DatabaseTaskStorage 现已支持 metadata 更新）
    const storage = (taskManager as any).storage;
    if (storage) {
      const updatedMetadata: any = {
        ...(task.metadata || {}),
        model: result.modelName,
        'graph-type': graphTypeModel,
        generated_prompt: result.prompt,
      };

      // 添加知识库召回元数据（如果存在）
      if (result.gridPromptPlan) {
        updatedMetadata.grid_prompt_plan = {
          gridN: result.gridPromptPlan.gridN,
          totalCells: result.gridPromptPlan.totalCells,
          outputGrid: result.gridPromptPlan.outputGrid,
          textQa: result.gridPromptPlan.textQa,
        };
      }
      if (result.frozenParamsHash) {
        updatedMetadata.frozenParamsHash = result.frozenParamsHash;
      }
      if (result.hdMetadata) {
        updatedMetadata.hd_upscale = result.hdMetadata;
      }
      updatedMetadata.billing = {
        ...(typeof task.metadata?.billing === 'object' ? task.metadata.billing : {}),
        plannedImageCalls: 1,
      };

      if (result.knowledgeRecallMetadata) {
        updatedMetadata.knowledge_recall = {
          source: result.knowledgeRecallMetadata.source,
          total_chunks: result.knowledgeRecallMetadata.totalChunks,
          avg_similarity: result.knowledgeRecallMetadata.avgSimilarity,
          max_similarity: result.knowledgeRecallMetadata.maxSimilarity,
          min_similarity: result.knowledgeRecallMetadata.minSimilarity,
          chunks_summary: result.knowledgeRecallMetadata.chunks.map(chunk => ({
            title: chunk.title,
            similarity: chunk.similarity,
            preview: chunk.contentPreview,
          })),
          queries: result.knowledgeRecallMetadata.queries.map(q => ({
            query: q.query,
            type: q.type,
            count: q.count,
          })),
        };
      }

      await storage.update(taskId, {
        metadata: updatedMetadata,
      });
    }

    const effProvider = (task.metadata?.provider || provider || 'qhai') as ProviderType;
    let providerCostUsd = 0;
    let promptCostUsd = result.promptGenerationCostUsd ?? 0;
    try {
      // 图像生成 Provider 用量（提示词侧已在 BasicText 内扣费）
      const usageResult = await UsageService.logProviderUsage({
        taskId,
        userId: finalUserId,
        logicalModel: graphTypeModel,
        result: {
          mediaUrls: result.image_urls,
          metadata: { provider: effProvider, model: result.modelName },
        },
        providerOverride: effProvider,
        usageContext: resolveUsageContextFromTaskMetadata(task.metadata as Record<string, unknown>),
      });
      providerCostUsd = usageResult.costUsd;
      console.log(`[GraphTask] Provider 扣费完成 (provider=${effProvider}, image costUsd=${providerCostUsd})`);
    } catch (usageErr) {
      console.error('[GraphTask] Provider 扣费失败（provider 已消耗，但本地未扣减）:', usageErr);
      throw usageErr;
    }

    // 7. 处理MinIO存储（默认启用）
    const storeToMinio = task.metadata.storeToMinio !== false; // 默认true
    /** Task V2 创建任务时常只带 storeToMinio；metadata.storageConfig 可能缺失或为半截对象，须归一化后再上传 */
    let storageConfig:
      | { bucket: string; pathTemplate: string; defaultExt?: string; generatePresignedUrl?: boolean }
      | undefined = isCompleteStorageConfig(task.metadata.storageConfig)
      ? (task.metadata.storageConfig as {
          bucket: string;
          pathTemplate: string;
          defaultExt?: string;
          generatePresignedUrl?: boolean;
        })
      : undefined;
    let finalMediaUrls = result.image_urls;
    let storageInfo: { keys: string[]; bucket: string; urls: string[] } | undefined;

    if (storeToMinio && !isCompleteStorageConfig(storageConfig) && result.image_urls.length > 0) {
      storageConfig = {
        bucket: getGeneratedBucket(),
        pathTemplate: '{userId}/graph/{timestamp}-{randomId}.{ext}',
      };
      console.warn(
        '[GraphTask] metadata.storageConfig 缺失或不完整，已使用默认 MinIO 配置（禁止 base64 直存 cgi_tasks）',
        { taskId, bucket: storageConfig.bucket }
      );
    }

    // 如果启用了MinIO存储或有base64数据，上传到MinIO
    if (storeToMinio && storageConfig && result.image_urls.length > 0) {
      await taskManager.updateTaskProgress(taskId, {
        progress: 90,
        logs: ['图片生成完成，正在上传到存储...'],
      });

      try {
        const { storeFromGenerateResult } = await import('../utils/data-store');
        const generateResult = {
          mediaUrls: result.image_urls,
          metadata: {
            graphType,
            type: (graphParams as any).type,
            model: result.modelName,
          },
        };
        
        const storageResults = await storeFromGenerateResult(
          generateResult,
          storageConfig,
          finalUserId,
          result.modelName
        );

        // 更新mediaUrls为MinIO URL
        finalMediaUrls = storageResults.map(r => {
          let url = r.url;
          // 修复双冒号问题
          url = url.replace(/http:+\/\//g, 'http://');
          url = url.replace(/https:+\/\//g, 'https://');
          return url;
        });

        const keys = storageResults.map(r => r.key);
        const bucket = storageResults[0].bucket;

        storageInfo = {
          keys,
          bucket,
          urls: finalMediaUrls,
        };

        console.log(`[GraphTask] 图片已上传到MinIO (taskId: ${taskId}, count: ${storageResults.length})`);
      } catch (storageErr) {
        console.error('[GraphTask] MinIO 上传失败 (上游已成功生成图片):', {
          taskId,
          error: storageErr instanceof Error ? storageErr.message : String(storageErr),
          bucket: storageConfig?.bucket,
        });
        throw storageErr;
      }
    } else if (storeToMinio && !storageConfig) {
      console.warn('[GraphTask] storeToMinio=true 但 storageConfig 仍为空且无 image_urls，跳过存储');
    }

    // 7.5 宫格裁格 + 像素 QA（一次生图后处理，不二次计费）
    let gridCellsMeta: Array<{
      index: number;
      row: number;
      col: number;
      url: string;
      width: number;
      height: number;
    }> | undefined;
    let gridPixelQa: Record<string, unknown> | undefined;

    const outputGridRaw = (graphParams as Record<string, unknown>).output_grid;
    const { parseOutputGrid } = await import('./grid');
    const parsedGrid = parseOutputGrid(outputGridRaw);
    if (parsedGrid && parsedGrid.gridN > 1 && finalMediaUrls.length > 0) {
      try {
        const { splitGridLayoutImage } = await import('../utils/grid-layout-splitter');
        const { evaluatePixelSimilarity, applyPixelQaDeliveryPolicy, isGridPixelQaBlockDelivery } =
          await import('./grid');
        const split = await splitGridLayoutImage(finalMediaUrls[0], parsedGrid.gridN);
        const cellUrls = split.images;
        gridCellsMeta = cellUrls.map((url, index) => {
          const row = Math.floor(index / parsedGrid.gridN);
          const col = index % parsedGrid.gridN;
          return {
            index,
            row,
            col,
            url,
            width: split.metadata.cellSize.width,
            height: split.metadata.cellSize.height,
          };
        });
        const pixelQa = applyPixelQaDeliveryPolicy(await evaluatePixelSimilarity(cellUrls));
        gridPixelQa = pixelQa as unknown as Record<string, unknown>;
        if (storage && !pixelQa.passed && isGridPixelQaBlockDelivery()) {
          throw new Error(
            `[GraphTask] 宫格像素门禁未通过（${pixelQa.conflicts.length} 对冲突），已阻止交付`
          );
        }
        if (storage) {
          const snap = await taskManager.getTask(taskId);
          if (snap?.task) {
            await storage.update(taskId, {
              metadata: {
                ...(snap.task.metadata || {}),
                gridCells: gridCellsMeta,
                gridPixelQa: pixelQa,
              },
            });
          }
        }
      } catch (gridPostErr) {
        console.warn('[GraphTask] 宫格裁格/像素 QA 失败（不阻断主图交付）:', gridPostErr);
      }
    }

    // 8. 更新任务结果（generated_prompt 仅保留在任务 metadata 中，不重复放入 result.metadata 以减小返回体积）
    const taskResultMetadata: Record<string, unknown> = {
      graphType,
      type: (graphParams as any).type,
    };
    if (gridCellsMeta) taskResultMetadata.gridCells = gridCellsMeta;
    if (gridPixelQa) taskResultMetadata.gridPixelQa = gridPixelQa;

    // 添加知识库召回元数据到任务结果中（如果存在）
    if (result.knowledgeRecallMetadata) {
      taskResultMetadata.knowledge_recall = {
        source: result.knowledgeRecallMetadata.source,
        total_chunks: result.knowledgeRecallMetadata.totalChunks,
        avg_similarity: result.knowledgeRecallMetadata.avgSimilarity,
        max_similarity: result.knowledgeRecallMetadata.maxSimilarity,
        min_similarity: result.knowledgeRecallMetadata.minSimilarity,
        chunks_summary: result.knowledgeRecallMetadata.chunks.map(chunk => ({
          title: chunk.title,
          similarity: chunk.similarity,
          preview: chunk.contentPreview,
        })),
        queries: result.knowledgeRecallMetadata.queries.map(q => ({
          query: q.query,
          type: q.type,
          count: q.count,
        })),
      };
    }

    const proxyMediaPath =
      storeToMinio && storageInfo?.keys?.length
        ? (await import('../../task/media-proxy-url')).graphTaskMediaProxyPath(taskId)
        : undefined;
    const clientMediaUrls = proxyMediaPath ? [proxyMediaPath] : finalMediaUrls;

    const taskResult = {
      mediaUrls: clientMediaUrls,
      metadata: taskResultMetadata,
      storageInfo: storageInfo
        ? {
            ...storageInfo,
            urls: finalMediaUrls,
            proxyUrls: proxyMediaPath ? [proxyMediaPath] : undefined,
          }
        : storageInfo,
    };

    const referenceHttpUrls = collectGraphReferenceHttpUrls(graphParams as Record<string, unknown>);
    assertGraphOutputNotReferenceEcho(finalMediaUrls, referenceHttpUrls, `taskId=${taskId}`);

    // 保存任务结果（会自动设置状态为 completed）
    assertNoInlineGraphMediaUrls(storeToMinio, taskResult.mediaUrls, `taskId=${taskId}`);
    await taskManager.setTaskResult(taskId, taskResult);

    if (finalUserId) {
      const taskMeta = (task.metadata ?? {}) as Record<string, unknown>;
      await consumeGraphUserBilling({
        taskId,
        userId: finalUserId,
        effProvider,
        promptGenUsage: result.promptGenerationUsage,
        promptCostUsd,
        graphModelKey: result.modelName || graphTypeModel,
        imageCount: finalMediaUrls?.length || 1,
        providerCostUsd,
        publishedSlug:
          typeof taskMeta.publishedSlug === 'string' ? taskMeta.publishedSlug : undefined,
        publishedApiId:
          typeof taskMeta.publishedApiId === 'string' ? taskMeta.publishedApiId : undefined,
        openApiCallerId:
          typeof taskMeta.openApiCallerId === 'string' ? taskMeta.openApiCallerId : undefined,
      });
    }

    console.log(`[GraphTask] 任务 ${taskId} 完成`);
    console.log(`========== [GraphTask] 任务处理完成 ==========\n`);
  } catch (error) {
    console.error(`[GraphTask] 任务 ${taskId} 执行失败:`, error);

    const { message, metadataPatch } = formatGraphPromptFailureForTaskError(error);
    if (metadataPatch) {
      try {
        const storage = (taskManager as any).storage;
        const snap = await taskManager.getTask(taskId);
        if (storage && snap?.task) {
          await storage.update(taskId, {
            metadata: {
              ...(snap.task.metadata || {}),
              ...metadataPatch,
            },
          });
        }
      } catch (metaErr) {
        console.warn('[GraphTask] 写入 graph_prompt_failure metadata 失败:', metaErr);
      }
    }

    const snap = await taskManager.getTask(taskId);
    if (snap?.task && (await maybeScheduleParallelChildRetry(taskId, snap.task, message))) {
      console.log(`[GraphTask] 子任务 ${taskId} 将自动重试，暂不标记 failed`);
      return;
    }

    await taskManager.setTaskError(taskId, message);

    throw error;
  }
}
