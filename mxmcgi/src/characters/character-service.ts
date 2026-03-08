/**
 * Character核心服务
 * 提供角色的完整生命周期管理：创建、更新、删除、关联任务
 */

import { RepositoryFactory } from '@mxmai/mxmdata';
import type {
  ICharacterRepository,
  Character,
  CreateCharacterDto,
  UpdateCharacterDto,
  CharacterFilters,
} from '@mxmai/mxmdata';
import type { CharacterProfile } from '../core/writing/type';
import { TaskManager } from '../task/task-manager';
import { taskExecutor } from '../task/task-executor';
import { MODEL_MAP } from '../routes/writing';
import type { ProviderType } from '../core/providers/types';
import { selectModel } from '../core/writing/model-selector';
import crypto from 'crypto';

export class CharacterService {
  private characterRepo: ICharacterRepository;
  private taskManager: TaskManager;

  constructor() {
    this.characterRepo = RepositoryFactory.createCharacterRepository();
    this.taskManager = taskExecutor.getTaskManager();
  }

  /**
   * 验证角色是否属于指定用户
   * 由于 Character 接口不包含 user_id，需要通过查询来验证
   */
  private async verifyCharacterOwnership(characterId: string, userId: string): Promise<boolean> {
    const userResult = await this.characterRepo.findAll({
      filters: {
        user_id: userId,
      },
      pagination: {
        page: 1,
        limit: 10000, // 足够大的数量
      },
    });
    
    return userResult.characters.some(c => c.id === characterId);
  }

  /**
   * 从大纲生成任务中保存角色（手动调用）
   * 将 CharacterProfile 转换为新结构并写入角色库。
   * 若传入 outlineTaskId，保存后会 patch 该大纲任务：删除 result.metadata.characters 详情，改为只存 character_ids（与 save-from-writing 行为一致）。
   */
  async saveCharactersFromOutline(
    characters: CharacterProfile[],
    outlineTaskId: string,
    userId: string
  ): Promise<Character[]> {
    const savedCharacters: Character[] = [];

    for (const char of characters) {
      const ageRaw = char.age;
      const ageNum = ageRaw == null ? undefined : typeof ageRaw === 'number'
        ? ageRaw
        : parseInt(String(ageRaw).replace(/\D/g, ''), 10);
      const dto: CreateCharacterDto = {
        user_id: userId,
        name: char.name,
        nickname: char.nickname,
        age: ageNum != null && !isNaN(ageNum) ? ageNum : undefined,
        category: char.category,
        tags: char.tags,
        appearance: {
          description: char.appearance,
        },
        voice: {
          description: char.voice_description,
        },
        clothing_style: {
          description: char.clothing_style,
        },
        others: {
          personality: char.personality,
          ...(typeof (char as any).others === 'object' && (char as any).others ? (char as any).others : {}),
        },
      };

      const character = await this.characterRepo.create(dto);
      savedCharacters.push(character);
    }

    if (outlineTaskId && String(outlineTaskId).trim()) {
      const taskId = String(outlineTaskId).trim();
      try {
        const { task } = await this.taskManager.getTask(taskId);
        if (task && task.metadata?.userId === userId) {
          await this.taskManager.patchTaskResultMetadata(taskId, {
            character_ids: savedCharacters.map((c) => c.id),
            characters: [],
          });
        }
      } catch (e) {
        console.warn('[CharacterService] saveCharactersFromOutline: patch outline task failed', e);
      }
    }

    return savedCharacters;
  }

