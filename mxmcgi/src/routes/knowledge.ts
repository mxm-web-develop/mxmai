/**
 * 知识库路由
 * 提供知识库的完整 API 接口
 */

import { Router, Request, Response } from 'express';
import { uid } from 'uid';
import multer from 'multer';
import { KnowledgeService } from '../knowledge/knowledge-service';
import { RepositoryFactory } from '@mxmai/mxmdata';
import { taskExecutor } from '../task/task-executor';
import { startKnowledgeImportTask } from '../knowledge/knowledge-task';

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
  files?: MulterFile[] | { [fieldname: string]: MulterFile[] };
}

// 延迟创建知识库服务实例（避免在模块加载时初始化，此时环境变量可能还未加载）
let knowledgeServiceInstance: KnowledgeService | null = null;

function getKnowledgeService(): KnowledgeService {
  if (!knowledgeServiceInstance) {
    try {
      knowledgeServiceInstance = new KnowledgeService();
    } catch (error) {
      console.error('[Knowledge Route] Failed to create KnowledgeService:', error);
      throw new Error(`知识库服务初始化失败: ${error instanceof Error ? error.message : String(error)}`);
    }
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
  // 设置请求超时（30秒）
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      console.error('[Knowledge Route] Request timeout after 30s');
      res.status(504).json({
        success: false,
        error: 'Request timeout',
      });
    }
  }, 30000);

  try {
    console.log('[Knowledge Route] POST /bases - Request received');
    console.log('[Knowledge Route] Request body:', JSON.stringify(req.body));
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
      clearTimeout(timeout);
      console.warn('[Knowledge Route] Missing x-user-id header');
      return res.status(401).json({ success: false, error: 'Missing x-user-id header' });
    }
    console.log('[Knowledge Route] User ID:', userId);

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

    console.log('[Knowledge Route] Creating knowledge base:', { name, display_name, owner_id: userId });
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

    console.log('[Knowledge Route] Knowledge base created successfully:', knowledgeBase.id);
    clearTimeout(timeout);
    return res.json({
      success: true,
      data: knowledgeBase,
    });
  } catch (error) {
    clearTimeout(timeout);
    console.error('[Knowledge Route] Create knowledge base failed:', error);
    console.error('[Knowledge Route] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    
    // 确保响应还没有发送
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    } else {
      console.error('[Knowledge Route] Cannot send error response: headers already sent');
    }
  }
});

/**
 * GET /knowledge/bases
 * 列出知识库
 * 
 * 逻辑说明：
 * - 默认（is_public 未指定）：返回当前用户的知识库 + 所有公开的知识库
 * - is_public=true：返回所有公开的知识库（不限制 owner_id，包括 admin 创建的）
 * - is_public=false：返回当前用户的私有知识库（限制 owner_id）
 */
