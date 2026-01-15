/**
 * Graph任务处理
 * 处理graph类型任务的执行
 */

import { taskExecutor } from '../task/task-executor';
import { generateGraph } from './graph-service';
import type { PhotographParams, DesignParams, PaintingParams } from './type';
import type { ProviderType } from '../providers/types';

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

    // 5. 调用graph-service生成图片
    console.log(`[GraphTask] 开始调用 generateGraph (graphType: ${graphType}, userId: ${finalUserId})`);
    const result = await generateGraph(
      graphType as 'photograph' | 'design' | 'painting',
      graphParams as PhotographParams | DesignParams | PaintingParams,
      finalUserId,
      provider as ProviderType | undefined
    );
    console.log(`[GraphTask] generateGraph 完成，模型: ${result.modelName}, 图片数量: ${result.image_urls.length}`);
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
        model: result.modelName, // 实际调用的模型：nano-banana 或 seedream-4
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
      }
    }

    // 8. 更新任务结果
    const taskResultMetadata: any = {
      generated_prompt: result.prompt,
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

    // 9. 保存任务结果（会自动设置状态为completed）
    await taskManager.setTaskResult(taskId, taskResult);

    console.log(`[GraphTask] 任务 ${taskId} 完成`);
    console.log(`========== [GraphTask] 任务处理完成 ==========\n`);
  } catch (error) {
    console.error(`[GraphTask] 任务 ${taskId} 执行失败:`, error);
    
    // 更新任务状态为 failed
    await taskManager.setTaskError(
      taskId,
      error instanceof Error ? error.message : String(error)
    );

    throw error;
  }
}
