import type { Request, Response } from 'express';
import { Router } from 'express';
import { taskManager } from '../core/task/task-manager';
import { RepositoryFactory } from '@mxmai/mxmdata';

const router = Router();

/**
 * 通过 CGI Task ID 访问图片内容
 *
 * 路径示例：
 *   GET /media/graph/:taskId
 *
 * 访问约定：
 *   - Gateway 会在请求头中注入 x-user-id（已通过 JWT 认证）
 *   - 这里只做简单的“只能访问自己的任务”校验
 *   - 文件真实位置由 Task.result.storageInfo 中的 bucket + key 决定
 */
router.get('/graph/:taskId', async (req: Request, res: Response) => {
  try {
    const userId = (req.headers['x-user-id'] as string | undefined) || undefined;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Missing x-user-id header',
      });
    }

    const { taskId } = req.params;
    if (!taskId) {
      return res.status(400).json({
        success: false,
        error: 'Missing taskId',
      });
    }

    // 查询任务
    const { task } = await taskManager.getTask(taskId);

    // 权限校验：只能访问自己的任务
    if (task.metadata?.userId && task.metadata.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: You can only access your own media',
      });
    }

    const storageInfo = task.result?.storageInfo;
    if (!storageInfo || !storageInfo.bucket || !storageInfo.keys || storageInfo.keys.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No storage info for this task',
      });
    }

    const bucket = storageInfo.bucket;
    const key = storageInfo.keys[0];

    const storageRepo = RepositoryFactory.createStorageRepository();

    // 下载文件内容（Buffer）
    const fileBuffer = await storageRepo.downloadFile(bucket, key);
    const metadata = await storageRepo.getFileMetadata(bucket, key);

    const contentType =
      metadata?.contentType ||
      (key.endsWith('.png')
        ? 'image/png'
        : key.endsWith('.jpg') || key.endsWith('.jpeg')
        ? 'image/jpeg'
        : key.endsWith('.webp')
        ? 'image/webp'
        : 'application/octet-stream');

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', fileBuffer.length.toString());

    return res.send(fileBuffer);
  } catch (error: any) {
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    console.error('[Media Route] 获取图片失败:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 通过 CGI Task ID 访问视频内容
 *
 * 路径示例：
 *   GET /media/video/:taskId
 *
 * 访问约定：
 *   - Gateway 会在请求头中注入 x-user-id（已通过 JWT 认证）
 *   - 这里只做简单的"只能访问自己的任务"校验
 *   - 文件真实位置由 Task.result.storageInfo 中的 bucket + key 决定
 */
router.get('/video/:taskId', async (req: Request, res: Response) => {
  try {
    const userId = (req.headers['x-user-id'] as string | undefined) || undefined;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Missing x-user-id header',
      });
    }

    const { taskId } = req.params;
    if (!taskId) {
      return res.status(400).json({
        success: false,
        error: 'Missing taskId',
      });
    }

    // 查询任务
    const { task } = await taskManager.getTask(taskId);

    // 权限校验：只能访问自己的任务
    if (task.metadata?.userId && task.metadata.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: You can only access your own media',
      });
    }

    const storageInfo = task.result?.storageInfo;
    if (!storageInfo || !storageInfo.bucket || !storageInfo.keys || storageInfo.keys.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No storage info for this task',
      });
    }

    const bucket = storageInfo.bucket;
    const key = storageInfo.keys[0];

    const storageRepo = RepositoryFactory.createStorageRepository();

    // 下载文件内容（Buffer）
    const fileBuffer = await storageRepo.downloadFile(bucket, key);
    const metadata = await storageRepo.getFileMetadata(bucket, key);

    const contentType =
      metadata?.contentType ||
      (key.endsWith('.mp4')
        ? 'video/mp4'
        : key.endsWith('.webm')
        ? 'video/webm'
        : key.endsWith('.mov')
        ? 'video/quicktime'
        : key.endsWith('.avi')
        ? 'video/x-msvideo'
        : 'application/octet-stream');

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', fileBuffer.length.toString());

    return res.send(fileBuffer);
  } catch (error: any) {
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    console.error('[Media Route] 获取视频失败:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 通过 CGI Task ID 访问音频内容
 *
 * 路径示例：
 *   GET /media/audio/:taskId
 *
 * 访问约定：
 *   - Gateway 会在请求头中注入 x-user-id（已通过 JWT 认证）
 *   - 这里只做简单的"只能访问自己的任务"校验
 *   - 文件真实位置由 Task.result.storageInfo 中的 bucket + key 决定
 */
router.get('/audio/:taskId', async (req: Request, res: Response) => {
  try {
    const userId = (req.headers['x-user-id'] as string | undefined) || undefined;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Missing x-user-id header',
      });
    }

    const { taskId } = req.params;
    if (!taskId) {
      return res.status(400).json({
        success: false,
        error: 'Missing taskId',
      });
    }

    // 查询任务
    const { task } = await taskManager.getTask(taskId);

    // 权限校验：只能访问自己的任务
    if (task.metadata?.userId && task.metadata.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: You can only access your own media',
      });
    }

    const storageInfo = task.result?.storageInfo;
    if (!storageInfo || !storageInfo.bucket || !storageInfo.keys || storageInfo.keys.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No storage info for this task',
      });
    }

    const bucket = storageInfo.bucket;
    const key = storageInfo.keys[0];

    const storageRepo = RepositoryFactory.createStorageRepository();

    // 下载文件内容（Buffer）
    const fileBuffer = await storageRepo.downloadFile(bucket, key);
    const metadata = await storageRepo.getFileMetadata(bucket, key);

    const contentType =
      metadata?.contentType ||
      (key.endsWith('.mp3')
        ? 'audio/mpeg'
        : key.endsWith('.wav')
        ? 'audio/wav'
        : key.endsWith('.flac')
        ? 'audio/flac'
        : key.endsWith('.pcm')
        ? 'audio/pcm'
        : 'application/octet-stream');

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', fileBuffer.length.toString());

    return res.send(fileBuffer);
  } catch (error: any) {
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    console.error('[Media Route] 获取音频失败:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;

