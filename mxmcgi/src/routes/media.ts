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
 * 通过 CGI Task ID 访问写作内容
 *
 * 路径示例：
 *   GET /media/writing/:taskId
 *
 * 访问约定：
 *   - Gateway 会在请求头中注入 x-user-id（已通过 JWT 认证）
 *   - 这里只做简单的"只能访问自己的任务"校验
 *   - 文件真实位置由 Task.result.storageInfo 中的 bucket + key 决定
 */
router.get('/writing/:taskId', async (req: Request, res: Response) => {
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

    const storageInfo = task.result?.storageInfo as any; // 使用 any 以支持不同的 storageInfo 格式
    const taskMetadata = task.result?.metadata || task.metadata || {};
    
    let content: string | Buffer | undefined;
    let contentType: string | undefined;
    let filename: string | undefined;

    // 优先从 MinIO 获取内容
    // 支持两种格式：{ key, bucket, url } 或 { keys: [], bucket, urls: [] }
    if (storageInfo && storageInfo.bucket) {
      let key: string | undefined;
      
      // 检查是否有 keys 数组（新格式）
      if (storageInfo.keys && Array.isArray(storageInfo.keys) && storageInfo.keys.length > 0) {
        key = storageInfo.keys[0];
      }
      // 检查是否有 key 字符串（旧格式）
      else if (storageInfo.key && typeof storageInfo.key === 'string') {
        key = storageInfo.key;
      }
      
      if (key) {
        const bucket = storageInfo.bucket;
        filename = key.split('/').pop() || 'content';

        const storageRepo = RepositoryFactory.createStorageRepository();

        // 下载文件内容（Buffer）
        const fileBuffer = await storageRepo.downloadFile(bucket, key);
        const fileMetadata = await storageRepo.getFileMetadata(bucket, key);

        contentType =
          fileMetadata?.contentType ||
          (key.endsWith('.md')
            ? 'text/markdown; charset=utf-8'
            : key.endsWith('.txt')
            ? 'text/plain; charset=utf-8'
            : key.endsWith('.pdf')
            ? 'application/pdf'
            : 'text/plain; charset=utf-8');

        content = fileBuffer;
      }
    } 
    // 如果没有 storageInfo，从 metadata 中获取文本内容
    // 优先级：formattedContent > text
    if (!content && taskMetadata.formattedContent) {
      const formattedContent = taskMetadata.formattedContent;
      
      // 判断是否是 base64 编码
      // base64 字符串特征：
      // 1. 只包含 A-Z, a-z, 0-9, +, /, = 字符（去除空白字符后）
      // 2. 长度是 4 的倍数（去除空白字符后）
      // 3. 不包含 markdown 格式字符（如 #, *, -, ` 等）
      const cleanedContent = typeof formattedContent === 'string' 
        ? formattedContent.replace(/\s/g, '') 
        : '';
      
      const isBase64 = typeof formattedContent === 'string' && 
        formattedContent.length > 100 &&
        cleanedContent.length > 0 &&
        /^[A-Za-z0-9+/=]+$/.test(cleanedContent) &&
        cleanedContent.length % 4 === 0 &&
        !formattedContent.includes('#') && // markdown 标题
        !formattedContent.includes('*') && // markdown 强调
        !formattedContent.includes('`') && // markdown 代码
        !formattedContent.includes('[') && // markdown 链接
        !formattedContent.includes('---'); // markdown 分隔符
      
      if (isBase64) {
        try {
          // 尝试 base64 解码
          const decoded = Buffer.from(formattedContent, 'base64');
          const decodedStr = decoded.toString('utf-8');
          // 验证解码后的内容是否是有效的文本（包含可打印字符）
          if (decodedStr && decodedStr.length > 0 && /[\x20-\x7E\u4e00-\u9fa5]/.test(decodedStr)) {
            content = decodedStr;
            console.log('[Media] 从 base64 解码 formattedContent 成功，长度:', decodedStr.length);
          } else {
            // 解码后不是有效文本，使用原字符串
            content = formattedContent;
            console.log('[Media] base64 解码后不是有效文本，使用原字符串');
          }
        } catch (error) {
          // base64 解码失败，直接使用原字符串
          console.warn('[Media] base64 解码失败，使用原字符串:', error);
          content = formattedContent;
        }
      } else {
        // 不是 base64，直接使用字符串
        content = formattedContent;
        console.log('[Media] formattedContent 不是 base64，直接使用，长度:', content.length);
      }
      
      const format = taskMetadata.format || 'markdown';
      contentType =
        format === 'markdown'
          ? 'text/markdown; charset=utf-8'
          : format === 'txt'
          ? 'text/plain; charset=utf-8'
          : format === 'pdf'
          ? 'application/pdf'
          : 'text/plain; charset=utf-8';
      
      filename = `content.${format === 'markdown' ? 'md' : format === 'txt' ? 'txt' : format === 'pdf' ? 'pdf' : 'txt'}`;
    } 
    // 最后尝试从 metadata.text 获取（如果 formattedContent 不存在或为空）
    if (!content && taskMetadata.text) {
      content = taskMetadata.text;
      const format = taskMetadata.format || 'markdown';
      contentType =
        format === 'markdown'
          ? 'text/markdown; charset=utf-8'
          : 'text/plain; charset=utf-8';
      filename = `content.${format === 'markdown' ? 'md' : 'txt'}`;
      console.log('[Media] 从 metadata.text 获取内容，长度:', content.length);
    } 
    // 如果都没有，返回 404
    if (!content || !contentType || !filename) {
      return res.status(404).json({
        success: false,
        error: 'No content found for this task',
      });
    }

    // 确保 content 是 Buffer
    const contentBuffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8');

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', contentBuffer.length.toString());
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

    return res.send(contentBuffer);
  } catch (error: any) {
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    console.error('[Media Route] 获取写作内容失败:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 更新写作内容
 *
 * 路径示例：
 *   PUT /media/writing/:taskId
 *
 * 请求体：
 *   {
 *     "content": "新的 Markdown 文本" | [] (JSON 数组，当 format 为 json 时),
 *     "format": "markdown" | "txt" | "pdf" | "json" (可选，默认 markdown)
 *   }
 *
 * 说明：
 *   - 支持三种存储方式：
 *     1. 大纲 JSON（format: "json"）：更新 task.result.metadata.outline
 *     2. MinIO 存储（task.result.storageInfo）：覆盖 MinIO 文件
 *     3. 直接存储文本（task.result.metadata.formattedContent/text）：更新 metadata 中的文本内容
 *   - 不会修改任务状态，仅更新内容
 */
router.put('/writing/:taskId', async (req: Request, res: Response) => {
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

    const { content, format } = req.body as {
      content?: string | any[]; // 可以是字符串或 JSON 数组（大纲）
      format?: 'markdown' | 'txt' | 'pdf' | 'json';
    };

    if (content === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing field: content',
      });
    }

    // 查询任务
    const { task } = await taskManager.getTask(taskId);

    // 权限校验：只能访问自己的任务
    if (task.metadata?.userId && task.metadata.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: You can only update your own media',
      });
    }

    const existingResult = task.result || {
      mediaUrls: [],
      metadata: {},
    };
    const storageInfo = existingResult.storageInfo as any;

    // 情况 1：大纲 JSON 更新（format === 'json'）
    if (format === 'json') {
      // content 应该是 JSON 数组或对象
      if (!Array.isArray(content) && (typeof content !== 'object' || content === null)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid field: content must be a JSON array or object when format is "json"',
        });
      }

      // 更新大纲到 metadata
      // 如果 content 是数组，取第一个元素作为根大纲；如果是对象，直接使用
      const outline = Array.isArray(content) && content.length > 0 ? content[0] : content;

      const updatedMetadata = {
        ...existingResult.metadata,
        outline: outline,
        updatedAt: new Date().toISOString(),
      };

      await taskManager.setTaskResult(taskId, {
        ...existingResult,
        metadata: updatedMetadata,
      });

      return res.json({
        success: true,
        data: {
          storageType: 'outline',
          outline: outline,
        },
      });
    }

    // 情况 2：文本内容更新
    if (typeof content !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Invalid field: content must be a string when format is not "json"',
      });
    }

    const normalizedFormat: 'markdown' | 'txt' | 'pdf' =
      format === 'txt' || format === 'pdf' ? format : 'markdown';

    // 情况 2.1：有 MinIO 存储，覆盖 MinIO 文件
    if (storageInfo && storageInfo.bucket) {
      let key: string | undefined;

      // 检查是否有 keys 数组（新格式）
      if (storageInfo.keys && Array.isArray(storageInfo.keys) && storageInfo.keys.length > 0) {
        key = storageInfo.keys[0];
      }
      // 检查是否有 key 字符串（旧格式）
      else if (storageInfo.key && typeof storageInfo.key === 'string') {
        key = storageInfo.key;
      }

      if (!key) {
        return res.status(400).json({
          success: false,
          error: 'This writing task has no storage key, cannot update content',
        });
      }

      const bucket = storageInfo.bucket as string;
      const storageRepo = RepositoryFactory.createStorageRepository();

      const contentType =
        normalizedFormat === 'markdown'
          ? 'text/markdown; charset=utf-8'
          : normalizedFormat === 'txt'
          ? 'text/plain; charset=utf-8'
          : 'application/pdf';

      const buffer = Buffer.from(content, 'utf-8');

      await storageRepo.uploadFile(bucket, key, buffer, {
        contentType,
      });

      return res.json({
        success: true,
        data: {
          bucket,
          key,
          size: buffer.length,
          contentType,
          storageType: 'minio',
        },
      });
    }

    // 情况 2.2：没有 MinIO 存储，更新任务 metadata 中的文本内容
    // 计算内容大小
    const contentSize = Buffer.byteLength(content, 'utf-8');
    const wordCount = content.length; // 简单统计字符数

    // 更新 metadata
    const updatedMetadata = {
      ...existingResult.metadata,
      formattedContent: content,
      text: content, // 同时更新 text 字段以保持兼容
      format: normalizedFormat,
      wordCount,
      fileSize: contentSize,
      updatedAt: new Date().toISOString(),
    };

    // 使用 setTaskResult 更新任务结果（保留原有的 storageInfo 和 mediaUrls）
    await taskManager.setTaskResult(taskId, {
      ...existingResult,
      metadata: updatedMetadata,
    });

    return res.json({
      success: true,
      data: {
        size: contentSize,
        contentType:
          normalizedFormat === 'markdown'
            ? 'text/markdown; charset=utf-8'
            : normalizedFormat === 'txt'
            ? 'text/plain; charset=utf-8'
            : 'application/pdf',
        storageType: 'metadata',
        wordCount,
      },
    });
  } catch (error: any) {
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    console.error('[Media Route] 更新写作内容失败:', error);
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

