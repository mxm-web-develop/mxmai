/**
 * 资源管理相关路由（文件夹管理）
 */

import '../config/loadEnv';
import { Router } from 'express';
import { RepositoryFactory, getSupabaseClient } from '@mxmai/mxmdata';
import { authMiddleware } from '../middleware/auth';
import { NotFoundError, DuplicateError, DataAccessError } from '@mxmai/mxmdata';

const router = Router();
const folderRepo = RepositoryFactory.createFolderRepository();
const supabase = getSupabaseClient();

/**
 * 清理并验证 UUID 格式
 */
function cleanAndValidateUUID(id: string | undefined): string | null {
  if (!id) return null;
  
  // 移除首尾空白字符和可能的引号
  let cleaned = id.trim().replace(/^["']+|["']+$/g, '');
  
  // 验证 UUID 格式
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(cleaned)) {
    return null;
  }
  
  return cleaned;
}

/**
 * GET /api/v1/assets/folders
 * 获取文件夹列表
 */
router.get('/folders', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const parentId = req.query.parent_id as string | undefined;

    const folders = await folderRepo.getFolders(userId, {
      parent_id: parentId === '' ? null : parentId,
    });

    // 确保返回数组（即使表不存在也返回空数组）
    const folderList = Array.isArray(folders) ? folders : [];

    res.json({
      code: 200,
      message: '获取文件夹列表成功',
      data: {
        folders: folderList,
        total: folderList.length,
      },
    });
  } catch (error: any) {
    // 如果是表不存在的错误，返回空数组而不是 500 错误
    if (error instanceof DataAccessError && 
        (error.message?.includes("Could not find the table") || 
         error.message?.includes("does not exist") ||
         error.originalError?.message?.includes("Could not find the table"))) {
      return res.json({
        code: 200,
        message: '获取文件夹列表成功',
        data: {
          folders: [],
          total: 0,
        },
      });
    }
    next(error);
  }
});

/**
 * POST /api/v1/assets/folders
 * 创建文件夹
 */
router.post('/folders', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const { name, parent_id } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({
        code: 400,
        message: '文件夹名称不能为空',
        error: 'VALIDATION_ERROR',
      });
    }

    // 如果指定了 parent_id，验证父文件夹存在且属于该用户
    if (parent_id) {
      const parentFolder = await folderRepo.getFolderById(parent_id);
      if (!parentFolder) {
        return res.status(404).json({
          code: 404,
          message: '父文件夹不存在',
          error: 'NOT_FOUND',
        });
      }
      if (parentFolder.user_id !== userId) {
        return res.status(403).json({
          code: 403,
          message: '无权限访问父文件夹',
          error: 'PERMISSION_DENIED',
        });
      }
    }

    const folder = await folderRepo.createFolder(userId, {
      name: name.trim(),
      parent_id: parent_id || null,
    });

    res.status(201).json({
      code: 201,
      message: '创建文件夹成功',
      data: folder,
    });
  } catch (error) {
    if (error instanceof DuplicateError) {
      return res.status(409).json({
        code: 409,
        message: '文件夹名称已存在',
        error: 'DUPLICATE_ERROR',
      });
    }
    next(error);
  }
});

/**
 * PUT /api/v1/assets/folders/:id
 * 更新文件夹
 */
router.put('/folders/:id', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const folderId = cleanAndValidateUUID(req.params.id);
    
    if (!folderId) {
      return res.status(400).json({
        code: 400,
        message: `无效的文件夹 ID 格式: ${req.params.id}`,
        error: 'VALIDATION_ERROR',
      });
    }
    const { name } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({
        code: 400,
        message: '文件夹名称不能为空',
        error: 'VALIDATION_ERROR',
      });
    }

    const folder = await folderRepo.updateFolder(userId, folderId, {
      name: name.trim(),
    });

    res.json({
      code: 200,
      message: '更新文件夹成功',
      data: folder,
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return res.status(404).json({
        code: 404,
        message: '文件夹不存在',
        error: 'NOT_FOUND',
      });
    }
    if (error instanceof DuplicateError) {
      return res.status(409).json({
        code: 409,
        message: '文件夹名称已存在',
        error: 'DUPLICATE_ERROR',
      });
    }
    if (error instanceof DataAccessError && error.type === 'PERMISSION_ERROR') {
      return res.status(403).json({
        code: 403,
        message: '无权限操作此文件夹',
        error: 'PERMISSION_DENIED',
      });
    }
    next(error);
  }
});