  /**
   * 从写作任务中保存角色到用户角色库，并更新任务：删除 result.metadata.characters 详情，改为只存 character_ids
   * 之后该写作任务获取角色信息时从 /api/v1/characters 按 character_ids 解析
   */
  async saveCharactersFromWriting(
    characters: CharacterProfile[],
    writingTaskId: string,
    userId: string
  ): Promise<Character[]> {
    const { task } = await this.taskManager.getTask(writingTaskId);
    if (!task) {
      throw new Error(`写作任务不存在: ${writingTaskId}`);
    }
    if (task.metadata?.userId !== userId) {
      throw new Error('无权操作该写作任务');
    }
    const meta = task.result?.metadata ?? {};
    const alreadySavedIds = meta.character_ids as string[] | undefined;
    if (Array.isArray(alreadySavedIds) && alreadySavedIds.length > 0 && !(meta.characters as any[])?.length) {
      // 已保存过：任务里只有 character_ids，无角色详情，直接返回角色库中的角色（不重复创建）
      const list: Character[] = [];
      for (const id of alreadySavedIds) {
        const c = await this.getCharacter(id, userId);
        if (c) list.push(c);
      }
      return list;
    }
    const toSave = Array.isArray(characters) && characters.length > 0
      ? characters
      : (meta.characters as CharacterProfile[] | undefined);
    if (!toSave?.length) {
      throw new Error('没有可保存的角色数据');
    }

    const savedCharacters: Character[] = [];
    for (const char of toSave) {
      const ageRaw = char.age;
      const ageNum = ageRaw == null ? undefined : typeof ageRaw === 'number'
        ? ageRaw
        : parseInt(String(ageRaw).replace(/\D/g, ''), 10);
      const dto: CreateCharacterDto = {
        user_id: userId,
        name: char.name,
        nickname: char.nickname,
        age: ageNum != null && !isNaN(ageNum) ? ageNum : undefined,
        category: char.category,
        tags: char.tags,
        appearance: { description: char.appearance },
        voice: { description: char.voice_description },
        clothing_style: { description: char.clothing_style },
        others: {
          personality: char.personality,
          ...(typeof (char as any).others === 'object' && (char as any).others ? (char as any).others : {}),
        },
      };
      const character = await this.characterRepo.create(dto);
      savedCharacters.push(character);
    }

    await this.taskManager.patchTaskResultMetadata(writingTaskId, {
      character_ids: savedCharacters.map((c) => c.id),
      characters: [], // 删除任务内角色详情，改为从系统角色库按 character_ids 获取
    });

    return savedCharacters;
  }

  /**
   * 关联graph任务到角色的外表图片（appearance.reference_images）
   * 最多支持10张图片
   */
  async linkImageTaskToCharacter(
    characterId: string,
    graphTaskId: string,
    userId: string,
    imageType: 'appearance' | 'clothing_style' = 'appearance'
  ): Promise<Character> {
    // 1. 验证角色属于当前用户
    const character = await this.characterRepo.findById(characterId);
    if (!character) {
      throw new Error(`角色不存在: ${characterId}`);
    }
    const isOwner = await this.verifyCharacterOwnership(characterId, userId);
    if (!isOwner) {
      throw new Error('无权访问此角色');
    }

    // 2. 从任务结果中获取图片URL
    const imageUrl = await this.getMediaUrlFromTask(graphTaskId, 'graph');
    if (!imageUrl) {
      throw new Error(`任务 ${graphTaskId} 没有可用的图片结果`);
    }

    // 3. 获取当前图片数组
    const currentImages = imageType === 'appearance' 
      ? (character.appearance?.reference_images || [])
      : (character.clothing_style?.reference_images || []);

    // 4. 检查是否已存在该URL
    if (currentImages.includes(imageUrl)) {
      throw new Error(`图片URL已经关联到此角色`);
    }

    // 5. 检查是否已达到最大数量（10张）
    if (currentImages.length >= 10) {
      throw new Error('参考图片最多支持10张，请先删除一些图片后再添加');
    }

    // 6. 更新角色
    const updates: UpdateCharacterDto = {
      [imageType]: {
        ...(imageType === 'appearance' ? character.appearance : character.clothing_style),
        reference_images: [...currentImages, imageUrl],
      },
    };

    return await this.characterRepo.update(characterId, updates);
  }

