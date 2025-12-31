/**
 * 知识库路由
 * 提供知识库的完整 API 接口
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import { KnowledgeService } from '../core/knowledge/knowledge-service';
import { RepositoryFactory } from '@mxmai/mxmdata';
import { taskExecutor } from '../core/task/task-executor';
import { startKnowledgeImportTask } from '../core/knowledge/knowledge-task';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

/**
 * 检查用户是否为管理员
 */
async function isAdminUser(req: Request): Promise<boolean> {
  try {
    // 方法1: 从请求头获取用户角色（如果 Gateway 传递了）
    const userRole = req.headers['x-user-role'] as string | undefined;
    if (userRole === 'admin') {
      return true;
    }

    // 方法2: 从请求头获取用户 ID，然后查询数据库
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
      return false;
    }

    // 如果是测试用的 admin 用户
    if (userId === 'admin-test-user') {
      return true;
    }

    // 尝试从数据库查询用户信息
    try {
      const userRepo = RepositoryFactory.createUserRepository();
      const user = await userRepo.findById(userId);
      
      if (user && user.role === 'admin') {
        return true;
      }
    } catch (dbError) {
      // 如果数据库查询失败，记录日志但不影响流程
      console.warn('[Knowledge Route] 查询用户角色失败:', dbError);
    }

    return false;
  } catch (error) {
    console.warn('[Knowledge Route] 检查管理员权限失败:', error);
    return false;
  }
}

// Multer 文件类型定义
interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

interface MulterRequest extends Request {
  file?: MulterFile;
  files?: MulterFile[];
}

// 延迟创建知识库服务实例（避免在模块加载时初始化，此时环境变量可能还未加载）
let knowledgeServiceInstance: KnowledgeService | null = null;

function getKnowledgeService(): KnowledgeService {
  if (!knowledgeServiceInstance) {
    knowledgeServiceInstance = new KnowledgeService();
  }
  return knowledgeServiceInstance;
}

/**
 * POST /knowledge/bases
 * 创建知识库
 * 
 * 权限规则：
 * - Admin 账号：可以创建公开的知识库（is_public=true）
 * - 个人账号：只能创建自己用的知识库（is_public=false）
 */
