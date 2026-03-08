/**
 * 知识库异步导入任务
 * 参考 graph / video 的 task 设计，但逻辑专注于：
 * - 从存储下载原始文件
 * - 解析 + 分块
 * - 调用 EmbeddingService 生成向量
 * - 写入 knowledge_base_documents
 */

import { taskExecutor } from '../task/task-executor';
import type { TaskManager } from '../task/task-manager';
import { RepositoryFactory } from '@mxmai/mxmdata';
import { KnowledgeService } from './knowledge-service';

export interface KnowledgeImportTaskParams {
  knowledgeBaseId: string;
  knowledgeBaseName?: string; // 保留用于内部处理（文档表使用 name 关联）
  fileBucket: string;
  fileKey: string;
  originalFileName: string;
  mimeType: string;
  userId: string;
  tags?: string[];
  metadata?: Record<string, any>;
  isPublic?: boolean;
  chunkSize?: number; // 每个 chunk 的最大字符数（默认 2000）
  chunkOverlap?: number; // chunk 之间的重叠字符数（默认 200）
  maxChunkSize?: number; // 单个 chunk 的最大字符数（默认 5000）
}

/**
 * 启动知识库导入任务
 * - 从 CGI 任务系统中读取请求参数
 * - 从 MinIO 下载文件
 * - 调用 KnowledgeService.uploadFile 完成解析+入库
 * - 将结果写回 TaskResult.metadata
 */
export async function startKnowledgeImportTask(taskId: string): Promise<void> {
  const taskManager: TaskManager = taskExecutor.getTaskManager();

  try {
    // 获取任务，解析参数
    const taskResponse = await taskManager.getTask(taskId);
    const params = taskResponse.task.requestParams as KnowledgeImportTaskParams;

    if (!params || !params.knowledgeBaseId || !params.fileBucket || !params.fileKey) {
      await taskManager.setTaskError(taskId, '知识库导入任务参数不完整');
      return;
    }

    // 如果只有 id，需要通过 id 获取知识库的 name（因为文档表使用 name 关联）
    let knowledgeBaseName = params.knowledgeBaseName;
    if (!knowledgeBaseName) {
      const knowledgeService = new KnowledgeService();
      const knowledgeBase = await knowledgeService.getKnowledgeBaseById(params.knowledgeBaseId);
      if (!knowledgeBase) {
        await taskManager.setTaskError(taskId, `知识库 ID "${params.knowledgeBaseId}" 不存在`);
        return;
      }
      knowledgeBaseName = knowledgeBase.name;
    }

    // 标记任务排队中
    await taskManager.updateTaskStatus(taskId, 'queued', {
      progress: 0,
      logs: [`知识库导入任务已创建，准备下载文件 (${params.originalFileName})`],
    });

    // 标记处理中
    await taskManager.updateTaskStatus(taskId, 'processing', {
      progress: 5,
      logs: ['开始从存储下载文件'],
      startedAt: new Date(),
    });

    const storageRepo = RepositoryFactory.createStorageRepository();

    // 下载原始文件
    const fileBuffer = await storageRepo.downloadFile(params.fileBucket, params.fileKey);

    await taskManager.updateTaskProgress(taskId, {
      progress: 20,
      logs: ['文件下载完成，开始解析和向量化'],
    });

    // 调用 KnowledgeService 执行解析+embedding+入库
    const knowledgeService = new KnowledgeService();
    const result = await knowledgeService.uploadFile({
      knowledgeBaseName: knowledgeBaseName,
      file: {
        buffer: fileBuffer,
        originalname: params.originalFileName,
        mimetype: params.mimeType,
        size: fileBuffer.length,
      },
      userId: params.userId,
      tags: params.tags,
      metadata: params.metadata,
      isPublic: params.isPublic,
      chunkSize: params.chunkSize,
      chunkOverlap: params.chunkOverlap,
      maxChunkSize: params.maxChunkSize,
    });

    await taskManager.updateTaskProgress(taskId, {
      progress: 95,
      logs: [
        `解析完成，写入文档 ${result.documents.length} 条，chunk 总数 ${result.totalChunks}`,
        '正在写入任务结果',
      ],
    });

    // 将统计信息写入任务结果（不需要 mediaUrls，这里留空数组）
    await taskManager.setTaskResult(taskId, {
      mediaUrls: [],
      metadata: {
        type: 'knowledge-import',
        knowledgeBaseId: params.knowledgeBaseId,
        knowledgeBaseName: knowledgeBaseName,
        documentsCount: result.documents.length,
        totalChunks: result.totalChunks,
        originalFileName: params.originalFileName,
        fileBucket: params.fileBucket,
        fileKey: params.fileKey,
      },
    });
  } catch (error) {
    await taskManager.setTaskError(
      taskId,
      error instanceof Error ? error.message : String(error)
    );
  }
}


