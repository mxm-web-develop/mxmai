/**
 * Character模块路由
 * 提供角色的CRUD操作和任务关联功能
 */

import { Router, Request, Response } from 'express';
import { CharacterService } from '../characters/character-service';
import type { CreateCharacterDto, UpdateCharacterDto, CharacterFilters } from '@mxmai/mxmdata';
import type { ProviderType } from '../core/providers/types';

const router = Router();

/**
 * 获取角色列表
 * GET /api/v1/characters
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    // Gateway 会从 JWT token 中提取 user_id 并通过 x-user-id header 转发
    const userId = req.headers['x-user-id'] as string;

    const characterService = new CharacterService();

    // 解析查询参数
    const filters: CharacterFilters = {};
    if (req.query.category) {
      const categoryParam = req.query.category;
      filters.category = Array.isArray(categoryParam) 
        ? categoryParam as string[]
        : [categoryParam as string];
    }
    if (req.query.tags) {
      const tagsParam = req.query.tags;
      filters.tags = Array.isArray(tagsParam)
        ? tagsParam as string[]
        : [tagsParam as string];
    }
    if (req.query.search) {
      filters.search = req.query.search as string;
    }
    if (req.query.is_public !== undefined) {
      filters.is_public = req.query.is_public === 'true';
    }

    const pagination = req.query.page && req.query.limit
      ? {
          page: parseInt(req.query.page as string, 10),
          limit: parseInt(req.query.limit as string, 10),
        }
      : undefined;

    const result = await characterService.listCharacters(userId, filters, pagination);

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[Character Route] Error listing characters:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list characters',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 创建角色
 * POST /api/v1/characters
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    // Gateway 会从 JWT token 中提取 user_id 并通过 x-user-id header 转发
    const userId = req.headers['x-user-id'] as string;

    const characterService = new CharacterService();
    const dto: CreateCharacterDto = {
      ...req.body,
      user_id: userId,
    };

    const character = await characterService.createCharacter(dto);

    return res.json({
      success: true,
      data: character,
    });
  } catch (error) {
    console.error('[Character Route] Error creating character:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create character',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 获取角色详情
 * GET /api/v1/characters/:id
 * 返回完整的角色数据，包括所有字段和媒体URL
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    // Gateway 会从 JWT token 中提取 user_id 并通过 x-user-id header 转发
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Missing x-user-id header. Please ensure you are logged in and the request includes the Authorization token.',
      });
    }

    const { id } = req.params;
    if (!id || id.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Bad request',
        message: 'Character id is required',
      });
    }

    const characterService = new CharacterService();
    
    // 使用详情方法获取完整数据
    const character = await characterService.getCharacterDetail(id, userId);

    if (!character) {
      return res.status(404).json({
        success: false,
        error: 'Character not found',
        message: `Character with id "${id}" not found`,
      });
    }

    // 获取媒体URL（自动从任务或直接URL获取）
    const mediaUrls = await characterService.getCharacterMediaUrls(character);

    return res.json({
      success: true,
      data: {
        ...character,
        mediaUrls,
      },
    });
  } catch (error) {
    const err = error as Error;
    console.error('[Character Route] Error getting character:', err);
    const msg = err?.message ?? String(error);
    const hint = msg.includes('relation') || msg.includes('column')
      ? ' 若涉及 relations 字段，请执行迁移: mxmdata/src/database/migrations/add_character_relations.sql'
      : '';
    res.status(500).json({
      success: false,
      error: 'Failed to get character',
      message: msg + hint,
    });
  }
});

/**
 * 更新角色
 * PUT /api/v1/characters/:id
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    // Gateway 会从 JWT token 中提取 user_id 并通过 x-user-id header 转发
    const userId = req.headers['x-user-id'] as string;

    const { id } = req.params;
    const characterService = new CharacterService();
    const updates: UpdateCharacterDto = req.body;

    const character = await characterService.updateCharacter(id, updates, userId);

    return res.json({
      success: true,
      data: character,
    });
  } catch (error) {
    console.error('[Character Route] Error updating character:', error);
    const statusCode = error instanceof Error && error.message.includes('无权访问') ? 403 : 500;
    res.status(statusCode).json({
      success: false,
      error: 'Failed to update character',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 删除角色
 * DELETE /api/v1/characters/:id
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    // Gateway 会从 JWT token 中提取 user_id 并通过 x-user-id header 转发
    const userId = req.headers['x-user-id'] as string;

    const { id } = req.params;
    const characterService = new CharacterService();
    await characterService.deleteCharacter(id, userId);

    return res.json({
      success: true,
      message: 'Character deleted successfully',
    });
  } catch (error) {
    console.error('[Character Route] Error deleting character:', error);
    const statusCode = error instanceof Error && error.message.includes('无权访问') ? 403 : 500;
    res.status(statusCode).json({
      success: false,
      error: 'Failed to delete character',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 关联图片任务到角色
 * POST /api/v1/characters/:id/link-image-task
 * Body: { taskId: string, imageType?: 'appearance' | 'clothing_style' }
 */