  /**
   * 关联audio任务到角色（补齐声音，Minimax克隆）
   * 更新voice.voice_example
   */
  async linkAudioTaskToCharacter(
    characterId: string,
    audioTaskId: string,
    userId: string,
    cloneVoiceId?: string  // Minimax克隆声音ID
  ): Promise<Character> {
    // 1. 验证角色属于当前用户
    const character = await this.characterRepo.findById(characterId);
    if (!character) {
      throw new Error(`角色不存在: ${characterId}`);
    }
    const isOwner = await this.verifyCharacterOwnership(characterId, userId);
    if (!isOwner) {
      throw new Error('无权访问此角色');
    }

    // 2. 从任务结果中获取音频URL
    const audioUrl = await this.getMediaUrlFromTask(audioTaskId, 'audio');
    if (!audioUrl) {
      throw new Error(`任务 ${audioTaskId} 没有可用的音频结果`);
    }

    // 3. 更新角色
    const updates: UpdateCharacterDto = {
      voice: {
        ...character.voice,
        voice_example: audioUrl,
        ...(cloneVoiceId ? { clone_voiceId: cloneVoiceId } : {}),
      },
    };

    return await this.characterRepo.update(characterId, updates);
  }

  /**
   * 从任务中获取媒体URL的辅助函数
   */
  private async getMediaUrlFromTask(
    taskId: string,
    taskType: 'graph' | 'audio' | 'video'
  ): Promise<string | null> {
    try {
      const taskResponse = await this.taskManager.getTask(taskId);
      if (!taskResponse || !taskResponse.task || !taskResponse.task.result) {
        return null;
      }

      const task = taskResponse.task;

      // 验证任务类型
      if (task.type !== taskType) {
        throw new Error(`任务类型不匹配：期望 ${taskType}，实际 ${task.type}`);
      }

      // 确保 result 存在
      if (!task.result) {
        return null;
      }
      /**
       * 对于“角色画像引用”的场景，前端主要运行在移动端设备上：
       * - 直接返回 MinIO 直链 (http://localhost:9000/...)，在真机/模拟器上往往不可达
       * - URL 里也缺少 taskId 信息，无法在前端关联本地缓存的缩略图
       *
       * 更稳定的做法：统一使用 Gateway 的媒体代理接口：
       *   GET /api/v1/media/{graph|audio|video}/{taskId}
       *
       * 这里通过环境变量 PUBLIC_GATEWAY_ORIGIN 控制对外基础域名，
       * 例如：PUBLIC_GATEWAY_ORIGIN=http://localhost:3000
       */
      const gatewayOrigin = process.env.PUBLIC_GATEWAY_ORIGIN;
      if (gatewayOrigin) {
        const trimmedOrigin = gatewayOrigin.replace(/\/+$/, '');
        const mediaPath =
          taskType === 'graph'
            ? `/api/v1/media/graph/${taskId}`
            : taskType === 'audio'
            ? `/api/v1/media/audio/${taskId}`
            : `/api/v1/media/video/${taskId}`;
        return `${trimmedOrigin}${mediaPath}`;
      }

      // 回退方案：保持旧行为，优先使用 storageInfo.urls，其次 mediaUrls
      if (task.result.storageInfo?.urls && task.result.storageInfo.urls.length > 0) {
        return task.result.storageInfo.urls[0];
      }

      if (task.result.mediaUrls && task.result.mediaUrls.length > 0) {
        return task.result.mediaUrls[0];
      }

      return null;
    } catch (error) {
      console.error(`[CharacterService] 获取任务 ${taskId} 的媒体URL失败:`, error);
      return null;
    }
  }

  /**
   * 获取角色的媒体URL
   * 返回appearance和clothing_style的图片数组，以及voice的示例URL
   */
  async getCharacterMediaUrls(character: Character): Promise<{
    appearance_reference_images?: string[];
    clothing_style_reference_images?: string[];
    voice_example?: string;
  }> {
    return {
      appearance_reference_images: character.appearance?.reference_images || [],
      clothing_style_reference_images: character.clothing_style?.reference_images || [],
      voice_example: character.voice?.voice_example,
    };
  }