/**
 * DELETE /api/v1/assets/folders/:id
 * 删除文件夹
 */
router.delete('/folders/:id', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const folderId = cleanAndValidateUUID(req.params.id);
    
    if (!folderId) {
      return res.status(400).json({
        code: 400,
        message: `无效的文件夹 ID 格式: ${req.params.id}`,
        error: 'VALIDATION_ERROR',
      });
    }

    await folderRepo.deleteFolder(userId, folderId);

    res.json({
      code: 200,
      message: '删除文件夹成功',
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return res.status(404).json({
        code: 404,
        message: '文件夹不存在',
        error: 'NOT_FOUND',
      });
    }
    if (error instanceof DataAccessError) {
      if (error.type === 'PERMISSION_ERROR') {
        return res.status(403).json({
          code: 403,
          message: '无权限操作此文件夹',
          error: 'PERMISSION_DENIED',
        });
      }
      if (error.type === 'VALIDATION_ERROR') {
        return res.status(400).json({
          code: 400,
          message: error.message || '无法删除包含子文件夹的文件夹',
          error: 'VALIDATION_ERROR',
        });
      }
    }
    next(error);
  }
});

/**
 * GET /api/v1/assets/folders/:id/items
 * 获取文件夹中的所有内容（子文件夹和文件）
 * 嵌套路由：返回当前文件夹下的所有子文件夹和文件
 */
router.get('/folders/:id/items', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const folderId = cleanAndValidateUUID(req.params.id);
    
    if (!folderId) {
      return res.status(400).json({
        code: 400,
        message: `无效的文件夹 ID 格式: ${req.params.id}`,
        error: 'VALIDATION_ERROR',
      });
    }
    
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

    // 验证文件夹存在且属于该用户
    const folder = await folderRepo.getFolderById(folderId);
    if (!folder) {
      return res.status(404).json({
        code: 404,
        message: '文件夹不存在',
        error: 'NOT_FOUND',
      });
    }
    if (folder.user_id !== userId) {
      return res.status(403).json({
        code: 403,
        message: '无权限访问此文件夹',
        error: 'PERMISSION_DENIED',
      });
    }

    // 1. 获取当前文件夹下的子文件夹列表
    let subFolders: any[] = [];
    try {
      const folders = await folderRepo.getFolders(userId, {
        parent_id: folderId,
      });
      subFolders = (folders || []).map((f) => ({
        id: f.id,
        name: f.name,
        parent_id: f.parent_id,
        type: 'dir', // 文件夹类型
        created_at: f.created_at,
        updated_at: f.updated_at,
      }));
    } catch (error) {
      // 如果获取子文件夹失败，继续处理文件
      console.warn('[文件夹] 获取子文件夹失败:', error);
    }

    // 2. 获取文件夹中的任务 ID 列表
    let taskIds: string[] = [];
    try {
      taskIds = await folderRepo.getFolderItemIds(folderId, {
        limit,
        offset,
      });
    } catch (error) {
      // 如果获取任务列表失败，继续处理
      console.warn('[文件夹] 获取任务列表失败:', error);
    }

    // 3. 获取任务详情（从 cgi-tasks 表）
    let fileItems: any[] = [];
    if (taskIds && taskIds.length > 0) {
      const { data: tasks, error: tasksError } = await supabase
        .from('cgi_tasks')
        .select('id, user_id, task_type, status, prompt, created_at, metadata')
        .in('id', taskIds)
        .eq('user_id', userId);

      if (!tasksError && tasks) {
        fileItems = tasks.map((task: any) => {
          // 从 metadata 或 prompt 中提取标题
          const title = task.metadata?.title || 
                       task.prompt?.substring(0, 50) || 
                       `任务 ${task.id.substring(0, 8)}`;
          
          return {
            id: task.id,
            task_id: task.id, // 任务 ID
            user_id: task.user_id,
            name: title,
            type: 'file', // 文件类型
            task_type: task.task_type, // 'text' | 'image' | 'video' | 'audio'
            status: task.status,
            created_at: task.created_at,
          };
        });
      }
    }

    // 4. 合并文件夹和文件，按创建时间排序
    const allItems = [...subFolders, ...fileItems].sort((a, b) => {
      const timeA = new Date(a.created_at || 0).getTime();
      const timeB = new Date(b.created_at || 0).getTime();
      return timeB - timeA; // 最新的在前
    });

    // 5. 计算总数（子文件夹数量 + 文件数量）
    let totalFiles = 0;
    try {
      totalFiles = await folderRepo.getFolderItemCount(folderId);
    } catch (error) {
      // 如果获取文件总数失败，使用当前文件数量
      totalFiles = fileItems.length;
    }
    const total = subFolders.length + totalFiles;

    res.json({
      code: 200,
      message: '获取文件夹内容成功',
      data: {
        items: allItems,
        total,
        folders_count: subFolders.length,
        files_count: fileItems.length,
      },
    });
  } catch (error: any) {
    // 如果是表不存在的错误，返回空数组而不是 500 错误
    if (error instanceof DataAccessError && 
        (error.message?.includes("Could not find the table") || 
         error.message?.includes("does not exist") ||
         error.originalError?.message?.includes("Could not find the table"))) {
      return res.json({
        code: 200,
        message: '获取文件夹内容成功',
        data: {
          items: [],
          total: 0,
          folders_count: 0,
          files_count: 0,
        },
      });
    }
    next(error);
  }
});