router.post('/:id/link-image-task', async (req: Request, res: Response) => {
  try {
    // Gateway 会从 JWT token 中提取 user_id 并通过 x-user-id header 转发
    const userId = req.headers['x-user-id'] as string;

    const { id } = req.params;
    const { taskId, imageType = 'appearance' } = req.body;

    if (!taskId) {
      return res.status(400).json({
        success: false,
        error: 'Missing taskId',
        message: 'taskId is required',
      });
    }

    if (imageType !== 'appearance' && imageType !== 'clothing_style') {
      return res.status(400).json({
        success: false,
        error: 'Invalid imageType',
        message: 'imageType must be "appearance" or "clothing_style"',
      });
    }

    const characterService = new CharacterService();
    const character = await characterService.linkImageTaskToCharacter(id, taskId, userId, imageType);

    return res.json({
      success: true,
      data: character,
    });
  } catch (error) {
    console.error('[Character Route] Error linking image task:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to link image task',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 关联音频任务到角色
 * POST /api/v1/characters/:id/link-audio-task
 * Body: { taskId: string, cloneVoiceId?: string }
 */
router.post('/:id/link-audio-task', async (req: Request, res: Response) => {
  try {
    // Gateway 会从 JWT token 中提取 user_id 并通过 x-user-id header 转发
    const userId = req.headers['x-user-id'] as string;

    const { id } = req.params;
    const { taskId, cloneVoiceId } = req.body;

    if (!taskId) {
      return res.status(400).json({
        success: false,
        error: 'Missing taskId',
        message: 'taskId is required',
      });
    }

    const characterService = new CharacterService();
    const character = await characterService.linkAudioTaskToCharacter(id, taskId, userId, cloneVoiceId);

    return res.json({
      success: true,
      data: character,
    });
  } catch (error) {
    console.error('[Character Route] Error linking audio task:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to link audio task',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 从写作任务保存角色到用户角色库，并删除任务中的角色详情，改为只存 character_ids
 * 之后该写作获取角色信息时从系统角色库按 character_ids 解析
 * POST /api/v1/characters/save-from-writing
 * Body: { characters?: CharacterProfile[], writingTaskId: string }  // 不传 characters 则从任务 result.metadata.characters 读取
 */
router.post('/save-from-writing', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    const { characters, writingTaskId } = req.body;

    if (!writingTaskId || typeof writingTaskId !== 'string' || !writingTaskId.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Invalid writingTaskId',
        message: 'writingTaskId is required and must be a non-empty string',
      });
    }

    const characterService = new CharacterService();
    const savedCharacters = await characterService.saveCharactersFromWriting(
      Array.isArray(characters) ? characters : [],
      writingTaskId.trim(),
      userId
    );

    return res.json({
      success: true,
      data: savedCharacters,
      message: `已保存 ${savedCharacters.length} 个角色到角色库，写作任务已改为从角色库引用`,
    });
  } catch (error) {
    console.error('[Character Route] Error saving characters from writing:', error);
    const statusCode = error instanceof Error && (error.message.includes('无权') || error.message.includes('不存在')) ? 403 : 500;
    res.status(statusCode).json({
      success: false,
      error: 'Failed to save characters from writing',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 从大纲保存角色到用户角色库
 * POST /api/v1/characters/save-from-outline
 * Body: { characters: CharacterProfile[], outlineTaskId?: string }
 */
router.post('/save-from-outline', async (req: Request, res: Response) => {
  try {
    // Gateway 会从 JWT token 中提取 user_id 并通过 x-user-id header 转发
    const userId = req.headers['x-user-id'] as string;

    const { characters, outlineTaskId } = req.body;

    if (!characters || !Array.isArray(characters) || characters.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid characters',
        message: 'characters must be a non-empty array',
      });
    }

    const characterService = new CharacterService();
    const savedCharacters = await characterService.saveCharactersFromOutline(
      characters,
      outlineTaskId || '',
      userId
    );

    return res.json({
      success: true,
      data: savedCharacters,
      message: `Successfully saved ${savedCharacters.length} character(s)`,
    });
  } catch (error) {
    console.error('[Character Route] Error saving characters from outline:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save characters from outline',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 生成角色（使用 LLM）
 * POST /api/v1/characters/generate
 * Body: { count: number, prompt: string }
 * 根据用户提供的提示词批量生成角色数据，包括角色之间的关系
 */
router.post('/generate', async (req: Request, res: Response) => {
  try {
    // Gateway 会从 JWT token 中提取 user_id 并通过 x-user-id header 转发
    const userId = req.headers['x-user-id'] as string | undefined;

    const { count, prompt } = req.body;

    // 验证必需参数
    if (!count || typeof count !== 'number' || count <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid count',
        message: 'count must be a positive number',
      });
    }

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Invalid prompt',
        message: 'prompt must be a non-empty string',
      });
    }

    const characterService = new CharacterService();
    const characters = await characterService.generateCharacters(
      { count, prompt: prompt.trim() },
      userId,
      req.query.provider as ProviderType | undefined
    );

    return res.json({
      success: true,
      data: characters,
      message: `Successfully generated ${characters.length} character(s)`,
    });
  } catch (error) {
    console.error('[Character Route] Error generating characters:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate characters',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