  /**
   * 转换为CharacterProfile格式（用于写作模块）
   */
  toCharacterProfile(character: Character): CharacterProfile {
    return {
      id: character.id,
      name: character.name,
      nickname: character.nickname,
      age: character.age?.toString(),
      appearance: character.appearance?.description,
      voice_description: character.voice?.description,
      clothing_style: character.clothing_style?.description,
      personality: character.others?.personality,
      others: character.others?.others,
      category: character.category,
      tags: character.tags,
      relations: (character as any).relations,
    };
  }

  /**
   * 生成角色（使用 LLM）
   * 根据用户提供的提示词批量生成角色数据，包括角色之间的关系
   * 
   * @param params 生成参数
   * @param params.count 需要生成的角色数量
   * @param params.prompt 角色描述提示词
   * @param userId 用户ID（可选）
   * @param provider 模型提供者（可选）
   * @returns 生成的角色数组（不保存到数据库）
   */
  async generateCharacters(
    params: { count: number; prompt: string },
    userId?: string,
    provider?: ProviderType
  ): Promise<CharacterProfile[]> {
    // 1. 选择模型（使用与大纲生成相同的模型选择逻辑）
    const modelName = selectModel('outline');
    const model = MODEL_MAP[modelName];
    if (!model) {
      throw new Error(`模型 "${modelName}" 不存在`);
    }

    // 2. 构建角色生成的 prompt
    const characterPrompt = `请根据以下描述生成 ${params.count} 个角色的详细画像：

${params.prompt}

要求：
1. 生成 ${params.count} 个角色，每个角色需要包含以下信息：
   - id: 唯一标识符（UUID格式）
   - name: 角色名称
   - nickname: 昵称（可选）
   - age: 年龄（字符串格式，如 "24岁"）
   - appearance: 外貌描述
   - voice_description: 声音/台词风格描述
   - clothing_style: 服装风格（可选）
   - personality: 性格标签（可选）
   - others: 其他设定（可选）
   - category: 分类数组（可选）
   - tags: 标签数组（可选）

2. **重要**：根据描述推断角色之间的关系，生成 relations 字段
   - relations 格式：{ [characterId]: { [otherCharacterId]: relation } }
   - 例如：如果角色1和角色2是情侣，则：
     {
       "relations": {
         "角色1的id": { "角色2的id": "情侣" },
         "角色2的id": { "角色1的id": "情侣" }
       }
     }
   - 关系类型示例：情侣、父子、母子、朋友、敌人、同事、师生等
   - 如果无法从描述中推断关系，可以不生成 relations 字段

3. 必须返回完整的、有效的 JSON 对象，格式如下：
{
  "characters": [
    {
      "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      "name": "角色名",
      "nickname": "昵称（可选）",
      "age": "24岁",
      "appearance": "外貌描述",
      "voice_description": "声音/台词风格描述",
      "clothing_style": "服装风格（可选）",
      "personality": "性格标签（可选）",
      "others": "其他设定（可选）",
      "category": ["分类1", "分类2"],
      "tags": ["标签1", "标签2"]
    }
  ],
  "relations": {
    "角色1的id": {
      "角色2的id": "关系描述"
    },
    "角色2的id": {
      "角色1的id": "关系描述"
    }
  }
}

**关键要求**：
1. 必须返回完整的 JSON，不要截断
2. 确保所有大括号、中括号、引号都正确闭合
3. 不要添加任何额外的文字说明
4. 直接返回 JSON 对象，不需要 markdown 代码块包装
5. relations 字段是可选的，如果无法推断关系可以不生成
6. 仅生成上述文本类字段即可，不需要生成图片、视频等多媒体链接或引用`;

    // 3. 调用 LLM 生成
    const result = await model.generate({
      prompt: characterPrompt,
      outputFormat: 'json',
    }, provider);

    if (!result.text) {
      throw new Error('LLM 生成结果为空');
    }

    // 4. 解析 JSON 结果
    try {
      let jsonText = result.text.trim();
      
      // 尝试提取 JSON（可能包含 markdown 代码块）
      const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch && codeBlockMatch[1]) {
        jsonText = codeBlockMatch[1].trim();
      } else {
        // 尝试找到第一个 { 和最后一个 }
        const firstBrace = jsonText.indexOf('{');
        const lastBrace = jsonText.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          jsonText = jsonText.substring(firstBrace, lastBrace + 1);
        }
      }