router.post('/bases', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Missing x-user-id header' });
    }

    const {
      name,
      display_name,
      description,
      type,
      embedding_model,
      agent_id,
      agent_name,
      is_builtin,
      is_public,
      config,
    } = req.body;

    if (!name || !display_name) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, display_name',
      });
    }

    // 检查用户是否为管理员
    const isAdmin = await isAdminUser(req);

    // 权限检查：非管理员不能创建公开的知识库
    if (!isAdmin && is_public === true) {
      return res.status(403).json({
        success: false,
        error: 'Only admin users can create public knowledge bases',
      });
    }

    // 非管理员用户强制设置为私有
    const finalIsPublic = isAdmin ? (is_public !== undefined ? is_public : false) : false;

    const knowledgeBase = await getKnowledgeService().createKnowledgeBase({
      name,
      display_name,
      description,
      type,
      embedding_model,
      agent_id,
      agent_name,
      is_builtin: isAdmin ? (is_builtin || false) : false, // 只有管理员可以创建内置知识库
      is_public: finalIsPublic,
      owner_id: userId,
      config,
    });

    return res.json({
      success: true,
      data: knowledgeBase,
    });
  } catch (error) {
    console.error('[Knowledge Route] Create knowledge base failed:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /knowledge/bases
 * 列出知识库
 */
router.get('/bases', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string | undefined;
    const { agent_id, is_public, limit, offset } = req.query;

    const result = await getKnowledgeService().listKnowledgeBases({
      agent_id: agent_id as string,
      owner_id: userId,
      is_public: is_public === 'true' ? true : is_public === 'false' ? false : undefined,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[Knowledge Route] List knowledge bases failed:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /knowledge/bases/:name
 * 获取知识库信息
 */
router.get('/bases/:name', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;

    const knowledgeBase = await getKnowledgeService().getKnowledgeBase(name);

    if (!knowledgeBase) {
      return res.status(404).json({
        success: false,
        error: `Knowledge base "${name}" not found`,
      });
    }

    return res.json({
      success: true,
      data: knowledgeBase,
    });
  } catch (error) {
    console.error('[Knowledge Route] Get knowledge base failed:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * PUT /knowledge/bases/:name
 * 更新知识库
 * 
 * 权限规则：
 * - Admin 账号：可以更新任何知识库，包括设置为公开
 * - 个人账号：只能更新自己创建的知识库，且不能设置为公开
 */
router.put('/bases/:name', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Missing x-user-id header' });
    }

    const { name } = req.params;
    const {
      display_name,
      description,
      type,
      agent_id,
      agent_name,
      is_public,
      config,
    } = req.body;

    // 检查知识库是否存在
    const existingKb = await knowledgeService.getKnowledgeBase(name);
    if (!existingKb) {
      return res.status(404).json({
        success: false,
        error: `Knowledge base "${name}" not found`,
      });
    }

    // 检查用户是否为管理员
    const isAdmin = await isAdminUser(req);

    // 权限检查：非管理员只能更新自己创建的知识库
    if (!isAdmin && existingKb.owner_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'You can only update your own knowledge bases',
      });
    }

    // 权限检查：非管理员不能将知识库设置为公开
    if (!isAdmin && is_public === true) {
      return res.status(403).json({
        success: false,
        error: 'Only admin users can set knowledge base as public',
      });
    }

    // 非管理员用户如果要更新 is_public，强制设置为 false
    const finalIsPublic = isAdmin
      ? is_public !== undefined
        ? is_public
        : existingKb.is_public
      : false;

    const knowledgeBase = await getKnowledgeService().updateKnowledgeBase({
      name,
      display_name,
      description,
      type,
      agent_id,
      agent_name,
      is_public: finalIsPublic,
      config,
    });

    return res.json({
      success: true,
      data: knowledgeBase,
    });
  } catch (error) {
    console.error('[Knowledge Route] Update knowledge base failed:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * DELETE /knowledge/bases/:name
 * 删除知识库
 * 
 * 权限规则：
 * - Admin 账号：可以删除任何知识库
 * - 个人账号：只能删除自己创建的知识库
 */
router.delete('/bases/:name', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Missing x-user-id header' });
    }

    const { name } = req.params;

    // 检查知识库是否存在
    const existingKb = await knowledgeService.getKnowledgeBase(name);
    if (!existingKb) {
      return res.status(404).json({
        success: false,
        error: `Knowledge base "${name}" not found`,
      });
    }

    // 检查用户是否为管理员
    const isAdmin = await isAdminUser(req);

    // 权限检查：非管理员只能删除自己创建的知识库
    if (!isAdmin && existingKb.owner_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'You can only delete your own knowledge bases',
      });
    }

    await getKnowledgeService().deleteKnowledgeBase(name);

    return res.json({
      success: true,
      message: `Knowledge base "${name}" deleted successfully`,
    });
  } catch (error) {
    console.error('[Knowledge Route] Delete knowledge base failed:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /knowledge/bases/:name/upload
 * 上传文件到知识库（同步，适合中小文件）
 * 
 * 权限规则：
 * - Admin 账号：可以上传到任何知识库
 * - 个人账号：只能上传到自己创建的知识库
 */
router.post(
  '/bases/:name/upload',
  upload.single('file'),
  async (req: Request, res: Response) => {
    try {
      const userId = req.headers['x-user-id'] as string | undefined;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Missing x-user-id header' });
      }

      const { name } = req.params;
      const multerReq = req as MulterRequest;

      if (!multerReq.file) {
        return res.status(400).json({
          success: false,
          error: 'Missing file field "file"',
        });
      }

      // 检查知识库是否存在
      const existingKb = await knowledgeService.getKnowledgeBase(name);
      if (!existingKb) {
        return res.status(404).json({
          success: false,
          error: `Knowledge base "${name}" not found`,
        });
      }

      // 检查用户是否为管理员
      const isAdmin = await isAdminUser(req);

      // 权限检查：非管理员只能上传到自己创建的知识库
      if (!isAdmin && existingKb.owner_id !== userId) {
        return res.status(403).json({
          success: false,
          error: 'You can only upload files to your own knowledge bases',
        });
      }

      const { tags, metadata, is_public } = req.body;
      const parsedTags = tags ? (typeof tags === 'string' ? JSON.parse(tags) : tags) : [];
      const parsedMetadata = metadata
        ? typeof metadata === 'string'
          ? JSON.parse(metadata)
          : metadata
        : undefined;

      // 非管理员用户上传的文档默认不公开
      const finalIsPublic = isAdmin
        ? is_public === 'true' || is_public === true
        : false;

      const result = await getKnowledgeService().uploadFile({
        knowledgeBaseName: name,
        file: {
          buffer: multerReq.file.buffer,
          originalname: multerReq.file.originalname,
          mimetype: multerReq.file.mimetype,
          size: multerReq.file.size,
        },
        userId,
        tags: parsedTags,
        metadata: parsedMetadata,
        isPublic: finalIsPublic,
      });

      return res.json({
        success: true,
        data: {
          knowledgeBase: result.knowledgeBase,
          documentsCount: result.documents.length,
          totalChunks: result.totalChunks,
          documents: result.documents,
        },
      });
    } catch (error) {
      console.error('[Knowledge Route] Upload file failed:', error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/**
 * POST /knowledge/bases/:name/upload-task
 * 通过异步任务方式上传文件到知识库（适合大文件）
 * 
 * - 创建 CGI 任务（type: 'other', model: `knowledge-import:${kbName}`）
 * - 将原始文件保存到 MinIO
 * - 后台任务从存储下载文件，执行解析 + 向量化 + 入库
 *
 * 任务进度与结果可通过 /api/v1/cgi-tasks/:taskId 查询：
 * - progress.progress: 0-100
 * - result.metadata: { documentsCount, totalChunks, knowledgeBaseName, ... }
 */
router.post(
  '/bases/:name/upload-task',
  upload.single('file'),
  async (req: Request, res: Response) => {
    try {
      const userId = req.headers['x-user-id'] as string | undefined;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Missing x-user-id header' });
      }

      const { name } = req.params;
      const multerReq = req as MulterRequest;

      if (!multerReq.file) {
        return res.status(400).json({
          success: false,
          error: 'Missing file field "file"',
        });
      }

      // 检查知识库是否存在
      const existingKb = await knowledgeService.getKnowledgeBase(name);
      if (!existingKb) {
        return res.status(404).json({
          success: false,
          error: `Knowledge base "${name}" not found`,
        });
      }

      // 检查用户是否为管理员
      const isAdmin = await isAdminUser(req);

      // 权限检查：非管理员只能上传到自己创建的知识库
      if (!isAdmin && existingKb.owner_id !== userId) {
        return res.status(403).json({
          success: false,
          error: 'You can only upload files to your own knowledge bases',
        });
      }

      const { tags, metadata, is_public } = req.body;
      const parsedTags = tags ? (typeof tags === 'string' ? JSON.parse(tags) : tags) : [];
      const parsedMetadata = metadata
        ? typeof metadata === 'string'
          ? JSON.parse(metadata)
          : metadata
        : undefined;

      // 非管理员用户上传的文档默认不公开
      const finalIsPublic = isAdmin
        ? is_public === 'true' || is_public === true
        : false;

      // 1. 将原始文件保存到 MinIO，避免在 CGI 任务表中存 Buffer
      const storageRepo = RepositoryFactory.createStorageRepository();
      const bucket =
        process.env.KNOWLEDGE_STORAGE_BUCKET ||
        process.env.CGI_STORAGE_BUCKET ||
        'user-media';

      const originalName = multerReq.file.originalname;
      const ext = (originalName.split('.').pop() || 'txt').toLowerCase();
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).slice(2, 8);

      const key = `knowledge/${userId}/${name}/${timestamp}-${randomId}.${ext}`;

      await storageRepo.uploadFile(bucket, key, multerReq.file.buffer, {
        contentType: multerReq.file.mimetype,
        metadata: {
          userId,
          knowledgeBaseName: name,
          originalFileName: originalName,
        },
      });

      // 2. 创建 CGI 任务
      const taskManager = taskExecutor.getTaskManager();
      const createResponse = await taskManager.createTask({
        type: 'other',
        model: `knowledge-import:${name}`,
        provider: 'knowledge',
        params: {
          knowledgeBaseName: name,
          knowledgeBaseId: existingKb.id,
          fileBucket: bucket,
          fileKey: key,
          originalFileName: originalName,
          mimeType: multerReq.file.mimetype,
          userId,
          tags: parsedTags,
          metadata: parsedMetadata,
          isPublic: finalIsPublic,
        },
        userId,
        // 不需要 MinIO 输出存储，这个任务只是导入知识库
        storeToMinio: false,
      });

      // 3. 后台执行导入任务（不阻塞响应）
      startKnowledgeImportTask(createResponse.taskId).catch((error) => {
        console.error(
          `[Knowledge Route] 知识库导入任务执行失败 (taskId: ${createResponse.taskId}):`,
          error
        );
      });

      // 4. 返回任务 ID，让前端通过 /api/v1/cgi-tasks/:taskId 查询进度
      return res.json({
        success: true,
        data: {
          taskId: createResponse.taskId,
          status: createResponse.status,
          createdAt: createResponse.createdAt,
        },
      });
    } catch (error) {
      console.error('[Knowledge Route] Upload file (async task) failed:', error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/**
 * GET /knowledge/bases/:name/documents
 * 列出知识库中的文档
 */
router.get('/bases/:name/documents', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string | undefined;
    const { name } = req.params;
    const { limit, offset } = req.query;

    const result = await getKnowledgeService().listDocuments(name, {
      user_id: userId,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[Knowledge Route] List documents failed:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * DELETE /knowledge/documents/:id
 * 删除文档
 * 
 * 权限规则：
 * - Admin 账号：可以删除任何文档
 * - 个人账号：只能删除自己上传的文档
 */
router.delete('/documents/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Missing x-user-id header' });
    }

    const { id } = req.params;

    // 检查文档是否存在（通过 RepositoryFactory 直接访问）
    const { RepositoryFactory } = await import('@mxmai/mxmdata');
    const kbRepo = RepositoryFactory.createKnowledgeBaseRepository();
    const doc = await kbRepo.findDocumentById(id);
    if (!doc) {
      return res.status(404).json({
        success: false,
        error: `Document "${id}" not found`,
      });
    }

    // 检查用户是否为管理员
    const isAdmin = await isAdminUser(req);

    // 权限检查：非管理员只能删除自己上传的文档
    if (!isAdmin && doc.user_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'You can only delete your own documents',
      });
    }

    await getKnowledgeService().deleteDocument(id);

    return res.json({
      success: true,
      message: `Document "${id}" deleted successfully`,
    });
  } catch (error) {
    console.error('[Knowledge Route] Delete document failed:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /knowledge/bases/:name/search
 * 搜索知识库
 */
router.post('/bases/:name/search', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string | undefined;
    const { name } = req.params;
    const {
      query,
      search_type = 'hybrid',
      limit = 5,
      threshold = 0.7,
      vector_weight = 0.7,
      keyword_weight = 0.3,
    } = req.body;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: query',
      });
    }

    const results = await getKnowledgeService().search({
      knowledgeBaseName: name,
      query,
      searchType: search_type,
      limit: Number(limit),
      threshold: Number(threshold),
      vectorWeight: Number(vector_weight),
      keywordWeight: Number(keyword_weight),
      userId,
    });

    return res.json({
      success: true,
      data: {
        results,
        count: results.length,
      },
    });
  } catch (error) {
    console.error('[Knowledge Route] Search failed:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;

