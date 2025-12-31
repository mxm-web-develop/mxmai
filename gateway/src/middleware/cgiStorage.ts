/**
 * CGI 存储中间件
 * 处理 save_to_claude 参数，决定是否保存文件到 minio 和元数据到数据库
 */

import { Request, Response } from 'express';
import { AuthRequest } from './auth';
import { RepositoryFactory } from '@mxmai/mxmdata';
import { getSupabaseClient } from '@mxmai/mxmdata';
import { logger } from '../utils/logger';

interface CgiStorageOptions {
  saveToClaude: boolean;
  mediaType: 'graph' | 'text';
  modelName: string;
  prompt: string;
  params?: Record<string, any>;
  // 配置参数（可选，可通过请求参数或环境变量传入）
  bucket?: string;
  storagePath?: string;
}

/**
 * 下载文件
 */
async function downloadFile(url: string): Promise<Buffer> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    throw new Error(`Failed to download file from ${url}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 保存文件到 minio 并创建媒体记录
 */
async function saveMediaToStorage(
  userId: string,
  imageUrl: string,
  options: CgiStorageOptions
): Promise<string> {
  try {
    const storageRepo = RepositoryFactory.createStorageRepository();
    const supabase = getSupabaseClient();

    // 下载文件
    const fileBuffer = await downloadFile(imageUrl);
    
    // 确定文件类型和扩展名
    const urlMatch = imageUrl.match(/\.(jpg|jpeg|png|gif|webp|mp4|mp3|wav|txt|md)$/i);
    const ext = urlMatch ? urlMatch[1].toLowerCase() : (options.mediaType === 'graph' ? 'jpg' : 'txt');
    const contentType = options.mediaType === 'graph' 
      ? `image/${ext === 'jpg' ? 'jpeg' : ext}`
      : options.mediaType === 'text'
      ? 'text/plain'
      : 'application/octet-stream';
    
    // 生成存储路径
    // 支持通过请求参数或环境变量配置
    const storagePathPrefix = options.storagePath || process.env.CGI_STORAGE_PATH || 'media';
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    const key = `${storagePathPrefix}/${userId}/${options.mediaType}/${timestamp}-${random}.${ext}`;
    const bucket = options.bucket || process.env.CGI_STORAGE_BUCKET || 'user-media';

    // 上传到 minio
    const uploadResult = await storageRepo.uploadFile(bucket, key, fileBuffer, {
      contentType,
      metadata: {
        userId,
        mediaType: options.mediaType,
        modelName: options.modelName,
      },
    });

    // 保存元数据到数据库
    const { error: dbError } = await supabase
      .from('user_media')
      .insert({
        user_id: userId,
        type: options.mediaType === 'graph' ? 'photo' : 'text',
        assets_type: contentType,
        label: options.prompt.substring(0, 255) || 'Generated content',
        url: uploadResult.url,
        task_id: `${options.modelName}-${timestamp}`,
        description: `Generated using ${options.modelName}`,
        prompts_meta: JSON.stringify({
          model: options.modelName,
          prompt: options.prompt,
          params: options.params,
        }),
      });

    if (dbError) {
      logger.error('Failed to save media metadata:', dbError);
      throw new Error(`Failed to save media metadata: ${dbError.message}`);
    }

    return uploadResult.url;
  } catch (error) {
    logger.error('Failed to save media to storage:', error);
    throw error;
  }
}

/**
 * 只保存元数据（不保存文件）
 */
async function saveMetadataOnly(
  userId: string,
  imageUrl: string,
  options: CgiStorageOptions
): Promise<void> {
  try {
    const supabase = getSupabaseClient();

    // 保存元数据到数据库（使用原始 URL）
    const { error: dbError } = await supabase
      .from('user_media')
      .insert({
        user_id: userId,
        type: options.mediaType === 'graph' ? 'photo' : 'text',
        assets_type: 'external-url',
        label: options.prompt.substring(0, 255) || 'Generated content',
        url: imageUrl,
        task_id: `${options.modelName}-${Date.now()}`,
        description: `Generated using ${options.modelName} (external URL)`,
        prompts_meta: JSON.stringify({
          model: options.modelName,
          prompt: options.prompt,
          params: options.params,
        }),
      });

    if (dbError) {
      logger.error('Failed to save media metadata:', dbError);
      throw new Error(`Failed to save media metadata: ${dbError.message}`);
    }
  } catch (error) {
    logger.error('Failed to save metadata:', error);
    throw error;
  }
}

/**
 * 创建响应拦截器，用于在代理响应返回后处理存储
 */
export function createCgiStorageHandler(req: AuthRequest): {
  onProxyRes: (proxyRes: any, req: Request, res: Response) => void;
} {
  return {
    onProxyRes: (proxyRes: any, req: Request, res: Response) => {
      // 只处理成功的响应
      if (proxyRes.statusCode !== 200) {
        return;
      }

      // 检查是否有 save_to_claude 参数
      // 无论 save_to_claude 是 true 还是 false，都需要保存元数据到数据库
      // 如果为 true，还需要下载文件并保存到 minio
      // 如果为 false，只保存元数据（使用原始 URL），文件直接返回给用户
      const saveToClaude = (req as AuthRequest).body?.save_to_claude === true;
      const hasSaveParam = (req as AuthRequest).body?.hasOwnProperty('save_to_claude');
      
      // 如果没有设置 save_to_claude 参数，不处理（不保存任何内容）
      if (!hasSaveParam) {
        return;
      }

      const mediaType = req.path.includes('/graph') ? 'graph' : 'text';
      const modelName = req.params.modelName || 'unknown';
      const prompt = (req as AuthRequest).body?.prompt || '';
      const params = (req as AuthRequest).body;
      
      // 从请求参数中提取配置（如果提供）
      const storageConfig = {
        bucket: (req as AuthRequest).body?.storage_bucket,
        storagePath: (req as AuthRequest).body?.storage_path,
      };

      // 读取响应体（从代理响应流中读取）
      const chunks: Buffer[] = [];
      const originalWrite = res.write.bind(res);
      const originalEnd = res.end.bind(res);

      // 拦截写入到客户端的响应
      res.write = function (chunk: any, encoding?: any) {
        if (chunk) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
        }
        return originalWrite(chunk, encoding);
      };

      // 拦截结束
      res.end = function (chunk?: any, encoding?: any) {
        if (chunk) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
        }

        // 异步处理存储（不阻塞响应）
        setImmediate(() => {
          try {
            // 解析响应体
            const responseBody = Buffer.concat(chunks).toString('utf-8');
            const body = JSON.parse(responseBody);

            // 如果响应成功且有结果
            if (body && body.success && body.result) {
              const result = body.result;
              const imageUrls = result.image_urls || (result.mediaUrls || []);

              // 如果有图片 URL 且用户已认证
              if (imageUrls.length > 0 && (req as AuthRequest).user) {
              const userId = (req as AuthRequest).user!.userId;
              const options: CgiStorageOptions = {
                saveToClaude,
                mediaType,
                modelName,
                prompt,
                params,
                // 配置参数（从请求参数传入，如果未提供则使用环境变量或默认值）
                bucket: storageConfig.bucket,
                storagePath: storageConfig.storagePath,
              };

                // 异步处理存储（不阻塞响应）
                Promise.all(
                  imageUrls.map((url: string) => {
                    if (saveToClaude) {
                      return saveMediaToStorage(userId, url, options);
                    } else {
                      return saveMetadataOnly(userId, url, options);
                    }
                  })
                )
                  .then((savedUrls) => {
                    if (saveToClaude && savedUrls.length > 0) {
                      logger.info(`Saved ${savedUrls.length} media files to storage for user ${userId}`);
                    } else {
                      logger.info(`Saved metadata for ${imageUrls.length} media items for user ${userId}`);
                    }
                  })
                  .catch((error) => {
                    logger.error('Failed to save media:', error);
                    // 不中断响应，只记录错误
                  });
              }
            }
          } catch (error) {
            // 如果不是 JSON 响应，忽略
            logger.debug('Response is not JSON, skipping storage handling');
          }
        });

        return originalEnd(chunk, encoding);
      };
    },
  };
}