      const parsed: any = JSON.parse(jsonText);
      
      if (!parsed.characters || !Array.isArray(parsed.characters)) {
        throw new Error('LLM 返回的 JSON 中缺少 characters 数组');
      }

      // 确保每个角色都有 id
      const characters: CharacterProfile[] = parsed.characters.map((c: any) => ({
        ...c,
        id: this.ensureUuid36(c.id),
      }));

      // 处理 relations 字段
      // relations 是全局的，包含所有角色之间的关系
      // 我们需要将全局 relations 合并到返回的角色数据中
      if (parsed.relations && typeof parsed.relations === 'object') {
        // 将全局 relations 添加到返回结果中
        // 注意：relations 格式是 { [characterId]: { [otherCharacterId]: relation } }
        // 我们需要确保 relations 中的 characterId 与生成的角色 id 匹配
        const globalRelations = parsed.relations;
        
        // 创建一个角色 id 到角色对象的映射，用于匹配 relations
        const characterIdMap = new Map<string, CharacterProfile>();
        characters.forEach(char => {
          characterIdMap.set(char.id, char);
          // 也支持通过 name 匹配（向后兼容）
          characterIdMap.set(char.name, char);
        });

        // 将 relations 添加到每个相关角色中
        // 注意：relations 是双向的，我们需要确保两个方向都正确
        Object.keys(globalRelations).forEach((charIdOrName) => {
          const character = characterIdMap.get(charIdOrName);
          if (character && globalRelations[charIdOrName]) {
            // 如果角色还没有 relations 字段，初始化它
            if (!character.relations) {
              character.relations = {};
            }
            // 将关系添加到角色的 relations 中
            Object.keys(globalRelations[charIdOrName]).forEach((otherCharIdOrName) => {
              const otherCharacter = characterIdMap.get(otherCharIdOrName);
              if (otherCharacter) {
                // 使用角色的 id 作为 key
                character.relations![otherCharacter.id] = globalRelations[charIdOrName][otherCharIdOrName];
              }
            });
          }
        });
      }