router.get('/bases', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string | undefined;
    const { agent_id, is_public, limit, offset } = req.query;

    const isPublicParam = is_public === 'true' ? true : is_public === 'false' ? false : undefined;

    // 如果 is_public=true，不传递 owner_id，以获取所有公开的知识库（包括 admin 创建的）
    // 如果 is_public=false，传递 owner_id，以获取该用户的私有知识库
    // 如果 is_public 未指定，需要返回用户的知识库 + 所有公开的知识库（需要特殊处理）
    let result;
    
    if (isPublicParam === undefined) {
      // 默认情况：返回用户的知识库 + 所有公开的知识库
      // 需要两次查询并合并
      const [userKbsRes, publicKbsRes] = await Promise.all([
        getKnowledgeService().listKnowledgeBases({
          agent_id: agent_id as string,
          owner_id: userId,
          is_public: false, // 用户的私有知识库
          limit: limit ? Number(limit) : undefined,
          offset: offset ? Number(offset) : undefined,
        }),
        getKnowledgeService().listKnowledgeBases({
          agent_id: agent_id as string,
          owner_id: undefined, // 不限制 owner_id，获取所有公开的知识库
          is_public: true, // 所有公开的知识库
          limit: limit ? Number(limit) : undefined,
          offset: offset ? Number(offset) : undefined,
        }),
      ]);

      // 合并结果并去重（基于 id）
      const userKbs = userKbsRes.knowledge_bases || [];
      const publicKbs = publicKbsRes.knowledge_bases || [];
      const allKbs = [...userKbs, ...publicKbs];
      const uniqueKbs = allKbs.filter((kb, index, self) => 
        index === self.findIndex((k) => k.id === kb.id)
      );

      result = {
        knowledge_bases: uniqueKbs,
        total: uniqueKbs.length,
        limit: limit ? Number(limit) : undefined,
        offset: offset ? Number(offset) : undefined,
      };
    } else if (isPublicParam === true) {
      // 只查询公开的知识库，不限制 owner_id（包括 admin 创建的）
      result = await getKnowledgeService().listKnowledgeBases({
        agent_id: agent_id as string,
        owner_id: undefined, // 不限制 owner_id
        is_public: true,
        limit: limit ? Number(limit) : undefined,
        offset: offset ? Number(offset) : undefined,
      });
    } else {
      // is_public=false，只查询用户的私有知识库
      result = await getKnowledgeService().listKnowledgeBases({
        agent_id: agent_id as string,
        owner_id: userId,
        is_public: false,
        limit: limit ? Number(limit) : undefined,
        offset: offset ? Number(offset) : undefined,
      });
    }

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

// ==================== Admin 专用：公开知识库与默认使用 ====================

/**
 * GET /knowledge/admin/public-bases
 * [Admin] 列出所有公开或内置的公用知识库
 */
router.get('/admin/public-bases', async (req: Request, res: Response) => {
  try {
    if (!(await isAdminUser(req))) {
      return res.status(403).json({ success: false, error: 'Admin only' });
    }
    const { limit, offset } = req.query;
    const result = await getKnowledgeService().listKnowledgeBases({
      public_or_builtin: true,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
    return res.json({ success: true, data: result });
  } catch (error) {
    console.error('[Knowledge Route] Admin list public bases failed:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /knowledge/admin/defaults
 * [Admin] 列出所有默认知识库绑定
 * Query: scope 可选，筛选 scope
 */
router.get('/admin/defaults', async (req: Request, res: Response) => {
  try {
    if (!(await isAdminUser(req))) {
      return res.status(403).json({ success: false, error: 'Admin only' });
    }
    const { scope } = req.query;
    const repo = RepositoryFactory.createKnowledgeBaseDefaultsRepository();
    const list = await repo.listDefaults(scope as string | undefined);
    return res.json({ success: true, data: { defaults: list } });
  } catch (error) {
    console.error('[Knowledge Route] Admin list defaults failed:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * PUT /knowledge/admin/defaults
 * [Admin] 设置默认知识库
 * Body: { scope, category, sub_type, knowledge_base_id }
 */
router.put('/admin/defaults', async (req: Request, res: Response) => {
  try {
    if (!(await isAdminUser(req))) {
      return res.status(403).json({ success: false, error: 'Admin only' });
    }
    const { scope, category, sub_type, knowledge_base_id } = req.body;
    if (!scope || !category || !sub_type || !knowledge_base_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: scope, category, sub_type, knowledge_base_id',
      });
    }
    const kbRepo = RepositoryFactory.createKnowledgeBaseRepository();
    const kb = await kbRepo.findKnowledgeBaseById(knowledge_base_id);
    if (!kb) {
      return res.status(404).json({
        success: false,
        error: `Knowledge base "${knowledge_base_id}" not found`,
      });
    }
    const repo = RepositoryFactory.createKnowledgeBaseDefaultsRepository();
    const def = await repo.setDefault({
      scope,
      category,
      sub_type,
      knowledge_base_id,
    });
    return res.json({ success: true, data: def });
  } catch (error) {
    console.error('[Knowledge Route] Admin set default failed:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * DELETE /knowledge/admin/defaults/:scope/:category/:subType
 * [Admin] 移除默认知识库绑定
 */
router.delete('/admin/defaults/:scope/:category/:subType', async (req: Request, res: Response) => {
  try {
    if (!(await isAdminUser(req))) {
      return res.status(403).json({ success: false, error: 'Admin only' });
    }
    const { scope, category, subType } = req.params;
    const repo = RepositoryFactory.createKnowledgeBaseDefaultsRepository();
    await repo.removeDefault(scope, category, subType);
    return res.json({ success: true, message: 'Default removed' });
  } catch (error) {
    console.error('[Knowledge Route] Admin remove default failed:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// ==================== 以上 Admin 专用 ====================

/**
 * GET /knowledge/bases/:id
 * 获取知识库信息（通过 id 或 name）
 * 支持通过 UUID id 或 name 获取知识库
 */
router.get('/bases/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // 尝试通过 ID 获取（UUID 格式）
    let knowledgeBase = await getKnowledgeService().getKnowledgeBaseById(id);

    // 如果通过 ID 找不到，尝试通过 name 获取
    if (!knowledgeBase) {
      knowledgeBase = await getKnowledgeService().getKnowledgeBase(id);
    }

    if (!knowledgeBase) {
      return res.status(404).json({
        success: false,
        error: `Knowledge base with ID or name "${id}" not found`,
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
 * PUT /knowledge/bases/:id
 * 更新知识库（通过 id）
 * 
 * 权限规则：
 * - Admin 账号：可以更新任何知识库，包括设置为公开
 * - 个人账号：只能更新自己创建的知识库，且不能设置为公开
 */
router.put('/bases/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Missing x-user-id header' });
    }

    const { id } = req.params;
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
    const existingKb = await getKnowledgeService().getKnowledgeBaseById(id);
    if (!existingKb) {
      return res.status(404).json({
        success: false,
        error: `Knowledge base with ID "${id}" not found`,
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

    const knowledgeBase = await getKnowledgeService().updateKnowledgeBaseById(id, {
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
 * DELETE /knowledge/bases/:id
 * 删除知识库（通过 id）
 * 
 * 权限规则：
 * - Admin 账号：可以删除任何知识库
 * - 个人账号：只能删除自己创建的知识库
 */
router.delete('/bases/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Missing x-user-id header' });
    }

    const { id } = req.params;

    // 检查知识库是否存在
    const existingKb = await getKnowledgeService().getKnowledgeBaseById(id);
    if (!existingKb) {
      return res.status(404).json({
        success: false,
        error: `Knowledge base with ID "${id}" not found`,
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

    await getKnowledgeService().deleteKnowledgeBaseById(id);

      return res.json({
        success: true,
        message: `Knowledge base with ID "${id}" deleted successfully`,
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
 * POST /knowledge/bases/:id/upload
 * 上传文件到知识库（同步，适合中小文件，通过 id）
 * 
 * 支持单个或多个文件上传：
 * - 单个文件：使用字段名 "file"
 * - 多个文件：使用字段名 "files"（数组）
 * 
 * 注意：多次上传会追加到知识库，不会覆盖已有内容
 * 
 * 权限规则：
 * - Admin 账号：可以上传到任何知识库
 * - 个人账号：只能上传到自己创建的知识库
 */
router.post(
  '/bases/:id/upload',
  upload.fields([
    { name: 'file', maxCount: 10 },     // 单个或多个文件（向后兼容，支持最多10个）
    { name: 'files', maxCount: 10 },    // 多个文件（最多10个）
  ]),
  async (req: Request, res: Response) => {
    try {
      const userId = req.headers['x-user-id'] as string | undefined;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Missing x-user-id header' });
      }

      const { id } = req.params;
      const multerReq = req as MulterRequest;

      // 获取上传的文件（支持单个或多个）
      const files: MulterFile[] = [];
      
      if (multerReq.files) {
        if (Array.isArray(multerReq.files)) {
          // 如果 files 是数组（upload.any() 的情况）
          files.push(...multerReq.files);
        } else {
          // 如果 files 是对象（upload.fields() 的情况）
          if (multerReq.files['file']) {
            files.push(...multerReq.files['file']);
          }
          if (multerReq.files['files']) {
            files.push(...multerReq.files['files']);
          }
        }
      } else if (multerReq.file) {
        // 单个文件（向后兼容）
        files.push(multerReq.file);
      }

      if (files.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Missing file field. Use "file" for single file or "files" for multiple files.',
        });
      }

      // 检查知识库是否存在
      const existingKb = await getKnowledgeService().getKnowledgeBaseById(id);
      if (!existingKb) {
        return res.status(404).json({
          success: false,
          error: `Knowledge base with ID "${id}" not found`,
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

      const { tags, metadata, is_public, chunk_size, chunk_overlap, max_chunk_size } = req.body;
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

      // 解析 chunk 配置参数
      const chunkSize = chunk_size ? Number(chunk_size) : undefined;
      const chunkOverlap = chunk_overlap ? Number(chunk_overlap) : undefined;
      const maxChunkSize = max_chunk_size ? Number(max_chunk_size) : undefined;

      // 批量处理所有文件
      const allDocuments: any[] = [];
      let totalChunks = 0;
      const fileResults: Array<{ fileName: string; fileId: string; documentsCount: number; chunks: number; replaced: boolean }> = [];

      for (const file of files) {
        // 验证 id 是否存在
        if (!id) {
          return res.status(400).json({
            success: false,
            error: 'Missing knowledge base ID in URL path',
          });
        }

        const result = await getKnowledgeService().uploadFileById({
          knowledgeBaseId: id,
          file: {
            buffer: file.buffer,
            originalname: file.originalname,
            mimetype: file.mimetype,
            size: file.size,
          },
          userId,
          tags: parsedTags,
          metadata: parsedMetadata,
          isPublic: finalIsPublic,
          chunkSize,
          chunkOverlap,
          maxChunkSize,
        });

        allDocuments.push(...result.documents);
        totalChunks += result.totalChunks;
        fileResults.push({
          fileName: file.originalname,
          fileId: result.fileId, // 文件唯一 ID，用于后续删除
          documentsCount: result.documents.length,
          chunks: result.totalChunks,
          replaced: result.replaced, // 是否替换了已存在的文件
        });
      }

      // 重新获取知识库的最新信息（包含更新后的 document_count 等统计信息）
      const updatedKb = await getKnowledgeService().getKnowledgeBaseById(id);
      if (!updatedKb) {
        // 如果获取失败，使用旧的数据（不应该发生）
        console.warn(`[Knowledge Route] Failed to get updated knowledge base: ${id}`);
      }

      // 如果文件数量较多，不返回完整文档列表（避免响应过大）
      const includeDocuments = files.length <= 3;

      return res.json({
        success: true,
        data: {
          knowledgeBase: updatedKb || existingKb, // 使用更新后的知识库信息
          filesCount: files.length,
          totalDocumentsCount: allDocuments.length,
          totalChunks,
          fileResults, // 每个文件的上传结果
          ...(includeDocuments ? { documents: allDocuments } : {}), // 只有文件数 <= 3 时才返回文档列表
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
 * POST /knowledge/bases/:id/upload-task
 * 通过异步任务方式上传文件到知识库（适合大文件，通过 id）
 * 
 * - 创建 CGI 任务（type: 'other', model: `knowledge-import:${kbId}`）
 * - 将原始文件保存到 MinIO
 * - 后台任务从存储下载文件，执行解析 + 向量化 + 入库
 *
 * 任务进度与结果可通过 GET /api/v2/tasks/:taskId 查询：
 * - progress.progress: 0-100
 * - result.metadata: { documentsCount, totalChunks, knowledgeBaseId, ... }
 */
router.post(
  '/bases/:id/upload-task',
  upload.single('file'),
  async (req: Request, res: Response) => {
    try {
      const userId = req.headers['x-user-id'] as string | undefined;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Missing x-user-id header' });
      }

      const { id } = req.params;
      const multerReq = req as MulterRequest;

      if (!multerReq.file) {
        return res.status(400).json({
          success: false,
          error: 'Missing file field "file"',
        });
      }

      // 检查知识库是否存在
      const existingKb = await getKnowledgeService().getKnowledgeBaseById(id);
      if (!existingKb) {
        return res.status(404).json({
          success: false,
          error: `Knowledge base with ID "${id}" not found`,
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

      const { tags, metadata, is_public, chunk_size, chunk_overlap, max_chunk_size } = req.body;
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

      // 解析 chunk 配置参数
      const chunkSize = chunk_size ? Number(chunk_size) : undefined;
      const chunkOverlap = chunk_overlap ? Number(chunk_overlap) : undefined;
      const maxChunkSize = max_chunk_size ? Number(max_chunk_size) : undefined;

      // 1. 将原始文件保存到 user_upload 域
      const { uploadUserBlob } = await import('../storage/user-upload-service');
      const uploaded = await uploadUserBlob({
        userId,
        purpose: 'knowledge',
        buffer: multerReq.file.buffer,
        contentType: multerReq.file.mimetype,
        originalName: multerReq.file.originalname,
        metadata: {
          knowledgeBaseId: id,
          knowledgeBaseName: existingKb.name,
        },
      });

      const bucket = uploaded.bucket;
      const key = uploaded.key;

      // 2. 创建 CGI 任务
      const taskManager = taskExecutor.getTaskManager();
      const createResponse = await taskManager.createTask({
        type: 'other',
        model: `knowledge-import:${id}`,
        provider: 'knowledge',
        params: {
          knowledgeBaseId: id,
          knowledgeBaseName: existingKb.name, // 保留 name 用于内部处理
          fileBucket: bucket,
          fileKey: key,
          originalFileName: multerReq.file.originalname,
          mimeType: multerReq.file.mimetype,
          userId,
          tags: parsedTags,
          metadata: parsedMetadata,
          isPublic: finalIsPublic,
          chunkSize,
          chunkOverlap,
          maxChunkSize,
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

      // 4. 返回任务 ID，让前端通过 GET /api/v2/tasks/:taskId 查询进度
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
 * GET /knowledge/bases/:id/documents
 * 列出知识库中的文档（通过 id）
 */
router.get('/bases/:id/documents', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string | undefined;
    const { id } = req.params;
    const { limit, offset } = req.query;

    // 支持通过 id 或 name 获取知识库
    let knowledgeBase = await getKnowledgeService().getKnowledgeBaseById(id);
    if (!knowledgeBase) {
      knowledgeBase = await getKnowledgeService().getKnowledgeBase(id);
    }
    
    if (!knowledgeBase) {
      return res.status(404).json({
        success: false,
        error: `Knowledge base with ID or name "${id}" not found`,
      });
    }

    const result = await getKnowledgeService().listDocuments(knowledgeBase.name, {
      user_id: userId,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });

    // 按文件分组统计 chunks 数量
    const fileChunkCountMap = new Map<string, number>();
    for (const doc of result.documents) {
      const metadata = doc.metadata || {};
      const fileId = metadata.fileId as string | undefined;
      const filename = metadata.originalFileName || metadata.fileName || doc.title || '未知文件';
      // 使用 fileId 作为 key，如果没有则使用 filename
      const fileKey = fileId || filename;
      fileChunkCountMap.set(fileKey, (fileChunkCountMap.get(fileKey) || 0) + 1);
    }

    // 为每个文档添加 filename、file_size、embedding 和 chunk_count 信息（从 metadata 中提取）
    const documentsWithFileInfo = result.documents.map((doc) => {
      const metadata = doc.metadata || {};
      const filename = metadata.originalFileName || metadata.fileName || doc.title || '未知文件';
      const file_size = metadata.fileSize || 0;
      const fileId = metadata.fileId as string | undefined;
      const fileKey = fileId || filename;
      
      // 检查 embedding 状态
      const hasEmbedding = !!(doc.embedding && Array.isArray(doc.embedding) && doc.embedding.length > 0);
      const embeddingDimension = hasEmbedding && doc.embedding ? doc.embedding.length : null;
      
      // 获取该文件的 chunk 数量
      const chunk_count = fileChunkCountMap.get(fileKey) || 1;
      
      return {
        ...doc,
        filename,
        file_size,
        file_type: doc.content_type || 'text',
        chunk_count,
        embedding: {
          hasEmbedding,
          dimension: embeddingDimension,
        },
      };
    });

    return res.json({
      success: true,
      data: {
        documents: documentsWithFileInfo,
        total: result.total,
        limit: limit ? Number(limit) : undefined,
        offset: offset ? Number(offset) : undefined,
      },
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
 * GET /knowledge/bases/:id/detail
 * 获取知识库详细信息（包括文件列表、chunks、embedding 信息，通过 id）
 * 
 * 查询参数：
 * - include_content: 是否包含 chunk 的完整内容（默认 false，只返回摘要）
 * - include_embedding: 是否包含 embedding 向量（默认 false，只返回维度信息）
 * - limit: 限制返回的文档数量（默认不限制）
 */
router.get('/bases/:id/detail', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string | undefined;
    const { id } = req.params;
    const { include_content, include_embedding, limit } = req.query;

    // 1. 获取知识库基本信息
    const knowledgeBase = await getKnowledgeService().getKnowledgeBaseById(id);
    if (!knowledgeBase) {
      return res.status(404).json({
        success: false,
        error: `Knowledge base with ID "${id}" not found`,
      });
    }

    // 2. 获取所有文档（按文件分组）
    const documentsResult = await getKnowledgeService().listDocumentsById(id, {
      user_id: userId,
      limit: limit ? Number(limit) : undefined,
    });

    // 3. 按文件分组组织数据（使用 fileId 作为 key）
    const filesMap = new Map<string, {
      fileId: string; // 文件唯一 ID
      fileName: string;
      fileType: string;
      uploadTime: string;
      chunks: Array<{
        id: string;
        title: string;
        content: string | null; // 根据 include_content 决定
        contentPreview: string; // 内容摘要（前200字符）
        chunkIndex: number;
        totalChunks: number;
        embedding: {
          dimension: number | null;
          hasEmbedding: boolean;
          vector?: number[]; // 根据 include_embedding 决定
        };
        tags: string[];
        metadata: Record<string, any>;
        createdAt: string;
      }>;
    }>();

    // 为没有 fileId 的旧数据生成稳定的 fileId（基于文件名）
    const fileNameToFileIdMap = new Map<string, string>();

    for (const doc of documentsResult.documents) {
      let fileId = doc.metadata?.fileId as string | undefined;
      const fileName = (doc.metadata?.originalFileName as string) || '未知文件';
      
      // 如果没有 fileId（旧数据），为同名文件生成并复用同一个 fileId
      if (!fileId) {
        if (!fileNameToFileIdMap.has(fileName)) {
          fileNameToFileIdMap.set(fileName, `file_${uid(21)}`);
        }
        fileId = fileNameToFileIdMap.get(fileName)!;
      }
      
      const fileType = doc.content_type || 'text';
      
      if (!filesMap.has(fileId)) {
        const uploadTime = doc.created_at 
          ? (typeof doc.created_at === 'string' ? doc.created_at : doc.created_at.toISOString())
          : new Date().toISOString();
        filesMap.set(fileId, {
          fileId,
          fileName,
          fileType,
          uploadTime,
          chunks: [],
        });
      }

      const fileInfo = filesMap.get(fileId)!;
      
      // 提取 chunk 信息
      const chunkIndex = doc.metadata?.chunkIndex as number ?? 0;
      const totalChunks = doc.metadata?.totalChunks as number ?? 1;
      
      // 内容处理
      const shouldIncludeContent = include_content === 'true';
      const contentPreview = doc.content 
        ? (doc.content.length > 200 ? doc.content.substring(0, 200) + '...' : doc.content)
        : '';
      
      // Embedding 信息
      const hasEmbedding = !!(doc.embedding && Array.isArray(doc.embedding) && doc.embedding.length > 0);
      const embeddingDimension = hasEmbedding && doc.embedding ? doc.embedding.length : null;
      const shouldIncludeEmbedding = include_embedding === 'true';

      fileInfo.chunks.push({
        id: doc.id,
        title: doc.title || '',
        content: shouldIncludeContent ? doc.content : null,
        contentPreview,
        chunkIndex,
        totalChunks,
        embedding: {
          dimension: embeddingDimension,
          hasEmbedding: hasEmbedding,
          ...(shouldIncludeEmbedding && hasEmbedding && doc.embedding ? { vector: doc.embedding } : {}),
        },
        tags: doc.tags || [],
        metadata: doc.metadata || {},
        createdAt: doc.created_at 
          ? (typeof doc.created_at === 'string' ? doc.created_at : doc.created_at.toISOString())
          : new Date().toISOString(),
      });

      // 更新最早的上传时间（用于文件的上传时间）
      if (doc.created_at) {
        const createdAtStr = typeof doc.created_at === 'string' ? doc.created_at : doc.created_at.toISOString();
        if (new Date(createdAtStr) < new Date(fileInfo.uploadTime)) {
          fileInfo.uploadTime = createdAtStr;
        }
      }
    }

    // 4. 转换为数组并按上传时间排序
    const files = Array.from(filesMap.values()).sort((a, b) => 
      new Date(a.uploadTime).getTime() - new Date(b.uploadTime).getTime()
    );

    // 5. 对每个文件的 chunks 按 chunkIndex 排序
    files.forEach(file => {
      file.chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
    });

    return res.json({
      success: true,
      data: {
        knowledgeBase: {
          id: knowledgeBase.id,
          name: knowledgeBase.name,
          display_name: knowledgeBase.display_name,
          description: knowledgeBase.description,
          type: knowledgeBase.type,
          embedding_model: knowledgeBase.embedding_model,
          document_count: knowledgeBase.document_count,
          total_size_bytes: knowledgeBase.total_size_bytes,
          is_public: knowledgeBase.is_public,
          owner_id: knowledgeBase.owner_id,
          created_at: knowledgeBase.created_at,
          updated_at: knowledgeBase.updated_at,
        },
        files: files,
        summary: {
          totalFiles: files.length,
          totalChunks: documentsResult.total,
          totalSizeBytes: knowledgeBase.total_size_bytes,
        },
      },
    });
  } catch (error) {
    console.error('[Knowledge Route] Get knowledge base detail failed:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * DELETE /knowledge/documents/:id
 * 删除文档（单个 chunk）
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
 * DELETE /knowledge/bases/:id/files/:fileId
 * 删除知识库中的某个文件（删除该文件的所有 chunks，通过 id）
 * 
 * 权限规则：
 * - Admin 账号：可以删除任何文件
 * - 个人账号：只能删除自己上传的文件
 * 
 * 注意：使用 fileId 而不是 fileName，避免特殊字符问题
 * fileId 可以从上传文件时的响应中获取，或从 GET /bases/:id/detail 接口中获取
 */
router.delete('/bases/:id/files/:fileId', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Missing x-user-id header' });
    }

    const { id, fileId } = req.params;

    // 检查知识库是否存在
    const knowledgeBase = await getKnowledgeService().getKnowledgeBaseById(id);
    if (!knowledgeBase) {
      return res.status(404).json({
        success: false,
        error: `Knowledge base with ID "${id}" not found`,
      });
    }

    // 检查用户是否为管理员
    const isAdmin = await isAdminUser(req);

    // 先查找该文件的所有文档，检查权限
    const documentsResult = await getKnowledgeService().listDocumentsById(id, {
      user_id: userId,
    });

    const fileDocuments = documentsResult.documents.filter(
      (doc) => doc.metadata?.fileId === fileId
    );

    if (fileDocuments.length === 0) {
      return res.status(404).json({
        success: false,
        error: `File with ID "${fileId}" not found in knowledge base with ID "${id}"`,
      });
    }

    // 权限检查：非管理员只能删除自己上传的文件
    if (!isAdmin) {
      const hasOtherUserFiles = fileDocuments.some(
        (doc) => doc.user_id !== userId
      );
      if (hasOtherUserFiles) {
        return res.status(403).json({
          success: false,
          error: 'You can only delete files you uploaded',
        });
      }
    }

    // 删除文件的所有 chunks
    const result = await getKnowledgeService().deleteFileById(id, fileId, userId);

    return res.json({
      success: true,
      data: {
        fileId,
        fileName: result.fileName,
        deletedChunksCount: result.deletedCount,
        message: result.fileName
          ? `File "${result.fileName}" and ${result.deletedCount} chunks deleted successfully`
          : `File and ${result.deletedCount} chunks deleted successfully`,
      },
    });
  } catch (error) {
    console.error('[Knowledge Route] Delete file failed:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /knowledge/bases/:id/search
 * 搜索知识库（通过 id 或 name）
 */
router.post('/bases/:id/search', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string | undefined;
    const { id } = req.params;
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

    // 支持通过 id 或 name 获取知识库
    let knowledgeBase = await getKnowledgeService().getKnowledgeBaseById(id);
    if (!knowledgeBase) {
      knowledgeBase = await getKnowledgeService().getKnowledgeBase(id);
    }
    
    if (!knowledgeBase) {
      return res.status(404).json({
        success: false,
        error: `Knowledge base with ID or name "${id}" not found`,
      });
    }

    const results = await getKnowledgeService().searchById({
      knowledgeBaseId: knowledgeBase.id,
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