/**
 * POST /api/v1/assets/folders/:id/items
 * 添加任务到文件夹
 * 
 * 直接使用 task_id（任务 ID），不再依赖 user_media 表
 */
router.post('/folders/:id/items', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const folderId = cleanAndValidateUUID(req.params.id);
    
    if (!folderId) {
      return res.status(400).json({
        code: 400,
        message: `无效的文件夹 ID 格式: ${req.params.id}`,
        error: 'VALIDATION_ERROR',
      });
    }
    
    // 检查请求体是否存在
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({
        code: 400,
        message: '请求体不能为空，请确保 Content-Type 为 application/json',
        error: 'VALIDATION_ERROR',
      });
    }
    
    const { task_id } = req.body;

    if (!task_id || typeof task_id !== 'string') {
      return res.status(400).json({
        code: 400,
        message: '任务 ID (task_id) 不能为空',
        error: 'VALIDATION_ERROR',
      });
    }

    // 验证文件夹存在且属于该用户
    const folder = await folderRepo.getFolderById(folderId);
    if (!folder) {
      return res.status(404).json({
        code: 404,
        message: '文件夹不存在',
        error: 'NOT_FOUND',
      });
    }
    if (folder.user_id !== userId) {
      return res.status(403).json({
        code: 403,
        message: '无权限操作此文件夹',
        error: 'PERMISSION_DENIED',
      });
    }

    // 验证任务存在且属于该用户（查询 cgi-tasks 表）
    const { data: task, error: taskError } = await supabase
      .from('cgi_tasks')
      .select('id, user_id')
      .eq('id', task_id)
      .eq('user_id', userId)
      .single();

    if (taskError || !task) {
      return res.status(404).json({
        code: 404,
        message: `未找到任务 ID "${task_id}" 或该任务不属于当前用户`,
        error: 'NOT_FOUND',
      });
    }

    // 直接使用 task_id 添加到文件夹
    await folderRepo.addItemToFolder(folderId, task_id);

    res.status(201).json({
      code: 201,
      message: '添加任务到文件夹成功',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/assets/folders/:id/items/:taskId
 * 从文件夹移除任务
 * 
 * 直接使用 task_id（任务 ID），不再依赖 user_media 表
 */
router.delete('/folders/:id/items/:taskId', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const folderId = cleanAndValidateUUID(req.params.id);
    
    if (!folderId) {
      return res.status(400).json({
        code: 400,
        message: `无效的文件夹 ID 格式: ${req.params.id}`,
        error: 'VALIDATION_ERROR',
      });
    }
    
    const taskId = req.params.taskId;
    
    if (!taskId) {
      return res.status(400).json({
        code: 400,
        message: '任务 ID 不能为空',
        error: 'VALIDATION_ERROR',
      });
    }

    // 验证文件夹存在且属于该用户
    const folder = await folderRepo.getFolderById(folderId);
    if (!folder) {
      return res.status(404).json({
        code: 404,
        message: '文件夹不存在',
        error: 'NOT_FOUND',
      });
    }
    if (folder.user_id !== userId) {
      return res.status(403).json({
        code: 403,
        message: '无权限操作此文件夹',
        error: 'PERMISSION_DENIED',
      });
    }

    // 直接使用 task_id 从文件夹移除
    await folderRepo.removeItemFromFolder(folderId, taskId);

    res.json({
      code: 200,
      message: '从文件夹移除文件成功',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
