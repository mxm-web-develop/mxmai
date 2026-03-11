/**
 * Graph任务处理
 * 处理graph类型任务的执行
 */

import { taskExecutor } from '../../task/task-executor';
import { generateGraph } from './graph-service';
import type { PhotographParams, DesignParams, PaintingParams } from './type';
import type { ProviderType } from '../providers/types';
import type { Task } from '../../task/types';
import type { TaskManager } from '../../task/task-manager';
import { UsageService } from '../usage/usage-service';
import { BillingService } from '../billing/billing-service';

/**
 * 启动Graph任务
 * @param taskId 任务ID
 * @param originalParams 原始参数（可选，如果提供则使用原始参数，否则从数据库读取）
 */
export async function startGraphTask(taskId: string, originalParams?: Record<string, any>): Promise<void> {
  const taskManager = taskExecutor.getTaskManager();
  
  // 标记：在九宫格处理失败时，是否已经为父任务保存了原始结果（单张大图）
  let hasSavedFallbackResultForGrid9 = false;

  try {
    console.log(`\n========== [GraphTask] 开始处理任务 ${taskId} ==========`);
    
    // 1. 获取任务
    const taskResponse = await taskManager.getTask(taskId);
    if (!taskResponse || !taskResponse.task) {
      throw new Error(`任务 ${taskId} 不存在`);
    }
    const task = taskResponse.task;
    console.log(`[GraphTask] 任务类型: ${task.type}, graphType: ${task.requestParams?.graphType}, type: ${task.requestParams?.type}`);

    // 2. 更新任务状态为 queued
    await taskManager.updateTaskStatus(taskId, 'queued', {
      progress: 0,
    });

    // 3. 更新任务状态为 processing
    await taskManager.updateTaskStatus(taskId, 'processing', {
      progress: 10,
      startedAt: new Date(),
    });
    console.log(`[GraphTask] 任务状态已更新为 processing`);

    // 4. 解析任务参数
    // 优先使用原始参数（包含完整的 base64），如果没有则从数据库读取（可能已被清理）
    const requestParams = originalParams || task.requestParams || {};
    
    // 明确提取关键参数
    const graphType = requestParams.graphType as string | undefined;
    const taskType = requestParams.taskType as string | undefined;
    const userId = requestParams.userId as string | undefined;
    const provider = requestParams.provider as string | undefined;
    
    // 提取业务参数（排除taskType、graphType、userId、provider）
    const graphParams: any = { ...requestParams };
    delete graphParams.taskType;
    delete graphParams.graphType;
    delete graphParams.userId;
    delete graphParams.provider;

    if (!graphType || !['photograph', 'design', 'painting'].includes(graphType)) {
      throw new Error(`无效的graph类型: ${graphType || 'undefined'}`);
    }

    // 获取userId（优先从requestParams，其次从task.metadata）
    const finalUserId = userId || task.metadata.userId;
    if (!finalUserId) {
      throw new Error(`缺少 userId：requestParams.userId 与 task.metadata.userId 均为空 (taskId: ${taskId})`);
    }

    // 5. 调用graph-service生成图片
    console.log(`[GraphTask] 开始调用 generateGraph (graphType: ${graphType}, userId: ${finalUserId})`);
    
    // 在开始生成图片之前，更新任务进度，确保 updatedAt 被更新
    // 这样任务恢复服务就能知道任务还在处理中
    await taskManager.updateTaskProgress(taskId, {
      progress: 20,
      logs: ['正在生成图片...'],
    });
    
    const result = await generateGraph(
      graphType as 'photograph' | 'design' | 'painting',
      graphParams as PhotographParams | DesignParams | PaintingParams,
      finalUserId,
      provider as ProviderType | undefined,
      taskId
    );
    console.log(`[GraphTask] generateGraph 完成，模型: ${result.modelName}, 图片数量: ${result.image_urls.length}`);
    
    // 图片生成完成后，再次更新进度，确保 updatedAt 被更新
    await taskManager.updateTaskProgress(taskId, {
      progress: 80,
      logs: ['图片生成完成'],
    });
    if (result.knowledgeRecallMetadata) {
      console.log(`[GraphTask] 知识库召回信息: source=${result.knowledgeRecallMetadata.source}, chunks=${result.knowledgeRecallMetadata.totalChunks}`);
    }

    // 6. 更新任务的metadata，设置实际使用的模型、graph-type和最终生成的prompt
    const graphTypeModel = `graph-${graphType}`;
    // 通过 TaskManager 的底层 storage 更新 metadata（DatabaseTaskStorage 现已支持 metadata 更新）
    const storage = (taskManager as any).storage;
    if (storage) {
      const updatedMetadata: any = {
        ...(task.metadata || {}),
        model: result.modelName, // 实际调用的模型：nano-banana-pro 或 seedream-4
        'graph-type': graphTypeModel, // 业务接口类型：graph-photograph, graph-design, graph-painting
        generated_prompt: result.prompt, // 最终整合后给图生成接口的prompt
      };

      // 添加知识库召回元数据（如果存在）
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

    // 6.5 Provider 扣费：生图任务包含一次文字模型（提示词生成）+ 一次图像模型，均需计入
    const effProvider = (task.metadata?.provider || provider || 'deer') as ProviderType;
    let providerCostUsd = 0;
    let promptCostUsd = result.promptGenerationCostUsd ?? 0;
    try {
      // 6.5 图像生成用量与扣费（提示词生成已在 BasicText 中完成 Provider 扣费）
      const usageResult = await UsageService.logProviderUsage({
        taskId,
        userId: finalUserId,
        logicalModel: graphTypeModel,
        result: {
          mediaUrls: result.image_urls,
          metadata: { provider: effProvider, model: result.modelName },
        },
        providerOverride: effProvider,
      });
      providerCostUsd = usageResult.costUsd;
      console.log(`[GraphTask] Provider 扣费完成 (provider=${effProvider}, image costUsd=${providerCostUsd})`);
    } catch (usageErr) {
      console.error('[GraphTask] Provider 扣费失败（provider 已消耗，但本地未扣减）:', usageErr);
      throw usageErr;
    }

    // 7. 处理MinIO存储（默认启用）
    const storeToMinio = task.metadata.storeToMinio !== false; // 默认true
    const storageConfig = task.metadata.storageConfig;
    let finalMediaUrls = result.image_urls;
    let storageInfo: { keys: string[]; bucket: string; urls: string[] } | undefined;

    // 如果启用了MinIO存储或有base64数据，上传到MinIO
    if (storeToMinio && storageConfig && result.image_urls.length > 0) {
      // 检查是否有base64数据
      const hasBase64 = result.image_urls.some(url => url.startsWith('data:'));
      
      if (hasBase64 || storeToMinio) {
        // 更新进度为90%（表示生成完成，正在存储）
        await taskManager.updateTaskProgress(taskId, {
          progress: 90,
          logs: ['图片生成完成，正在上传到存储...'],
        });

        try {
        // 使用data-store工具上传到MinIO
        const { storeFromGenerateResult } = await import('../utils/data-store');
        const generateResult = {
          mediaUrls: result.image_urls,
          metadata: {
            generated_prompt: result.prompt,
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
          console.error('[GraphTask] MinIO 上传失败 (DeerAPI 已成功生成图片):', {
            taskId,
            error: storageErr instanceof Error ? storageErr.message : String(storageErr),
            bucket: storageConfig?.bucket,
          });
          throw storageErr;
        }
      }
    } else if (storeToMinio && !storageConfig) {
      console.warn('[GraphTask] storeToMinio=true 但 storageConfig 为空，跳过 MinIO 上传，将使用 base64 结果');
    }

    // 8. 更新任务结果（generated_prompt 仅保留在任务 metadata 中，不重复放入 result.metadata 以减小返回体积）
    const taskResultMetadata: any = {
      graphType,
      type: (graphParams as any).type,
    };

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

    const taskResult = {
      mediaUrls: finalMediaUrls,
      metadata: taskResultMetadata,
      storageInfo,
    };

    // 9. 检测是否为九宫格模式
    const isGrid9 = (graphParams as any).grid9 === true;
    
    if (isGrid9 && result.image_urls.length > 0) {
      const grid9Split = (graphParams as any).grid9Split !== false; // 默认 true

      // 不切图：不走父任务逻辑，直接返回一张九宫格大图（当前任务完成即可）
      if (!grid9Split) {
        console.log(`[GraphTask] 九宫格模式（不切图）：直接保存九宫格大图结果，不创建子任务`);
        taskResultMetadata.grid9 = true;
        taskResultMetadata.grid9Split = false;
        if ((graphParams as any).grid9Purpose) taskResultMetadata.grid9Purpose = (graphParams as any).grid9Purpose;
        await taskManager.setTaskResult(taskId, {
          ...taskResult,
          metadata: taskResultMetadata,
        });
        // Provider 已在步骤 6.5 扣费，此处仅做用户侧扣费（提示词生成 + 图像生成）
        if (finalUserId) {
          try {
            if (result.promptGenerationUsage?.metadata && promptCostUsd >= 0) {
              const u = result.promptGenerationUsage.metadata.usage as Record<string, unknown> | undefined;
              await BillingService.consumeForTask({
                taskId, userId: finalUserId,
                provider: (result.promptGenerationUsage.metadata.provider as ProviderType) || effProvider,
                modelKey: String(result.promptGenerationUsage.metadata.model || 'writing-basic-text'),
                scope: 'writing',
                inputTokens: Number(u?.prompt_tokens ?? u?.input_tokens ?? 0),
                outputTokens: Number(u?.completion_tokens ?? u?.output_tokens ?? 0),
                requestCount: 1,
                providerCostUsd: promptCostUsd,
              });
            }
            await BillingService.consumeForTask({
              taskId, userId: finalUserId,
              provider: effProvider, modelKey: result.modelName || graphTypeModel,
              scope: 'graph',
              imageCount: result.image_urls?.length || 1,
              requestCount: 1,
              providerCostUsd,
            });
          } catch (billingErr) {
            console.warn('[GraphTask] 用户扣费失败:', billingErr instanceof Error ? billingErr.message : String(billingErr));
          }
        }
        console.log(`========== [GraphTask] 任务处理完成 ==========\n`);
        return;
      }

      // 九宫格处理流程
      console.log(`[GraphTask] 检测到九宫格模式，开始处理九宫格任务`);
      
      // 在开始处理九宫格任务之前，先更新任务的 updatedAt，防止任务恢复服务误判为超时
      // 因为九宫格处理（切割、上传MinIO、创建子任务）可能需要较长时间
      try {
        const storage = (taskManager as any).storage;
        if (storage) {
          await storage.update(taskId, {
            metadata: {
              ...task.metadata,
              grid9: true, // 提前标记为多图任务，让任务恢复服务识别
            },
          });
          console.log(`[GraphTask] 已更新任务 metadata，标记为多图任务，防止任务恢复服务误判`);
        }
      } catch (updateError) {
        console.warn(`[GraphTask] 更新任务 metadata 失败（不影响后续处理）:`, updateError);
      }
      
      try {
        // 父任务用户侧扣费：一次提示词生成 + 一次图像生成（九宫格大图）
        if (finalUserId) {
          try {
            if (result.promptGenerationUsage?.metadata && promptCostUsd >= 0) {
              const u = result.promptGenerationUsage.metadata.usage as Record<string, unknown> | undefined;
              await BillingService.consumeForTask({
                taskId, userId: finalUserId,
                provider: (result.promptGenerationUsage.metadata.provider as ProviderType) || effProvider,
                modelKey: String(result.promptGenerationUsage.metadata.model || 'writing-basic-text'),
                scope: 'writing',
                inputTokens: Number(u?.prompt_tokens ?? u?.input_tokens ?? 0),
                outputTokens: Number(u?.completion_tokens ?? u?.output_tokens ?? 0),
                requestCount: 1,
                providerCostUsd: promptCostUsd,
              });
            }
            await BillingService.consumeForTask({
              taskId, userId: finalUserId,
              provider: effProvider, modelKey: result.modelName || graphTypeModel,
              scope: 'graph',
              imageCount: result.image_urls?.length || 1,
              requestCount: 1,
              providerCostUsd,
            });
          } catch (billingErr) {
            console.warn('[GraphTask] 用户扣费失败:', billingErr instanceof Error ? billingErr.message : String(billingErr));
          }
        }
        // 提取 folderId（如果存在）
        const folderId = (graphParams as any).folderId;
        
        await handleGrid9Task(
          taskId,
          result,
          graphParams,
          graphType,
          finalUserId,
          storageConfig,
          taskManager,
          task,
          folderId, // 传递 folderId 给 handleGrid9Task
          providerCostUsd
        );
        console.log(`[GraphTask] 九宫格任务处理完成`);
        // 九宫格任务处理完成后，父任务状态会在 handleGrid9Task 中更新
        // 这里不需要再次设置任务结果，直接返回
        console.log(`========== [GraphTask] 任务处理完成 ==========\n`);
        return; // 九宫格任务已处理完成，直接返回
      } catch (error) {
        console.error(`[GraphTask] 九宫格任务处理失败:`, error);
        // 如果九宫格处理失败，保存原始任务结果，让用户至少能看到原始大图
        await taskManager.setTaskResult(taskId, taskResult);
        hasSavedFallbackResultForGrid9 = true;
        // Provider 已在步骤 6.5 扣费，此处仅做用户侧扣费（提示词生成 + 图像生成）
        const effProviderGrid9 = (task.metadata?.provider || provider || 'deer') as ProviderType;
        if (finalUserId) {
          try {
            if (result.promptGenerationUsage?.metadata && promptCostUsd >= 0) {
              const u = result.promptGenerationUsage.metadata.usage as Record<string, unknown> | undefined;
              await BillingService.consumeForTask({
                taskId, userId: finalUserId,
                provider: (result.promptGenerationUsage.metadata.provider as ProviderType) || effProviderGrid9,
                modelKey: String(result.promptGenerationUsage.metadata.model || 'writing-basic-text'),
                scope: 'writing',
                inputTokens: Number(u?.prompt_tokens ?? u?.input_tokens ?? 0),
                outputTokens: Number(u?.completion_tokens ?? u?.output_tokens ?? 0),
                requestCount: 1,
                providerCostUsd: promptCostUsd,
              });
            }
            await BillingService.consumeForTask({
              taskId, userId: finalUserId,
              provider: effProviderGrid9, modelKey: result.modelName || graphTypeModel,
              scope: 'graph',
              imageCount: result.image_urls?.length || 1,
              requestCount: 1,
              providerCostUsd,
            });
          } catch (billingErr) {
            console.warn('[GraphTask] 用户扣费失败:', billingErr instanceof Error ? billingErr.message : String(billingErr));
          }
        }
        // 不在这里抛出，让外层 catch 根据标记决定是否将任务标记为 failed
        throw error;
      }
    }

    // 9. 保存任务结果（会自动设置状态为completed）
    await taskManager.setTaskResult(taskId, taskResult);

    // Provider 已在步骤 6.5 扣费，此处仅做用户侧扣费（提示词生成 + 图像生成）
    if (finalUserId) {
      try {
        if (result.promptGenerationUsage?.metadata && promptCostUsd >= 0) {
          const u = result.promptGenerationUsage.metadata.usage as Record<string, unknown> | undefined;
          await BillingService.consumeForTask({
            taskId, userId: finalUserId,
            provider: (result.promptGenerationUsage.metadata.provider as ProviderType) || effProvider,
            modelKey: String(result.promptGenerationUsage.metadata.model || 'writing-basic-text'),
            scope: 'writing',
            inputTokens: Number(u?.prompt_tokens ?? u?.input_tokens ?? 0),
            outputTokens: Number(u?.completion_tokens ?? u?.output_tokens ?? 0),
            requestCount: 1,
            providerCostUsd: promptCostUsd,
          });
        }
        await BillingService.consumeForTask({
          taskId, userId: finalUserId,
          provider: effProvider, modelKey: result.modelName || graphTypeModel,
          scope: 'graph',
          imageCount: finalMediaUrls?.length || 1,
          requestCount: 1,
          providerCostUsd,
        });
      } catch (billingErr) {
        console.warn('[GraphTask] 用户扣费失败:', billingErr instanceof Error ? billingErr.message : String(billingErr));
      }
    }

    console.log(`[GraphTask] 任务 ${taskId} 完成`);
    console.log(`========== [GraphTask] 任务处理完成 ==========\n`);
  } catch (error) {
    console.error(`[GraphTask] 任务 ${taskId} 执行失败:`, error);

    // 特殊情况：九宫格处理失败，但已经为父任务保存了原始结果
    // 此时不再将任务整体标记为 failed，避免出现“有图片但任务失败”的错位状态
    if (hasSavedFallbackResultForGrid9) {
      console.warn(
        `[GraphTask] 九宫格处理失败但已保存原始结果，保持任务结果为 completed，跳过 setTaskError`
      );
      return;
    }

    // 一般情况：更新任务状态为 failed
    await taskManager.setTaskError(
      taskId,
      error instanceof Error ? error.message : String(error)
    );

    throw error;
  }
}

/**
 * 处理九宫格任务
 * 1. 切割图片成9张
 * 2. 上传完整大图和切割后的图片到 MinIO
 * 3. 创建9个子任务
 * 4. 将原始任务转换为 graph-grid9-parent 类型
 */
async function handleGrid9Task(
  originalTaskId: string,
  result: { image_urls: string[]; modelName: string; prompt: string },
  graphParams: any,
  graphType: string,
  userId: string,
  storageConfig: any,
  taskManager: TaskManager,
  originalTask: Task,
  folderId?: string, // 可选的文件夹 ID，用于关联子任务
  providerCostUsd: number = 0 // Provider 已在主流程步骤 6.5 扣费，此处仅用于用户侧 BillingService
): Promise<void> {
  console.log(`[GraphTask] 开始处理九宫格任务 (taskId: ${originalTaskId})`);
  
  try {
    // 1. 切割图片
    const grid9ImageUrl = result.image_urls[0]; // 第一张是九宫格大图
    if (!grid9ImageUrl) {
      throw new Error('九宫格大图不存在');
    }
    
    const { splitGrid9Image } = await import('../utils/grid9-splitter');
    const splitResult = await splitGrid9Image(grid9ImageUrl);
    
    console.log(`[GraphTask] 九宫格图片已切割为 9 张`);
    
    // 2. 上传完整大图到 MinIO（保存到父任务）
    const { storeFromGenerateResult } = await import('../utils/data-store');
    const parentStorageResult = await storeFromGenerateResult(
      {
        mediaUrls: [grid9ImageUrl],
        metadata: {
          generated_prompt: result.prompt,
          graphType,
          type: graphParams.type,
          model: result.modelName,
          grid9: true,
        },
      },
      storageConfig,
      userId,
      result.modelName
    );
    
    const parentImageUrl = parentStorageResult[0].url;
    console.log(`[GraphTask] 完整大图已上传到 MinIO: ${parentImageUrl}`);
    
    // 3. 上传 9 张切割后的图片到 MinIO
    const childStorageResults = await storeFromGenerateResult(
      {
        mediaUrls: splitResult.images,
        metadata: {
          generated_prompt: result.prompt,
          graphType,
          type: graphParams.type,
          model: result.modelName,
          grid9: true,
        },
      },
      storageConfig,
      userId,
      result.modelName
    );
    
    const childImageUrls = childStorageResults.map(r => r.url);
    const childKeys = childStorageResults.map(r => r.key);
    const childBucket = childStorageResults[0].bucket;
    
    console.log(`[GraphTask] 9 张切割图片已上传到 MinIO`);
    
    // 4. 创建 9 个子任务
    const childTaskIds: string[] = [];
    
    for (let i = 0; i < 9; i++) {
      const row = Math.floor(i / 3) + 1;
      const col = (i % 3) + 1;
      
      try {
        // 创建子任务
        const childTask = await taskManager.createTask({
          type: 'graph',
          model: result.modelName,
          provider: graphParams.provider,
          params: {
            ...graphParams,
            grid9: false, // 子任务不是九宫格
            grid9Index: i,
            grid9Position: { row, col },
          },
          userId,
          storeToMinio: true,
          storageConfig,
        });
        
        childTaskIds.push(childTask.taskId);
        
        // 立即设置子任务结果（图片已生成）
        // 子任务需要继承原任务的类型信息，以便前端正确显示
        await taskManager.setTaskResult(childTask.taskId, {
          mediaUrls: [childImageUrls[i]],
          metadata: {
            generated_prompt: result.prompt,
            graphType: graphType, // 继承原任务的 graphType (photograph/design/painting)
            type: graphParams.type, // 继承原任务的 type (comic/portrait/3d等)
            // 继承原任务的其他类型相关字段
            ...(graphParams.comicStyle ? { comicStyle: graphParams.comicStyle } : {}),
            ...(graphParams.panelLayout ? { panelLayout: graphParams.panelLayout } : {}),
            ...(graphParams.style ? { style: graphParams.style } : {}),
            ...(graphParams.tone ? { tone: graphParams.tone } : {}),
            // 九宫格特定字段
            grid9: true,
            grid9Type: 'child',
            parentTaskId: originalTaskId,
            grid9Index: i,
            grid9Position: { row, col },
          },
          storageInfo: {
            keys: [childKeys[i]],
            bucket: childBucket,
            urls: [childImageUrls[i]],
          },
        });
        
        console.log(`[GraphTask] 子任务 ${i + 1}/9 已创建: ${childTask.taskId}`);
        
        // 如果提供了 folderId，将子任务关联到文件夹
        if (folderId) {
          try {
            // 通过 HTTP 请求调用 Gateway API 添加任务到文件夹
            const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3000';
            const response = await fetch(`${GATEWAY_URL}/api/v1/assets/folders/${folderId}/items`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-user-id': userId,
              },
              body: JSON.stringify({ task_id: childTask.taskId }),
            });
            
            if (response.ok) {
              console.log(`[GraphTask] 子任务 ${i + 1}/9 已关联到文件夹: ${folderId}`);
            } else {
              const errorText = await response.text().catch(() => 'Unknown error');
              console.warn(`[GraphTask] 子任务 ${i + 1}/9 关联文件夹失败: ${response.status} ${errorText}`);
            }
          } catch (folderError) {
            console.warn(`[GraphTask] 子任务 ${i + 1}/9 关联文件夹失败:`, folderError);
            // 文件夹关联失败不影响子任务创建，只记录警告
          }
        }
      } catch (error) {
        console.error(`[GraphTask] 创建子任务 ${i + 1}/9 失败:`, error);
        // 如果子任务创建失败，记录错误但继续处理其他子任务
        // 后续可以考虑清理已创建的子任务
      }
    }
    
    if (childTaskIds.length !== 9) {
      console.warn(`[GraphTask] 警告：只创建了 ${childTaskIds.length}/9 个子任务`);
    }
    
    // 5. 将原始任务标记为父任务（使用 grid9Type: 'parent'），并设置为完成状态
    const storage = (taskManager as any).storage;
    if (storage) {
      try {
        // 只更新 metadata 中的 grid9Type 字段，不修改数据库的 type 字段
        // 强制更新为 completed 状态，即使之前被误判为 failed
        await storage.update(originalTaskId, {
          status: 'completed', // 强制设置为完成状态，覆盖之前的 failed 状态
          metadata: {
            ...originalTask.metadata,
            grid9: true,
            grid9Type: 'parent', // 使用 grid9Type 字段标记父任务
            childTaskIds, // 保存9个子任务的ID，用于追踪
            originalGrid9Image: parentImageUrl,
            // 保留原任务的类型信息
            graphType: graphType,
            type: graphParams.type,
          },
          progress: {
            status: 'completed',
            progress: 100,
            completedAt: new Date(),
            error: undefined, // 清除之前的错误信息
          },
          result: {
            mediaUrls: [parentImageUrl],
            metadata: {
              generated_prompt: result.prompt,
              graphType,
              type: graphParams.type,
              grid9: true,
              grid9Type: 'parent', // 在 result.metadata 中也保存，方便前端访问
              childTaskIds,
            },
            storageInfo: {
              keys: [parentStorageResult[0].key],
              bucket: parentStorageResult[0].bucket,
              urls: [parentImageUrl],
            },
          },
        });
        
        console.log(`[GraphTask] 原始任务已标记为父任务 (grid9Type: 'parent')，状态: completed`);
        console.log(`[GraphTask] 子任务ID列表: ${childTaskIds.join(', ')}`);

        // Provider 已在主流程步骤 6.5 扣费，此处仅做用户侧扣费
        const graphTypeModel = `graph-${graphType}`;
        const effProvider = (originalTask.metadata?.provider || graphParams.provider || 'deer') as ProviderType;
        if (userId) {
          try {
            await BillingService.consumeForTask({
              taskId: originalTaskId, userId,
              provider: effProvider, modelKey: result.modelName || graphTypeModel,
              scope: 'graph',
              imageCount: result.image_urls?.length || 1,
              requestCount: 1,
              providerCostUsd,
            });
          } catch (billingErr) {
            console.warn('[GraphTask] 九宫格父任务用户扣费失败:', billingErr instanceof Error ? billingErr.message : String(billingErr));
          }
        }
      } catch (updateError) {
        console.error(`[GraphTask] 更新父任务失败:`, updateError);
        throw updateError; // 重新抛出错误，让上层处理
      }
    } else {
      console.error(`[GraphTask] 错误：无法访问 storage，无法更新父任务`);
      throw new Error('无法访问 storage，无法更新父任务');
    }
    
    console.log(`[GraphTask] 九宫格任务处理完成 (parent: ${originalTaskId}, children: ${childTaskIds.length})`);
  } catch (error) {
    console.error(`[GraphTask] 九宫格任务处理失败:`, error);
    // 如果九宫格处理失败，保持原始任务为 'graph' 类型，不转换
    // 这样用户仍然可以看到原始任务
    throw error;
  }
}