      return characters;
    } catch (error) {
      console.error('[CharacterService] 解析角色生成 JSON 失败:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`角色生成失败：${errorMessage}。原始结果预览：${result.text.substring(0, 300)}...`);
    }
  }

  /**
   * 确保 ID 是有效的 UUID
   */
  private ensureUuid36(id: unknown): string {
    const s = typeof id === 'string' ? id : '';
    const uuid36 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuid36.test(s) ? s : crypto.randomUUID();
  }

  /**
   * 从角色库取首张参考图 URL（外表优先，其次服装）
   */
  private getFirstReferenceImageUrl(character: Character): string | undefined {
    const url =
      character.appearance?.reference_images?.[0] ??
      character.clothing_style?.reference_images?.[0];
    if (typeof url !== 'string' || !url.trim()) return undefined;
    return url.trim();
  }

  /**
   * 从Character模块获取角色列表（用于写作生成）
   * 返回的 CharacterProfile 会带上 reference_image_url（来自角色库参考图首张），供分镜成片时作形象参考
   */
  async getCharactersForWriting(
    characterIds: string[],
    userId: string
  ): Promise<CharacterProfile[]> {
    const characters: CharacterProfile[] = [];

    for (const id of characterIds) {
      const character = await this.characterRepo.findById(id);
      if (character) {
        const isOwner = await this.verifyCharacterOwnership(id, userId);
        if (isOwner) {
          const profile = this.toCharacterProfile(character);
          const reference_image_url = this.getFirstReferenceImageUrl(character);
          characters.push({ ...profile, ...(reference_image_url ? { reference_image_url } : {}) });
        }
      }
    }

    return characters;
  }

  /**
   * 创建角色
   */
  async createCharacter(dto: CreateCharacterDto): Promise<Character> {
    return await this.characterRepo.create(dto);
  }

  /**
   * 获取角色
   * 注意：Character 接口不包含 user_id（系统字段），需要通过查询时过滤来验证权限
   * 优化：直接使用 findById 获取角色，然后通过额外的查询验证权限
   */
  async getCharacter(id: string, userId: string): Promise<Character | null> {
    // 先通过 findById 获取角色（不包含 user_id）
    const character = await this.characterRepo.findById(id);
    if (!character) {
      return null;
    }
    
    // 验证权限：查询用户自己的角色列表，看是否包含该角色
    const userResult = await this.characterRepo.findAll({
      filters: {
        user_id: userId,
      },
      pagination: {
        page: 1,
        limit: 10000, // 足够大的数量
      },
    });
    
    const userCharacter = userResult.characters.find(c => c.id === id);
    if (userCharacter) {
      return character; // 返回完整数据
    }
    
    // 如果用户自己的角色中找不到，检查是否是公开角色
    if (character.is_public) {
      return character;
    }
    
    return null;
  }

  /**
   * 获取角色列表（简化版，只返回基本信息）
   */
  async listCharacters(
    userId: string,
    filters?: CharacterFilters,
    pagination?: { page: number; limit: number }
  ): Promise<{ characters: Character[]; total: number }> {
    const result = await this.characterRepo.findAll({
      filters: {
        ...filters,
        user_id: userId, // 只查询当前用户的角色
      },
      pagination,
    });

    // 简化列表数据，只返回必要字段
    const simplifiedCharacters = result.characters.map(char => {
      // 提取描述（优先使用 personality，其次 appearance description）
      const description = char.others?.personality || char.appearance?.description || undefined;
      const appearanceImgs = char.appearance?.reference_images?.slice(0, 1) || [];
      const clothingImgs = char.clothing_style?.reference_images?.slice(0, 1) || [];
      // 构建简化的角色对象
      const simplified: Character = {
        id: char.id,
        name: char.name,
        nickname: char.nickname,
        age: char.age,
        category: char.category,
        tags: char.tags,
        is_public: char.is_public,
        // 只返回第一张图片用于列表展示
        appearance: {
          reference_images: appearanceImgs,
        },
        // clothing_style 首张图作为头像备用（与 mobile 一致）
        clothing_style: {
          reference_images: clothingImgs,
        },
        voice: {},
        // 将 description 放入 others.personality 中（如果存在）
        others: description ? { personality: description } : {},
      };
      
      return simplified;
    });

    return {
      characters: simplifiedCharacters,
      total: result.total,
    };
  }

  /**
   * 获取角色详情（完整数据）
   */
  async getCharacterDetail(
    id: string,
    userId: string
  ): Promise<Character | null> {
    const character = await this.getCharacter(id, userId);
    if (!character) {
      return null;
    }

    // 返回完整数据，包括所有字段
    return character;
  }

  /**
   * 更新角色
   */
  async updateCharacter(
    characterId: string,
    updates: UpdateCharacterDto,
    userId: string
  ): Promise<Character> {
    // 验证权限
    const character = await this.characterRepo.findById(characterId);
    if (!character) {
      throw new Error(`角色不存在: ${characterId}`);
    }
    const isOwner = await this.verifyCharacterOwnership(characterId, userId);
    if (!isOwner) {
      throw new Error('无权访问此角色');
    }

    return await this.characterRepo.update(characterId, updates);
  }

  /**
   * 删除角色
   */
  async deleteCharacter(characterId: string, userId: string): Promise<void> {
    // 验证权限
    const character = await this.characterRepo.findById(characterId);
    if (!character) {
      throw new Error(`角色不存在: ${characterId}`);
    }
    const isOwner = await this.verifyCharacterOwnership(characterId, userId);
    if (!isOwner) {
      throw new Error('无权访问此角色');
    }

    await this.characterRepo.delete(characterId);
  }
}
